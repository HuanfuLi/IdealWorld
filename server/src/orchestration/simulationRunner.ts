/**
 * C4: SimulationRunner — main simulation loop (spec §9, Stage 2).
 *
 * Flow per iteration:
 *   1. Check pause/abort flags
 *   2. Emit iteration-start
 *   3. Parallel: collect intents from all alive citizen agents
 *   4. Emit agent-intent for each
 *   5. Central Agent resolves all intents
 *   6. Emit resolution
 *   7. Apply stat deltas + lifecycle events in DB
 *   8. Persist iteration record
 *   9. Emit iteration-complete with stats
 *
 * After all iterations: emit simulation-complete with final report.
 */
import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from '../db/index.js';
import { agentIntents, resolvedActions, iterations as iterationsTable } from '../db/schema.js';
import { asc, eq, sql } from 'drizzle-orm';
import { agentRepo } from '../db/repos/agentRepo.js';
import { sessionRepo } from '../db/repos/sessionRepo.js';
import { getProvider, getCitizenProvider } from '../llm/gateway.js';
import { readSettings } from '../settings.js';
import {
  buildIntentPrompt,
  buildResolutionPrompt,
  buildGroupResolutionMessages,
  buildMergeResolutionMessages,
  buildFinalReportPrompt,
  type AgentIntent,
} from '../llm/prompts.js';
import {
  parseAgentIntentStrict,
  parseResolutionStrict,
  parseGroupResolutionStrict,
  parseMergeResolutionStrict,
  parseFinalReport,
} from '../parsers/simulation.js';
import { runWithConcurrency } from './concurrencyPool.js';
import { asyncLogFlusher } from '../db/asyncLogFlusher.js';
import { resolveAction } from '../mechanics/physicsEngine.js';
import { type ActionCode } from '../mechanics/actionCodes.js';
import { clusterByRole } from './clustering.js';
import { retryWithHealing } from '../llm/retryWithHealing.js';

/** Agents per resolution batch when session is large */
const MAPREDUCE_THRESHOLD = 30;
const BATCH_SIZE = 15;

/** Gini coefficient: 0 = perfect equality, 1 = perfect inequality */
function gini(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += Math.abs(values[i] - values[j]);
    }
  }
  return Math.round((sum / (2 * n * n * mean)) * 100) / 100;
}
import { simulationManager } from './simulationManager.js';
import type { Agent, IterationStats } from '@idealworld/shared';

function computeStats(agents: Agent[], iterationNumber: number): IterationStats {
  const alive = agents.filter(a => a.isAlive);
  if (alive.length === 0) {
    return {
      iterationNumber,
      avgWealth: 0, avgHealth: 0, avgHappiness: 0,
      minWealth: 0, maxWealth: 0,
      minHealth: 0, maxHealth: 0,
      minHappiness: 0, maxHappiness: 0,
      aliveCount: 0,
      totalCount: agents.length,
      giniWealth: 0,
      giniHappiness: 0,
    };
  }
  const wArr = alive.map(a => a.currentStats.wealth);
  const hArr = alive.map(a => a.currentStats.health);
  const hapArr = alive.map(a => a.currentStats.happiness);
  return {
    iterationNumber,
    avgWealth: Math.round(wArr.reduce((s, v) => s + v, 0) / alive.length),
    avgHealth: Math.round(hArr.reduce((s, v) => s + v, 0) / alive.length),
    avgHappiness: Math.round(hapArr.reduce((s, v) => s + v, 0) / alive.length),
    minWealth: Math.min(...wArr), maxWealth: Math.max(...wArr),
    minHealth: Math.min(...hArr), maxHealth: Math.max(...hArr),
    minHappiness: Math.min(...hapArr), maxHappiness: Math.max(...hapArr),
    aliveCount: alive.length,
    totalCount: agents.length,
    giniWealth: gini(wArr),
    giniHappiness: gini(hapArr),
  };
}

