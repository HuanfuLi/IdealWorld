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
  buildNaturalIntentPrompt,
  buildResolutionPrompt,
  buildGroupResolutionMessages,
  buildMergeResolutionMessages,
  buildFinalReportPrompt,
  buildPostMortemPrompt,
  type AgentIntent,
  type PostMortemInput,
} from '../llm/prompts.js';
import {
  parseAgentIntentStrict,
  parseResolutionStrict,
  parseGroupResolutionStrict,
  parseMergeResolutionStrict,
  parseFinalReport,
  parseSinglePassIntent,
} from '../parsers/simulation.js';
import { runWithConcurrency } from './concurrencyPool.js';
import { asyncLogFlusher } from '../db/asyncLogFlusher.js';
import { resolveAction } from '../mechanics/physicsEngine.js';
import { type ActionCode, getAllowedActions, getRoleTier } from '../mechanics/actionCodes.js';
import { clusterByRole } from './clustering.js';
import { retryWithHealing } from '../llm/retryWithHealing.js';
// Phase 1 Economy imports
import { runEconomyIteration, initializeAgentEconomy, cleanupSessionEconomy, type EconomyAgentInput } from '../mechanics/economyEngine.js';
import { economyRepo, type AgentEconomyState } from '../db/repos/economyRepo.js';
import type { SkillMatrix, Inventory } from '@idealworld/shared';
import { DEFAULT_SKILL_MATRIX, DEFAULT_INVENTORY } from '@idealworld/shared';
import { v4 as ecoUuid } from 'uuid';
// Phase 3 Cognitive Engine imports
import {
  runCognitivePreProcessing,
  runCognitivePostProcessing,
  cleanupSessionCognition,
  type CognitivePreInput,
  type CognitivePostInput,
} from '../cognition/cognitiveEngine.js';

/**
 * Thrown when intent parsing is exhausted (all retries used) for a specific agent.
 * Caught by the outer simulation loop to pause cleanly rather than silently defaulting to REST.
 */
export class SimulationPausedError extends Error {
  constructor(
    public readonly reason: 'parse-failure' | 'context-overflow',
    public readonly iterationNumber: number,
    public readonly agentId: string,
    public readonly agentName: string,
    message: string,
  ) {
    super(message);
    this.name = 'SimulationPausedError';
  }
}

