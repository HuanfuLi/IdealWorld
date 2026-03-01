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
import { db } from '../db/index.js';
import { agentIntents, resolvedActions, iterations as iterationsTable } from '../db/schema.js';
import { agentRepo } from '../db/repos/agentRepo.js';
import { sessionRepo } from '../db/repos/sessionRepo.js';
import { getProvider } from '../llm/gateway.js';
import { readSettings } from '../settings.js';
import {
  buildIntentPrompt,
  buildResolutionPrompt,
  buildFinalReportPrompt,
  type AgentIntent,
} from '../llm/prompts.js';
import { parseAgentIntent, parseResolution, parseFinalReport } from '../parsers/simulation.js';
import { runWithConcurrency } from './concurrencyPool.js';
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
  };
}

export async function runSimulation(sessionId: string, totalIterations: number): Promise<void> {
  const settings = readSettings();
  const provider = getProvider();
  const summaries: Array<{ number: number; summary: string }> = [];

  try {
    simulationManager.start(sessionId);
    await sessionRepo.updateStage(sessionId, 'simulating');

    const session = await sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    let agents = await agentRepo.listBySession(sessionId);
    let previousSummary: string | null = null;

    for (let iterNum = 1; iterNum <= totalIterations; iterNum++) {
      // ── Abort check ──────────────────────────────────────────────────────
      if (simulationManager.isAbortRequested(sessionId)) {
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

      // Persist intents and broadcast
      for (const intent of intents) {
        simulationManager.broadcast(sessionId, {
          type: 'agent-intent',
          agentId: intent.agentId,
          agentName: intent.agentName,
          intent: intent.intent,
        });
        await db.insert(agentIntents).values({
          id: uuidv4(),
          sessionId,
          agentId: intent.agentId,
          iterationId,
          intent: intent.intent,
          reasoning: intent.reasoning,
          createdAt: now,
        });
      }

      // ── Central Agent resolves ───────────────────────────────────────────
      const resolutionMessages = buildResolutionPrompt(session, agents, intents, iterNum, previousSummary);
      const resolutionRaw = await provider.chat(resolutionMessages, { model: settings.centralAgentModel });
      const resolution = parseResolution(resolutionRaw);

      simulationManager.broadcast(sessionId, {
        type: 'resolution',
        iteration: iterNum,
        narrativeSummary: resolution.narrativeSummary,
        lifecycleEvents: resolution.lifecycleEvents,
      });

      // ── Apply outcomes in DB ─────────────────────────────────────────────
      const outcomeMap = new Map(resolution.agentOutcomes.map(o => [o.agentId, o]));

      for (const agent of aliveAgents) {
        const outcome = outcomeMap.get(agent.id);
        if (!outcome) continue;

        const newHealth = agent.currentStats.health + outcome.healthDelta;
        const shouldDie = outcome.died || newHealth <= 0;

        if (shouldDie) {
          await agentRepo.markDead(agent.id, iterNum);
        } else {
          await agentRepo.updateStats(
            agent.id,
            agent.currentStats.wealth + outcome.wealthDelta,
            newHealth,
            agent.currentStats.happiness + outcome.happinessDelta
          );
        }

        await db.insert(resolvedActions).values({
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

    await sessionRepo.updateStage(sessionId, 'reflecting');
    simulationManager.broadcast(sessionId, { type: 'simulation-complete', finalReport });
    simulationManager.finish(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulation error';
    simulationManager.broadcast(sessionId, { type: 'error', message });
    simulationManager.finish(sessionId);
    console.error(`[SimulationRunner] Session ${sessionId}:`, err);
  }
}