export async function runSimulation(sessionId: string, totalIterations: number): Promise<void> {
  const settings = readSettings();
  const provider = getProvider();
  const citizenProv = getCitizenProvider();
  const summaries: Array<{ number: number; summary: string }> = [];

  try {
    asyncLogFlusher.start();
    simulationManager.start(sessionId);
    await sessionRepo.updateStage(sessionId, 'simulating');

    const session = await sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    let agents = await agentRepo.listBySession(sessionId);
    let previousSummary: string | null = null;

    // Support continuation: find max existing iteration number
    const [maxRow] = await db.select({ max: sql<number>`max(${iterationsTable.iterationNumber})` })
      .from(iterationsTable).where(eq(iterationsTable.sessionId, sessionId));
    const startIter = (maxRow?.max ?? 0) + 1;
    const endIter = startIter + totalIterations - 1;

    // Load previous summaries for final report if continuing
    if (startIter > 1) {
      const prevIters = await db.select({
        iterationNumber: iterationsTable.iterationNumber,
        stateSummary: iterationsTable.stateSummary,
      }).from(iterationsTable)
        .where(eq(iterationsTable.sessionId, sessionId))
        .orderBy(asc(iterationsTable.iterationNumber));
      for (const pi of prevIters) {
        summaries.push({ number: pi.iterationNumber, summary: pi.stateSummary });
      }
      // Set previousSummary to last existing iteration's summary
      if (prevIters.length > 0) {
        previousSummary = prevIters[prevIters.length - 1].stateSummary;
      }
    }

    for (let iterNum = startIter; iterNum <= endIter; iterNum++) {
      // ── Abort check ──────────────────────────────────────────────────────
      if (simulationManager.isAbortRequested(sessionId)) {
        asyncLogFlusher.stop();
        simulationManager.broadcast(sessionId, { type: 'error', message: 'Simulation aborted.' });
        await sessionRepo.updateStage(sessionId, 'design-review');
        simulationManager.finish(sessionId);
        return;
      }

      // ── Pause handling ───────────────────────────────────────────────────
      if (simulationManager.isPauseRequested(sessionId)) {
        simulationManager.setPaused(sessionId);
        simulationManager.broadcast(sessionId, { type: 'paused', iteration: iterNum - 1 });
        await sessionRepo.updateStage(sessionId, 'simulation-paused');

        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            const status = simulationManager.getStatus(sessionId);
            if (status === 'running' || simulationManager.isAbortRequested(sessionId)) {
              clearInterval(check);
              resolve();
            }
          }, 500);
        });

        if (simulationManager.isAbortRequested(sessionId)) {
          asyncLogFlusher.stop();
          simulationManager.broadcast(sessionId, { type: 'error', message: 'Simulation aborted.' });
          await sessionRepo.updateStage(sessionId, 'design-review');
          simulationManager.finish(sessionId);
          return;
        }
        await sessionRepo.updateStage(sessionId, 'simulating');
      }

      // ── Iteration start ──────────────────────────────────────────────────
      simulationManager.broadcast(sessionId, {
        type: 'iteration-start',
        iteration: iterNum,
        total: endIter,
      });

      // ── Collect intents (parallel) ───────────────────────────────────────
      const aliveAgents = agents.filter(a => a.isAlive && !a.isCentralAgent);
      const iterationId = uuidv4();
      const now = new Date().toISOString();

      const intentTasks = aliveAgents.map(agent => async (): Promise<AgentIntent> => {
        const messages = buildIntentPrompt(agent, session, previousSummary, iterNum);
        const fallbackIntent: AgentIntent = {
          agentId: agent.id, agentName: agent.name,
          intent: `${agent.name} continues their routine.`, reasoning: '',
          actionCode: 'NONE', actionTarget: null,
        };
        const parsed = await retryWithHealing({
          provider: citizenProv,
          messages,
          options: { model: settings.citizenAgentModel },
          parse: (raw) => {
            const p = parseAgentIntentStrict(raw);
            return {
              agentId: agent.id, agentName: agent.name,
              intent: p.intent, reasoning: p.reasoning,
              actionCode: p.actionCode, actionTarget: p.actionTarget,
            } as AgentIntent;
          },
          fallback: fallbackIntent,
          label: `intent:${agent.name}`,
        });
        return parsed;
      });

      const intents = await runWithConcurrency(intentTasks, settings.maxConcurrency);

      // Broadcast intents to SSE clients
      for (const intent of intents) {
        simulationManager.broadcast(sessionId, {
          type: 'agent-intent',
          agentId: intent.agentId,
          agentName: intent.agentName,
          intent: intent.intent,
        });
      }

      // Enqueue intent rows for async batch flush (non-blocking)
      const intentCols = ['id', 'session_id', 'agent_id', 'iteration_id', 'intent', 'reasoning', 'created_at'];
      for (const intent of intents) {
        asyncLogFlusher.enqueue('agent_intents', intentCols, [
          uuidv4(), sessionId, intent.agentId, iterationId,
          intent.intent, intent.reasoning, now,
        ]);
      }

      // ── Central Agent resolves (standard or map-reduce) ──────────────────
      let resolution: import('../parsers/simulation.js').ParsedResolution;

      if (aliveAgents.length > MAPREDUCE_THRESHOLD) {
        // ── Map-Reduce path for large sessions (role-based clustering) ──
        const allIntentsBrief = intents
          .map(i => `- ${i.agentName}: ${i.intent.slice(0, 80)}`)
          .join('\n');

        const groups = clusterByRole(aliveAgents, BATCH_SIZE);
        const groupTasks = groups.map((group, gi) => async () => {
          const groupIntents = intents.filter(i => group.some(a => a.id === i.agentId));
          const msgs = buildGroupResolutionMessages(session, group, groupIntents, allIntentsBrief, iterNum, previousSummary);
          // Use citizenAgentModel for group coordinators (cheaper); merge step keeps centralAgentModel
          return retryWithHealing({
            provider: citizenProv,
            messages: msgs,
            options: { model: settings.citizenAgentModel },
            parse: parseGroupResolutionStrict,
            fallback: { groupSummary: 'The group continued their activities.', agentOutcomes: [], lifecycleEvents: [] },
            label: `groupResolution:${gi}`,
          });
        });

        const groupResults = await runWithConcurrency(groupTasks, settings.maxConcurrency);

        // Merge step: synthesise group summaries into a society-wide narrative
        const groupSummaries = groupResults.map(r => r.groupSummary);
        const mergeMessages = buildMergeResolutionMessages(session, groupSummaries, iterNum, previousSummary);
        const mergeResult = await retryWithHealing({
          provider,
          messages: mergeMessages,
          options: { model: settings.centralAgentModel },
          parse: parseMergeResolutionStrict,
          fallback: { narrativeSummary: 'The iteration passed.', lifecycleEvents: [] },
          label: 'mergeResolution',
        });

        resolution = {
          narrativeSummary: mergeResult.narrativeSummary,
          agentOutcomes: groupResults.flatMap(r => r.agentOutcomes),
          // Merge lifecycle events from all groups + merge result (deduplicate by agentId+type)
          lifecycleEvents: [
            ...groupResults.flatMap(r => r.lifecycleEvents),
            ...mergeResult.lifecycleEvents,
          ],
        };
      } else {
        // ── Standard path ────────────────────────────────────────────────
        const resolutionMessages = buildResolutionPrompt(session, agents, intents, iterNum, previousSummary);
        resolution = await retryWithHealing({
          provider,
          messages: resolutionMessages,
          options: { model: settings.centralAgentModel },
          parse: parseResolutionStrict,
          fallback: { narrativeSummary: 'The iteration passed without major events.', agentOutcomes: [], lifecycleEvents: [] },
          label: 'resolution',
        });
      }

      simulationManager.broadcast(sessionId, {
        type: 'resolution',
        iteration: iterNum,
        narrativeSummary: resolution.narrativeSummary,
        lifecycleEvents: resolution.lifecycleEvents,
      });

      // ── Build actionCode map from intents ──────────────────────────────
      const intentMap = new Map(intents.map(i => [i.agentId, i]));

      // ── Apply physics engine + LLM narrative outcomes ─────────────────
      const outcomeMap = new Map(resolution.agentOutcomes.map(o => [o.agentId, o]));

      const statUpdates: Array<{ id: string; wealth: number; health: number; happiness: number; cortisol: number; dopamine: number }> = [];
      const deaths: Array<{ id: string; iterationNumber: number }> = [];
      const actionRows: Array<typeof resolvedActions.$inferInsert> = [];

      for (const agent of aliveAgents) {
        const outcome = outcomeMap.get(agent.id);
        const agentIntent = intentMap.get(agent.id);

        // Resolve action code via physics engine
        const actionCode = (agentIntent?.actionCode ?? 'NONE') as ActionCode;

        // Resolve actionTarget: match target name to agent ID
        let actionTargetId: string | undefined;
        if (agentIntent?.actionTarget) {
          const targetName = agentIntent.actionTarget.toLowerCase();
          const targetAgent = aliveAgents.find(a => a.name.toLowerCase() === targetName);
          actionTargetId = targetAgent?.id;
        }

        const physics = resolveAction({
          agent,
          actionCode,
          actionTarget: actionTargetId,
          allAgents: aliveAgents,
        });

        const newWealth = agent.currentStats.wealth + physics.wealthDelta;
        const newHealth = agent.currentStats.health + physics.healthDelta;
        const newHappiness = agent.currentStats.happiness + physics.happinessDelta;
        const newCortisol = (agent.currentStats.cortisol ?? 20) + physics.cortisolDelta;
        const newDopamine = (agent.currentStats.dopamine ?? 50) + physics.dopamineDelta;

        const shouldDie = (outcome?.died === true) || newHealth <= 0;

        if (shouldDie) {
          deaths.push({ id: agent.id, iterationNumber: iterNum });
        } else {
          statUpdates.push({
            id: agent.id,
            wealth: newWealth,
            health: newHealth,
            happiness: newHappiness,
            cortisol: newCortisol,
            dopamine: newDopamine,
          });
        }

        actionRows.push({
          id: uuidv4(),
          sessionId,
          agentId: agent.id,
          iterationId,
          action: outcome?.outcome ?? agentIntent?.intent ?? 'No action.',
          outcome: JSON.stringify({
            text: outcome?.outcome ?? agentIntent?.intent ?? 'No action.',
            wealthDelta: physics.wealthDelta,
            healthDelta: physics.healthDelta,
            happinessDelta: physics.happinessDelta,
          }),
          resolvedAt: now,
        });
      }

      // Stat updates + deaths are critical (next iteration reads them) → synchronous batch
      sqlite.transaction(() => {
        if (statUpdates.length > 0) {
          agentRepo.bulkUpdateStats(statUpdates);
        }
        if (deaths.length > 0) {
          agentRepo.bulkMarkDead(deaths);
        }
      })();

      // Resolved-action rows are log data → enqueue for async flush
      const actionCols = ['id', 'session_id', 'agent_id', 'iteration_id', 'action', 'outcome', 'resolved_at'];
      for (const row of actionRows) {
        asyncLogFlusher.enqueue('resolved_actions', actionCols, [
          row.id, row.sessionId, row.agentId, row.iterationId,
          row.action, row.outcome, row.resolvedAt,
        ]);
      }

      // Reload agents after updates
      agents = await agentRepo.listBySession(sessionId);

      // ── Persist iteration record ─────────────────────────────────────────
      const stats = computeStats(agents, iterNum);
      await db.insert(iterationsTable).values({
        id: iterationId,
        sessionId,
        iterationNumber: iterNum,
        stateSummary: resolution.narrativeSummary,
        statistics: JSON.stringify(stats),
        lifecycleEvents: JSON.stringify(resolution.lifecycleEvents),
        timestamp: now,
      });

      summaries.push({ number: iterNum, summary: resolution.narrativeSummary });
      previousSummary = resolution.narrativeSummary;

      simulationManager.broadcast(sessionId, {
        type: 'iteration-complete',
        iteration: iterNum,
        stats: stats as unknown as Record<string, unknown>,
      });
    }

    // ── Final report ─────────────────────────────────────────────────────────
    const finalStats = computeStats(agents, endIter);
    const finalMessages = buildFinalReportPrompt(session, summaries, {
      aliveCount: finalStats.aliveCount,
      avgWealth: finalStats.avgWealth,
      avgHealth: finalStats.avgHealth,
      avgHappiness: finalStats.avgHappiness,
    });
    let finalReport = '';
    try {
      const finalRaw = await provider.chat(finalMessages, { model: settings.centralAgentModel });
      finalReport = parseFinalReport(finalRaw);
    } catch {
      finalReport = `The simulation of "${session.idea}" concluded after ${endIter} iterations with ${finalStats.aliveCount} survivors.`;
    }

    // Drain all pending log writes before finishing
    asyncLogFlusher.stop();

    await sessionRepo.updateStage(sessionId, 'simulation-complete');
    simulationManager.broadcast(sessionId, { type: 'simulation-complete', finalReport });
    simulationManager.finish(sessionId);
  } catch (err) {
    asyncLogFlusher.stop();
    const message = err instanceof Error ? err.message : 'Simulation error';
    simulationManager.broadcast(sessionId, { type: 'error', message });
    simulationManager.finish(sessionId);
    console.error(`[SimulationRunner] Session ${sessionId}:`, err);
  }
}
