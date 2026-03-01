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
import { agentRepo } from '../db/repos/agentRepo.js';
import { sessionRepo } from '../db/repos/sessionRepo.js';
import { getProvider } from '../llm/gateway.js';
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
  parseAgentIntent,
  parseResolution,
  parseGroupResolution,
  parseMergeResolution,
  parseFinalReport,
} from '../parsers/simulation.js';
import { runWithConcurrency } from './concurrencyPool.js';
import { asyncLogFlusher } from '../db/asyncLogFlusher.js';

/** Agents per resolution batch when session is large */
const MAPREDUCE_THRESHOLD = 30;
const BATCH_SIZE = 15;

function chunk<T>(arr: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    groups.push(arr.slice(i, i + size));
  }
  return groups;
}

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
  const summaries: Array<{ number: number; summary: string }> = [];

  try {
    asyncLogFlusher.start();
    simulationManager.start(sessionId);
    await sessionRepo.updateStage(sessionId, 'simulating');

    const session = await sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    let agents = await agentRepo.listBySession(sessionId);
    let previousSummary: string | null = null;

    for (let iterNum = 1; iterNum <= totalIterations; iterNum++) {
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
        total: totalIterations,
      });

      // ── Collect intents (parallel) ───────────────────────────────────────
      const aliveAgents = agents.filter(a => a.isAlive && !a.isCentralAgent);
      const iterationId = uuidv4();
      const now = new Date().toISOString();

      const intentTasks = aliveAgents.map(agent => async (): Promise<AgentIntent> => {
        try {
          const messages = buildIntentPrompt(agent, session, previousSummary, iterNum);
          const raw = await provider.chat(messages, { model: settings.citizenAgentModel });
          const parsed = parseAgentIntent(raw);
          return { agentId: agent.id, agentName: agent.name, intent: parsed.intent, reasoning: parsed.reasoning };
        } catch {
          return { agentId: agent.id, agentName: agent.name, intent: `${agent.name} continues their routine.`, reasoning: '' };
        }
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
        // ── Map-Reduce path for large sessions ───────────────────────────
        const allIntentsBrief = intents
          .map(i => `- ${i.agentName}: ${i.intent.slice(0, 80)}`)
          .join('\n');

        const groups = chunk(aliveAgents, BATCH_SIZE);
        const groupTasks = groups.map(group => async () => {
          const groupIntents = intents.filter(i => group.some(a => a.id === i.agentId));
          const msgs = buildGroupResolutionMessages(session, group, groupIntents, allIntentsBrief, iterNum, previousSummary);
          const raw = await provider.chat(msgs, { model: settings.centralAgentModel });
          return parseGroupResolution(raw);
        });

        const groupResults = await runWithConcurrency(groupTasks, settings.maxConcurrency);

        // Merge step: synthesise group summaries into a society-wide narrative
        const groupSummaries = groupResults.map(r => r.groupSummary);
        const mergeMessages = buildMergeResolutionMessages(session, groupSummaries, iterNum, previousSummary);
        const mergeRaw = await provider.chat(mergeMessages, { model: settings.centralAgentModel });
        const mergeResult = parseMergeResolution(mergeRaw);

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
        const resolutionRaw = await provider.chat(resolutionMessages, { model: settings.centralAgentModel });
        resolution = parseResolution(resolutionRaw);
      }

      simulationManager.broadcast(sessionId, {
        type: 'resolution',
        iteration: iterNum,
        narrativeSummary: resolution.narrativeSummary,
        lifecycleEvents: resolution.lifecycleEvents,
      });

      // ── Apply outcomes in DB (batched) ──────────────────────────────────
      const outcomeMap = new Map(resolution.agentOutcomes.map(o => [o.agentId, o]));

      const statUpdates: Array<{ id: string; wealth: number; health: number; happiness: number }> = [];
      const deaths: Array<{ id: string; iterationNumber: number }> = [];
      const actionRows: Array<typeof resolvedActions.$inferInsert> = [];

      for (const agent of aliveAgents) {
        const outcome = outcomeMap.get(agent.id);
        if (!outcome) continue;

        const newHealth = agent.currentStats.health + outcome.healthDelta;
        const shouldDie = outcome.died || newHealth <= 0;

        if (shouldDie) {
          deaths.push({ id: agent.id, iterationNumber: iterNum });
        } else {
          statUpdates.push({
            id: agent.id,
            wealth: agent.currentStats.wealth + outcome.wealthDelta,
            health: newHealth,
            happiness: agent.currentStats.happiness + outcome.happinessDelta,
          });
        }

        actionRows.push({
          id: uuidv4(),
          sessionId,
          agentId: agent.id,
          iterationId,
          action: outcome.outcome,
          outcome: JSON.stringify({
            text: outcome.outcome,
            wealthDelta: outcome.wealthDelta,
            healthDelta: outcome.healthDelta,
            happinessDelta: outcome.happinessDelta,
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
    const finalStats = computeStats(agents, totalIterations);
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
      finalReport = `The simulation of "${session.idea}" concluded after ${totalIterations} iterations with ${finalStats.aliveCount} survivors.`;
    }

    // Drain all pending log writes before finishing
    asyncLogFlusher.stop();

    await sessionRepo.updateStage(sessionId, 'reflecting');
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