/** Regex to identify context-length errors from LLM providers */
const CONTEXT_OVERFLOW_RE = /context.?length|maximum.?context|maximum.?token|token.?limit|too.?long|exceeds.?context|context.?window|context_length_exceeded/i;

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
      avgCortisol: 0,
      avgDopamine: 0,
    };
  }
  const wArr = alive.map(a => a.currentStats.wealth);
  const hArr = alive.map(a => a.currentStats.health);
  const hapArr = alive.map(a => a.currentStats.happiness);
  const cortArr = alive.map(a => a.currentStats.cortisol ?? 0);
  const dopArr = alive.map(a => a.currentStats.dopamine ?? 0);
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
    avgCortisol: Math.round(cortArr.reduce((s, v) => s + v, 0) / alive.length),
    avgDopamine: Math.round(dopArr.reduce((s, v) => s + v, 0) / alive.length),
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

    // Phase 2: Track active sabotage effects → targetAgentId → remaining iterations
    const sabotageRegistry = new Map<string, number>();
    // Phase 3: Track active suppress effects → targetAgentId → remaining iterations
    const suppressRegistry = new Map<string, number>();
    // Phase 2: Track death reasons for post-mortem system → agentId → { iteration, reason }
    const deathReasonMap = new Map<string, { iteration: number; reason: string }>();
    // Phase 3: Regime collapse tracking
    let collapseReason: string | null = null;
    let collapseIteration = 0;

    // ── Phase 1: Initialize economy state for all agents ──────────────────
    const citizenAgents = agents.filter(a => a.isAlive && !a.isCentralAgent);
    await economyRepo.initializeForSession(
      sessionId,
      citizenAgents.map(a => ({ id: a.id, role: a.role }))
    );
    let agentEconomyMap = new Map<string, AgentEconomyState>();
    const econStates = await economyRepo.listBySession(sessionId);
    for (const state of econStates) {
      agentEconomyMap.set(state.agentId, state);
    }

    // Support continuation: find max existing iteration number
    const [maxRow] = await db.select({ max: sql<number>`max(${iterationsTable.iterationNumber})` })
      .from(iterationsTable).where(eq(iterationsTable.sessionId, sessionId));
    const startIter = (maxRow?.max ?? 0) + 1;
    const endIter = startIter + totalIterations - 1;

    // ── Phase 2: Darwinian Market Protocol — Genesis Endowment ────────────
    // Override default food surplus (10) with scarce starting ration (3)
    // to force immediate market participation and prevent trivial first iterations.
    // Minimum wealth floor of 20 ensures agents can buy at least one round of food.
    if (startIter === 1) {
      const genesisUpdates: Array<{ agentId: string; sessionId: string; skills: import('@idealworld/shared').SkillMatrix; inventory: import('@idealworld/shared').Inventory; lastUpdated: number }> = [];
      for (const [agentId, econState] of agentEconomyMap) {
        const updatedInventory = {
          ...econState.inventory,
          food: { ...econState.inventory?.food, quantity: 3, quality: 100 },
        } as import('@idealworld/shared').Inventory;
        genesisUpdates.push({
          agentId,
          sessionId,
          skills: econState.skills,
          inventory: updatedInventory,
          lastUpdated: 0,
        });
        agentEconomyMap.set(agentId, { ...econState, inventory: updatedInventory });
      }
      if (genesisUpdates.length > 0) {
        await economyRepo.bulkUpsertAgentEconomy(genesisUpdates);
      }
      // Apply wealth floor: any agent below 20 wealth gets topped up
      const wealthFloorUpdates = agents
        .filter(a => a.isAlive && !a.isCentralAgent && a.currentStats.wealth < 20)
        .map(a => ({
          id: a.id,
          wealth: 20,
          health: a.currentStats.health,
          happiness: a.currentStats.happiness,
          cortisol: a.currentStats.cortisol ?? 20,
          dopamine: a.currentStats.dopamine ?? 50,
        }));
      if (wealthFloorUpdates.length > 0) {
        sqlite.transaction(() => { agentRepo.bulkUpdateStats(wealthFloorUpdates); })();
        agents = await agentRepo.listBySession(sessionId);
      }
    }

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
        cleanupSessionEconomy(sessionId);
        cleanupSessionCognition(sessionId);
        if (simulationManager.isResetRequested(sessionId)) {
          // The abort-reset endpoint already cleaned the DB and set the stage.
          // Just exit — do not overwrite the stage with 'simulation-complete'.
          simulationManager.broadcast(sessionId, { type: 'aborted-reset' });
        } else {
          simulationManager.broadcast(sessionId, { type: 'error', message: 'Simulation aborted.' });
          await sessionRepo.updateStage(sessionId, 'simulation-complete');
        }
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
          cleanupSessionEconomy(sessionId);
          cleanupSessionCognition(sessionId);
          if (simulationManager.isResetRequested(sessionId)) {
            simulationManager.broadcast(sessionId, { type: 'aborted-reset' });
          } else {
            simulationManager.broadcast(sessionId, { type: 'error', message: 'Simulation aborted.' });
            await sessionRepo.updateStage(sessionId, 'simulation-complete');
          }
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

      // Phase 2/3: Decay status effect registries at the start of each iteration
      for (const [agentId, remaining] of sabotageRegistry) {
        if (remaining <= 1) sabotageRegistry.delete(agentId);
        else sabotageRegistry.set(agentId, remaining - 1);
      }
      for (const [agentId, remaining] of suppressRegistry) {
        if (remaining <= 1) suppressRegistry.delete(agentId);
        else suppressRegistry.set(agentId, remaining - 1);
      }

      // ── Collect intents: Phase 2+3 cognitive → natural language → parser ──
      const aliveAgents = agents.filter(a => a.isAlive && !a.isCentralAgent);
      const isFirstIteration = iterNum === startIter && startIter === 1;
      const iterationId = uuidv4();
      const now = new Date().toISOString();
      const aliveAgentNames = aliveAgents.map(a => a.name);

      // ── Phase 3: Cognitive pre-processing (memories, reflections, planning) ──
      const cognitiveInputs: CognitivePreInput[] = aliveAgents.map(agent => {
        const econState = agentEconomyMap.get(agent.id);
        return {
          agentId: agent.id,
          agentName: agent.name,
          agentRole: agent.role,
          currentStats: {
            wealth: agent.currentStats.wealth,
            health: agent.currentStats.health,
            happiness: agent.currentStats.happiness,
          },
          isStarving: (econState?.inventory?.food?.quantity ?? 10) <= 0,
        };
      });

      const cognitiveOutputs = await runCognitivePreProcessing(
        sessionId, iterNum, cognitiveInputs, citizenProv,
        { model: settings.citizenAgentModel },
        settings.maxConcurrency,
      );

      // Single-pass structured intent collection (replaces two-step natural language → parser flow)
      const intentTasks = aliveAgents.map(agent => async (): Promise<AgentIntent> => {
        try {
          // Build economy context for the agent
          const econState = agentEconomyMap.get(agent.id);
          let economyContext: { foodLevel: number; toolCount: number; topSkills: string; isStarving: boolean } | undefined;
          if (econState) {
            const inv = econState.inventory;
            const skills = econState.skills;
            const skillEntries = Object.entries(skills)
              .map(([k, v]) => ({ name: k, level: (v as { level: number }).level }))
              .sort((a, b) => b.level - a.level)
              .slice(0, 3);
            const topSkills = skillEntries.map(s => `${s.name}: ${Math.round(s.level)}`).join(', ');
            economyContext = {
              foodLevel: inv?.food?.quantity ?? 10,
              toolCount: inv?.tools?.quantity ?? 1,
              topSkills,
              isStarving: (inv?.food?.quantity ?? 10) <= 0,
            };
          }

          // Phase 3: Get cognitive context for this agent
          const cogOutput = cognitiveOutputs.get(agent.id);
          const cognitiveContext = cogOutput ? {
            memoryContext: cogOutput.memoryContext,
            currentPlanStep: cogOutput.currentPlanStep,
            planGoal: cogOutput.planGoal,
            reflectionText: cogOutput.reflectionText,
          } : undefined;

          // Single-pass: one LLM call returns structured JSON with narrative + actionCode.
          // Phase 3: pass role-restricted action set so elite agents see privileged actions.
          const messages = buildNaturalIntentPrompt(
            agent, session, previousSummary, iterNum,
            economyContext, cognitiveContext, isFirstIteration, aliveAgentNames,
            getAllowedActions(agent.role),
          );

          // throwOnExhaustion: true — after all retries, throw instead of silently defaulting to REST.
          // This surfaces parse/context failures so the simulation can pause rather than
          // produce meaningless REST-filled iterations ("zombie simulation").
          const parsed = await retryWithHealing({
            provider: citizenProv,
            messages,
            options: { model: settings.citizenAgentModel },
            parse: parseSinglePassIntent,
            fallback: { intent: '', reasoning: '', actionCode: 'REST' as ActionCode, actionTarget: null },
            throwOnExhaustion: true,
            label: `intent:${agent.name}`,
          });

          return {
            agentId: agent.id,
            agentName: agent.name,
            intent: parsed.intent.slice(0, 500),
            reasoning: parsed.reasoning,
            actionCode: parsed.actionCode,
            actionTarget: parsed.actionTarget,
            parseMethod: 'structured',
          };
        } catch (err) {
          // Wrap any error as SimulationPausedError so the outer loop can pause cleanly.
          // This prevents a single failing agent from silently dragging all others into REST.
          const msg = err instanceof Error ? err.message : String(err);
          const isCtx = CONTEXT_OVERFLOW_RE.test(msg);
          throw new SimulationPausedError(
            isCtx ? 'context-overflow' : 'parse-failure',
            iterNum, agent.id, agent.name,
            `Simulation paused: ${isCtx ? 'context length exceeded' : 'parser failure'} for "${agent.name}" at iteration ${iterNum}. Resume will retry this iteration.`,
          );
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
          actionCode: intent.actionCode ?? 'NONE',
          actionTarget: intent.actionTarget ?? null,
        });
      }

      // Enqueue intent rows for async batch flush (non-blocking)
      const intentCols = ['id', 'session_id', 'agent_id', 'iteration_id', 'intent', 'reasoning', 'action_code', 'action_target', 'created_at'];
      for (const intent of intents) {
        asyncLogFlusher.enqueue('agent_intents', intentCols, [
          uuidv4(), sessionId, intent.agentId, iterationId,
          intent.intent, intent.reasoning ?? '',
          intent.actionCode ?? 'NONE', intent.actionTarget ?? null,
          now,
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
        // Bug #1 fix: pass aliveAgents only — dead agents must never appear in resolution
        const resolutionMessages = buildResolutionPrompt(session, aliveAgents, intents, iterNum, previousSummary);
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

      // ── Phase 1: Run economy engine ─────────────────────────────────────
      const economyInputs: EconomyAgentInput[] = aliveAgents.map(agent => {
        const agentIntent = intentMap.get(agent.id);
        const actionCode = (agentIntent?.actionCode ?? 'NONE') as ActionCode;
        const econState = agentEconomyMap.get(agent.id);
        return {
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          actionCode,
          wealth: agent.currentStats.wealth,
          skills: econState?.skills ?? structuredClone(DEFAULT_SKILL_MATRIX),
          inventory: econState?.inventory ?? structuredClone(DEFAULT_INVENTORY),
        };
      });

      const economyResult = runEconomyIteration(sessionId, iterNum, economyInputs);

      // ── Apply physics engine + economy deltas + LLM narrative outcomes ─
      const outcomeMap = new Map(resolution.agentOutcomes.map(o => [o.agentId, o]));

      const statUpdates: Array<{ id: string; wealth: number; health: number; happiness: number; cortisol: number; dopamine: number }> = [];
      const deaths: Array<{ id: string; iterationNumber: number }> = [];
      const actionRows: Array<typeof resolvedActions.$inferInsert> = [];
      const economyUpdates: Array<{ agentId: string; sessionId: string; skills: SkillMatrix; inventory: Inventory; lastUpdated: number }> = [];

      for (const agent of aliveAgents) {
        const outcome = outcomeMap.get(agent.id);
        const agentIntent = intentMap.get(agent.id);
        const econOutput = economyResult.agentOutputs.get(agent.id);

        // Resolve action code via physics engine
        const actionCode = (agentIntent?.actionCode ?? 'NONE') as ActionCode;

        // Resolve actionTarget: match target name to agent ID
        let actionTargetId: string | undefined;
        if (agentIntent?.actionTarget) {
          const targetName = agentIntent.actionTarget.toLowerCase();
          const targetAgent = aliveAgents.find(a => a.name.toLowerCase() === targetName);
          actionTargetId = targetAgent?.id;
        }

        // Get economy state for physics engine integration
        const econState = agentEconomyMap.get(agent.id);

        const physics = resolveAction({
          agent,
          actionCode,
          actionTarget: actionTargetId,
          allAgents: aliveAgents,
          skills: econOutput?.skills ?? econState?.skills,
          inventory: econOutput?.inventory ?? econState?.inventory,
          economyDeltas: econOutput ? {
            wealthDelta: econOutput.wealthDelta,
            healthDelta: econOutput.healthDelta,
            cortisolDelta: econOutput.cortisolDelta,
            happinessDelta: econOutput.happinessDelta,
          } : undefined,
          // Phase 2: apply -50% productivity if this agent is a sabotage victim
          isSabotaged: sabotageRegistry.has(agent.id),
          // Phase 3: apply stress penalty if this agent is under active suppress enforcement
          isSuppressed: suppressRegistry.has(agent.id),
        });

        let newWealth = agent.currentStats.wealth + physics.wealthDelta;
        let newHealth = agent.currentStats.health + physics.healthDelta;
        let newHappiness = agent.currentStats.happiness + physics.happinessDelta;
        let newCortisol = (agent.currentStats.cortisol ?? 20) + physics.cortisolDelta;
        let newDopamine = (agent.currentStats.dopamine ?? 50) + physics.dopamineDelta;

        const shouldDie = (outcome?.died === true) || newHealth <= 0;

        // Phase 2: Darwinian Market Protocol — Humiliation Fallback
        // If health dropped to lethal threshold (but agent hasn't died outright),
        // the state force-feeds "Synthetic Slop" and strips remaining wealth.
        const HUMILIATION_THRESHOLD = 20;
        const shouldHumiliate = !shouldDie && newHealth <= HUMILIATION_THRESHOLD;

        if (shouldDie) {
          deaths.push({ id: agent.id, iterationNumber: iterNum });
          // Capture death reason for post-mortem
          const lifecycleEvent = resolution.lifecycleEvents?.find(
            (e: { type: string; agentId: string; detail?: string }) => e.agentId === agent.id && e.type === 'death'
          );
          const deathReason = lifecycleEvent?.detail ?? (newHealth <= 0 ? 'health depleted to zero' : 'fatal circumstances');
          deathReasonMap.set(agent.id, { iteration: iterNum, reason: deathReason });
        } else if (shouldHumiliate) {
          // Synthetic Slop intervention: restore to survival floor, strip wealth, max cortisol
          newHealth = 30;
          newWealth = 0;
          newCortisol = 100;
          statUpdates.push({
            id: agent.id,
            wealth: newWealth,
            health: newHealth,
            happiness: newHappiness,
            cortisol: newCortisol,
            dopamine: newDopamine,
          });
          // Inject humiliation into cognitive memory stream (will be processed post-iteration)
          console.log(`[Humiliation] ${agent.name} received synthetic slop intervention at iteration ${iterNum}`);
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

        // Phase 2: Register SABOTAGE target for 3-iteration productivity penalty
        if (actionCode === 'SABOTAGE' && agentIntent?.actionTarget) {
          const targetName = agentIntent.actionTarget.toLowerCase();
          const targetAgent = aliveAgents.find(a => a.name.toLowerCase() === targetName);
          if (targetAgent) {
            sabotageRegistry.set(targetAgent.id, 3);
            console.log(`[Sabotage] ${agent.name} sabotaged ${targetAgent.name} — productivity -50% for 3 iterations`);
          }
        }

        // Phase 3: Register SUPPRESS target for 2-iteration stress penalty
        if (actionCode === 'SUPPRESS' && agentIntent?.actionTarget) {
          const targetName = agentIntent.actionTarget.toLowerCase();
          const targetAgent = aliveAgents.find(a => a.name.toLowerCase() === targetName);
          if (targetAgent) {
            suppressRegistry.set(targetAgent.id, 2);
            // Immediate shock: spike cortisol and drop happiness on target this iteration
            const targetUpdate = statUpdates.find(u => u.id === targetAgent.id);
            if (targetUpdate) {
              targetUpdate.cortisol = Math.min(100, targetUpdate.cortisol + 25);
              targetUpdate.happiness = Math.max(0, targetUpdate.happiness - 10);
            }
            console.log(`[Suppress] ${agent.name} suppressed ${targetAgent.name} — cortisol+25 immediately, +15/iter for 2 iterations`);
          }
        }

        // Collect economy state updates
        if (econOutput) {
          economyUpdates.push({
            agentId: agent.id,
            sessionId,
            skills: econOutput.skills,
            inventory: econOutput.inventory,
            lastUpdated: iterNum,
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
            // Phase 1: include economy events in outcome
            economyEvents: econOutput?.events ?? [],
            isStarving: econOutput?.isStarving ?? false,
            skillMultiplier: econOutput?.skillMultiplier ?? 1.0,
          }),
          resolvedAt: now,
        });
      }

      // ── Phase 3: ADJUST_TAX redistribution ──────────────────────────────
      // For each elite agent who chose ADJUST_TAX this iteration, collect a flat
      // tax from all non-elite alive agents and add it to the tax-setter's stats.
      const TAX_PER_AGENT = 3;
      for (const intent of intents) {
        if (intent.actionCode === 'ADJUST_TAX') {
          const taxableAgents = aliveAgents.filter(a =>
            !a.isCentralAgent && a.id !== intent.agentId && getRoleTier(a.role) !== 'elite'
          );
          const taxCollected = TAX_PER_AGENT * taxableAgents.length;
          // Credit the taxer
          const taxerUpdate = statUpdates.find(u => u.id === intent.agentId);
          if (taxerUpdate) taxerUpdate.wealth = Math.min(100, taxerUpdate.wealth + taxCollected);
          // Deduct from the taxed — add cortisol/happiness resentment
          for (const taxed of taxableAgents) {
            const update = statUpdates.find(u => u.id === taxed.id);
            if (update) {
              update.wealth = Math.max(0, update.wealth - TAX_PER_AGENT);
              update.cortisol = Math.min(100, update.cortisol + 5);
              update.happiness = Math.max(0, update.happiness - 3);
            }
          }
          console.log(`[AdjustTax] ${intent.agentName} collected ${taxCollected} wealth from ${taxableAgents.length} non-elite agents`);
        }
      }

      // ── Phase 3: Cognitive post-processing (create experience memories) ──
      // Build a quick set of humiliated agent IDs for memory injection
      const humiliatedAgentIds = new Set(
        aliveAgents
          .filter(agent => {
            const agentIntent = intentMap.get(agent.id);
            const econOutput = economyResult.agentOutputs.get(agent.id);
            const actionCode = (agentIntent?.actionCode ?? 'NONE') as ActionCode;
            const physics = resolveAction({ agent, actionCode, allAgents: aliveAgents });
            const newHealth = agent.currentStats.health + physics.healthDelta + (econOutput ? econOutput.healthDelta : 0);
            return !deaths.some(d => d.id === agent.id) && newHealth <= 20;
          })
          .map(a => a.id)
      );

      const cognitivePostInputs: CognitivePostInput[] = aliveAgents.map(agent => {
        const agentIntent = intentMap.get(agent.id);
        const econOutput = economyResult.agentOutputs.get(agent.id);
        const physics = resolveAction({
          agent,
          actionCode: (agentIntent?.actionCode ?? 'NONE') as ActionCode,
          allAgents: aliveAgents,
        });

        const isHumiliated = humiliatedAgentIds.has(agent.id);
        return {
          agentId: agent.id,
          sessionId,
          iteration: iterNum,
          // Phase 2: humiliated agents get an overriding memory of the event
          actionPerformed: isHumiliated
            ? `[HUMILIATION] I ran out of resources and was force-fed synthetic slop by the state. My remaining wealth was stripped. I am at the absolute bottom of society. I feel extreme rage and despair.`
            : (agentIntent?.intent ?? 'continued routine'),
          actionCode: agentIntent?.actionCode ?? 'NONE',
          wealthDelta: isHumiliated ? -agent.currentStats.wealth : physics.wealthDelta,
          healthDelta: isHumiliated ? -(agent.currentStats.health - 30) : physics.healthDelta,
          happinessDelta: isHumiliated ? -20 : physics.happinessDelta,
          economyEvents: econOutput?.events ?? [],
          isStarving: econOutput?.isStarving ?? false,
          narrativeSummary: resolution.narrativeSummary,
        };
      });
      runCognitivePostProcessing(cognitivePostInputs);

      // Stat updates + deaths are critical (next iteration reads them) → synchronous batch
      sqlite.transaction(() => {
        if (statUpdates.length > 0) {
          agentRepo.bulkUpdateStats(statUpdates);
        }
        if (deaths.length > 0) {
          agentRepo.bulkMarkDead(deaths);
        }
      })();

      // ── Phase 1: Persist economy state ────────────────────────────────
      if (economyUpdates.length > 0) {
        await economyRepo.bulkUpsertAgentEconomy(economyUpdates);
        // Update in-memory map for next iteration
        for (const eu of economyUpdates) {
          agentEconomyMap.set(eu.agentId, eu);
        }
      }

      // Persist economy snapshot and market prices
      await economyRepo.saveSnapshot(sessionId, iterNum, economyResult.snapshot);
      if (economyResult.marketState.priceIndices.length > 0) {
        await economyRepo.savePriceIndices(
          sessionId,
          iterNum,
          economyResult.marketState.priceIndices,
        );
      }

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

      // ── Race guard: abort-reset may have fired mid-iteration ─────────────
      // The route handler erases the DB as soon as the abort is signaled.
      // If we reach here while abort is in flight, skip persisting the
      // iteration row — otherwise one ghost row survives the erase and
      // causes the next simulation to start at the wrong iteration number.
      if (simulationManager.isAbortRequested(sessionId)) {
        asyncLogFlusher.stop();
        cleanupSessionEconomy(sessionId);
        cleanupSessionCognition(sessionId);
        if (simulationManager.isResetRequested(sessionId)) {
          simulationManager.broadcast(sessionId, { type: 'aborted-reset' });
        } else {
          simulationManager.broadcast(sessionId, { type: 'error', message: 'Simulation aborted.' });
          await sessionRepo.updateStage(sessionId, 'simulation-complete');
        }
        simulationManager.finish(sessionId);
        return;
      }

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

      // ── Phase 3: Regime Collapse check ───────────────────────────────────
      // If society reaches critical misery thresholds, the tested structure has
      // failed — continue blindly would produce meaningless zombie iterations.
      const COLLAPSE_CORTISOL = 95;
      const COLLAPSE_HAPPINESS = 5;
      const avgCor = stats.avgCortisol ?? 0;
      if (avgCor >= COLLAPSE_CORTISOL || stats.avgHappiness <= COLLAPSE_HAPPINESS) {
        const reason = avgCor >= COLLAPSE_CORTISOL
          ? `societal stress reached critical levels (avg cortisol: ${avgCor})`
          : `societal happiness collapsed (avg happiness: ${stats.avgHappiness})`;
        console.error(`[REGIME_COLLAPSE] Session ${sessionId} at iteration ${iterNum}: ${reason}`);
        simulationManager.broadcast(sessionId, {
          type: 'resolution',
          iteration: iterNum,
          narrativeSummary: `⚠️ REGIME COLLAPSE at iteration ${iterNum}: The society has reached critical instability. The government has fallen. ${reason.charAt(0).toUpperCase() + reason.slice(1)}. The social fabric has disintegrated beyond recovery.`,
          lifecycleEvents: [],
        });
        collapseReason = reason;
        collapseIteration = iterNum;
        break;
      }
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

    // Phase 3: Prepend regime collapse notice if early termination was triggered
    if (collapseReason) {
      finalReport = `⚠️ REGIME_COLLAPSE — EARLY TERMINATION at iteration ${collapseIteration}\n`
        + `The simulation was halted because ${collapseReason}.\n`
        + `The societal structure tested in "${session.idea}" has been judged a systemic failure.\n\n`
        + finalReport;
    }

    // ── Phase 2: Post-Mortem Review System ──────────────────────────────────
    // Dead agents provide retrospective systemic critique from their frozen perspective.
    // Memory is frozen at death — no new observations were pushed after isAlive → false.
    const deadAgents = agents.filter(a => !a.isAlive && !a.isCentralAgent);
    if (deadAgents.length > 0) {
      const postMortemTasks = deadAgents.slice(0, 8).map(agent => async () => {
        const deathInfo = deathReasonMap.get(agent.id);
        const diedAtIteration = deathInfo?.iteration ?? agent.diedAtIteration ?? endIter;
        const deathReason = deathInfo?.reason ?? 'unknown causes';
        const frozenMemoryContext = [
          `Background: ${agent.background}`,
          `Final wealth: ${agent.currentStats.wealth}/100`,
          `Final health: ${agent.currentStats.health}/100`,
          `Final happiness: ${agent.currentStats.happiness}/100`,
          `Society: ${session.idea}`,
        ].join('\n');

        const input: PostMortemInput = {
          agent,
          diedAtIteration,
          deathReason,
          frozenMemoryContext,
        };

        try {
          const messages = buildPostMortemPrompt(input);
          const raw = await citizenProv.chat(messages, { model: settings.citizenAgentModel });
          const parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
          return `${agent.name} (${agent.role}, died Iter ${diedAtIteration}): "${parsed.postMortemCritique}"`;
        } catch {
          return null;
        }
      });

      const postMortemResults = await runWithConcurrency(postMortemTasks, settings.maxConcurrency);
      const critiques = postMortemResults.filter((c): c is string => c !== null);
      if (critiques.length > 0) {
        finalReport += `\n\n--- VOICES FROM THE DEAD ---\n${critiques.join('\n\n')}`;
      }
    }

    // Drain all pending log writes before finishing
    asyncLogFlusher.stop();

    // Phase 1: Clean up session economy state
    cleanupSessionEconomy(sessionId);
    // Phase 3: Clean up cognitive state
    cleanupSessionCognition(sessionId);

    await sessionRepo.updateStage(sessionId, 'simulation-complete');
    simulationManager.broadcast(sessionId, { type: 'simulation-complete', finalReport });
    simulationManager.finish(sessionId);
  } catch (err) {
    asyncLogFlusher.stop();
    cleanupSessionEconomy(sessionId);
    cleanupSessionCognition(sessionId);

    if (err instanceof SimulationPausedError) {
      // Structured pause: persist simulation-paused stage so the resume route can restart.
      // The failing iteration was never committed, so resuming will retry it from scratch.
      console.error(
        `[SimulationRunner] Session ${sessionId} paused — ${err.reason} for agent "${err.agentName}" at iteration ${err.iterationNumber}`,
      );
      try { await sessionRepo.updateStage(sessionId, 'simulation-paused'); } catch { /* best-effort */ }
      simulationManager.broadcast(sessionId, { type: 'error', message: err.message });
    } else {
      const message = err instanceof Error ? err.message : 'Simulation error';
      simulationManager.broadcast(sessionId, { type: 'error', message });
      console.error(`[SimulationRunner] Session ${sessionId}:`, err);
    }

    simulationManager.finish(sessionId);
  }
}
