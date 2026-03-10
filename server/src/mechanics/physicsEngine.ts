/**
 * Deterministic physics engine for the neuro-symbolic simulation.
 * Given an agent and their chosen action code, compute exact stat deltas.
 * All values clamped to [-30, +30] for deltas, [0, 100] for final stats.
 *
 * Phase 1 Enhancement: Now integrate with the economy engine for
 * skill multipliers, inventory effects, and production bonuses.
 *
 * Phase 3 Enhancement: Asymmetric class actions (EMBEZZLE, ADJUST_TAX, SUPPRESS)
 * and buffed WORK income to break poverty traps.
 */
import type { Agent, SkillMatrix, Inventory } from '@idealworld/shared';
import type { ActionCode } from './actionCodes.js';
import { getActionMultiplier } from './skillSystem.js';
import { getToolMultiplier } from './inventorySystem.js';

const PASSIVE_STARVATION_HEALTH_PENALTY = 10;

export interface PhysicsQueuedAction {
  actionCode: ActionCode;
  parameters?: Record<string, unknown>;
}

export interface PhysicsInput {
  agent: Agent;
  actionCode: ActionCode;
  actionTarget?: string;    // target agentId for TRADE/STEAL/HELP/SUPPRESS
  allAgents: Agent[];
  /** Phase 1: Agent's skill matrix (optional — backward compatible). */
  skills?: SkillMatrix;
  /** Phase 1: Agent's inventory (optional — backward compatible). */
  inventory?: Inventory;
  /** Phase 1: Economy deltas to layer on top (from economy engine). */
  economyDeltas?: {
    wealthDelta: number;
    healthDelta: number;
    cortisolDelta: number;
    happinessDelta: number;
  };
  /** Phase 2: Whether this agent is currently the victim of a SABOTAGE (-50% productivity). */
  isSabotaged?: boolean;
  /** Phase 3: Whether this agent is under active SUPPRESS enforcement (+cortisol, -happiness). */
  isSuppressed?: boolean;
}

export interface PhysicsQueueInput {
  agent: Agent;
  actionQueue: PhysicsQueuedAction[];
  allAgents: Agent[];
  skills?: SkillMatrix;
  inventory?: Inventory;
  economyDeltasByAction?: Array<PhysicsInput['economyDeltas'] | undefined>;
  isSabotaged?: boolean;
  isSuppressed?: boolean;
}

export interface PhysicsOutput {
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
  cortisolDelta: number;
  dopamineDelta: number;
}

export interface PhysicsQueueOutput extends PhysicsOutput {
  actionsAttempted: number;
  actionsExecuted: number;
  interrupted: boolean;
  interruptedReason: 'starvation' | 'mental_breakdown' | null;
  executedActions: PhysicsQueuedAction[];
  skippedActions: PhysicsQueuedAction[];
  foodConsumed: number;
}

/**
 * Role-based income for WORK action.
 * Buffed so a single WORK generates enough surplus to cover ~3-4 iterations of food costs.
 * At system ceiling price (15/unit) and 2 units/iteration consumption, an agent needs
 * ~30 wealth per 2 iterations of food. Lowest earner (6) × 4-5 iterations bridges this gap.
 */
function roleIncome(role: string): number {
  const upper = role.toUpperCase();
  if (/LEADER|GOVERNOR|MERCHANT|CHIEF|KING|QUEEN|MAYOR|MINISTER|COMMISSIONER|DIRECTOR/.test(upper)) return 14;
  if (/ARTISAN|WORKER|FARMER|BUILDER|MINER|SMITH|CARPENTER/.test(upper)) return 10;
  if (/SCHOLAR|HEALER|PRIEST|TEACHER|MONK|DOCTOR|SAGE|ENGINEER/.test(upper)) return 8;
  return 6;
}

/** Calculate steal wealth gain */
function stealCalc(agent: Agent, allAgents: Agent[], targetId?: string): number {
  const target = targetId ? allAgents.find(a => a.id === targetId) : undefined;
  if (!target || !target.isAlive) return 3;
  return Math.min(15, Math.round(target.currentStats.wealth * 0.15));
}

const clampDelta = (v: number): number => Math.max(-30, Math.min(30, Math.round(v)));

/**
 * Psychological clamping — prevents LLM hallucinations of high Happiness
 * during extreme physiological distress.
 *
 * Formula:  maxAllowedHappiness = 100 - (cortisol × 0.5) - (100 - health)
 *                               = health - cortisol × 0.5
 *
 * Examples:
 *   Health=30, Cortisol=90 → max = 30 - 45 = -15 → floor 0
 *   Health=60, Cortisol=20 → max = 60 - 10 = 50
 *   Health=100, Cortisol=0 → max = 100  (no cap under normal conditions)
 *
 * Called by the Symbolic Engine AFTER all stat deltas have been applied,
 * so it always operates on the final values for the iteration.
 */
export function clampHappinessByPhysiology(
  happiness: number,
  health: number,
  cortisol: number,
): number {
  const maxAllowed = Math.max(0, health - cortisol * 0.5);
  return Math.min(happiness, Math.round(maxAllowed));
}

/**
 * Resolve an agent's action into deterministic stat deltas.
 *
 * Phase 1 Enhancement: When skills/inventory are provided, the engine
 * uses skill multipliers for production and layers economy deltas on top.
 *
 * Phase 3 Enhancement: Privileged elite actions (EMBEZZLE, ADJUST_TAX, SUPPRESS)
 * and suppression penalty for targets of SUPPRESS.
 */
export function resolveAction(input: PhysicsInput): PhysicsOutput {
  const { agent, actionCode, actionTarget, allAgents, skills, inventory, economyDeltas, isSabotaged, isSuppressed } = input;
  let w = 0, h = 0, hap = 0, cor = 0, dop = 0;

  // Compute skill and tool multipliers if available
  const skillMult = skills ? getActionMultiplier(skills, actionCode) : 1.0;
  const toolMult = inventory ? getToolMultiplier(inventory) : 1.0;
  // Phase 2: Active sabotage reduces this agent's productivity by 50%
  const sabotageMult = isSabotaged ? 0.5 : 1.0;
  const productionMult = skillMult * toolMult * sabotageMult;

  switch (actionCode) {
    case 'WORK':
    case 'WORK_AT_ENTERPRISE':
      w = Math.round(roleIncome(agent.role) * productionMult);
      h = -2;
      hap = -1;
      cor = -3;
      dop = 2;
      break;
    case 'REST':
      w = 0;
      h = 5;
      hap = 2;
      cor = -5;
      dop = 1;
      break;
    case 'STRIKE':
      w = 0;
      h = 0;
      hap = 5;
      cor = 5;
      dop = 4;
      break;
    case 'STEAL':
      w = stealCalc(agent, allAgents, actionTarget);
      h = -5;
      hap = -3;
      cor = 10;
      dop = 5;
      break;
    case 'HELP':
      w = -5;
      h = 0;
      hap = 5;
      cor = -5;
      dop = 5;
      break;
    case 'INVEST':
      w = -10;
      h = 0;
      hap = -2;
      cor = 3;
      dop = 2;
      break;
    case 'PRODUCE_AND_SELL':
      // Independent production is priced and matched elsewhere; physics models labor cost.
      w = 0;
      h = -3;    // Physical labor
      hap = 1;   // Satisfaction from self-sufficiency
      cor = -2;
      dop = 2;
      break;
    case 'POST_BUY_ORDER':
    case 'POST_SELL_ORDER':
      // Market participation: minimal stat changes, real impact through economy engine
      w = 0;
      h = 0;
      hap = 1;
      cor = -1;
      dop = 1;
      break;
    case 'FOUND_ENTERPRISE':
      w = -8;
      h = -1;
      hap = 3;
      cor = 5;
      dop = 4;
      break;
    case 'POST_JOB_OFFER':
    case 'HIRE_EMPLOYEE':
    case 'FIRE_EMPLOYEE':
      // Management action: small stress, leadership satisfaction
      w = 0;
      h = 0;
      hap = 2;
      cor = 2;
      dop = 2;
      break;
    case 'APPLY_FOR_JOB':
      w = 0;
      h = 0;
      hap = 1;
      cor = 1;
      dop = 1;
      break;
    case 'QUIT_JOB':
      w = 0;
      h = 0;
      hap = -1;
      cor = 4;
      dop = 0;
      break;
    // ── Phase 2 new action codes ──────────────────────────────────────
    case 'SABOTAGE':
      // Expected-value outcome: physical danger, ideological satisfaction, high anxiety.
      // Target's -50% productivity is tracked externally via sabotageRegistry.
      w = 0;
      h = -8;    // Physical risk (injuries, hiding, confrontation)
      hap = 5;   // Ideological satisfaction from resistance
      cor = 18;  // High anxiety from danger and legal risk
      dop = 7;   // Adrenaline rush
      break;
    // ── Phase 3: Privileged elite/governing actions ───────────────────
    case 'EMBEZZLE':
      // Skim funds from communal treasury — large wealth gain, high legal risk.
      // Redistribution cost is borne by the whole society implicitly.
      w = 20;
      h = 0;
      hap = 2;   // Fleeting satisfaction from power
      cor = 20;  // Extreme legal anxiety
      dop = 8;   // Adrenaline of corruption
      break;
    case 'ADJUST_TAX':
      // Forcibly extract wealth from lower classes via tax policy.
      // Direct per-agent redistribution is applied in simulationRunner (post-loop).
      // Physics captures the political/psychological cost for the executor.
      w = 15;    // Immediate revenue cut for the policy-maker
      h = 0;
      hap = 3;   // Satisfaction from exercising control
      cor = 5;   // Guilt / fear of backlash
      dop = 4;
      break;
    case 'SUPPRESS':
      // Deploy enforcement against a target citizen.
      // Target's immediate penalty (+cortisol, -happiness) is applied in simulationRunner.
      w = 0;
      h = 0;
      hap = 4;   // Satisfaction from domination
      cor = 8;   // Stress from wielding coercive power
      dop = 6;
      break;
    case 'NONE':
    default:
      w = 0;
      h = -1;
      hap = -1;
      cor = 2;
      dop = -2;
      break;
  }

  // ── Layer economy deltas on top (from inventory/market) ──────────────
  if (economyDeltas) {
    w += economyDeltas.wealthDelta;
    h += economyDeltas.healthDelta;
    cor += economyDeltas.cortisolDelta;
    hap += economyDeltas.happinessDelta;
  }

  // Cortisol auto-escalation for low resources
  const stats = agent.currentStats;
  if (stats.wealth < 20) cor += 10;
  if (stats.health < 30) cor += 8;

  // Phase 3: SUPPRESS victim — enforcement causes persistent psychological pressure
  if (isSuppressed) {
    cor += 15;
    hap -= 8;
  }

  // Dopamine decay: hedonic adaptation
  dop -= 3;

  return {
    wealthDelta: clampDelta(w),
    healthDelta: clampDelta(h),
    happinessDelta: clampDelta(hap),
    cortisolDelta: clampDelta(cor),
    dopamineDelta: clampDelta(dop),
  };
}

export function resolveActionQueue(input: PhysicsQueueInput): PhysicsQueueOutput {
  const {
    agent,
    actionQueue,
    allAgents,
    skills,
    inventory,
    economyDeltasByAction,
    isSabotaged,
    isSuppressed,
  } = input;

  const queue = actionQueue.slice(0, 3);
  const runningStats = {
    wealth: agent.currentStats.wealth,
    health: agent.currentStats.health,
    happiness: agent.currentStats.happiness,
    cortisol: agent.currentStats.cortisol ?? 20,
    dopamine: agent.currentStats.dopamine ?? 50,
  };

  let wealthDelta = 0;
  let healthDelta = 0;
  let happinessDelta = 0;
  let cortisolDelta = 0;
  let dopamineDelta = 0;
  let interrupted = false;
  let interruptedReason: PhysicsQueueOutput['interruptedReason'] = null;

  const executedActions: PhysicsQueuedAction[] = [];
  const skippedActions: PhysicsQueuedAction[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const queued = queue[index];
    const targetCandidate = queued.parameters?.target ?? queued.parameters?.agent_id;
    const targetId = typeof targetCandidate === 'string' ? targetCandidate : undefined;

    const effect = resolveAction({
      agent: {
        ...agent,
        currentStats: {
          ...agent.currentStats,
          wealth: runningStats.wealth,
          health: runningStats.health,
          happiness: runningStats.happiness,
          cortisol: runningStats.cortisol,
          dopamine: runningStats.dopamine,
        },
      },
      actionCode: queued.actionCode,
      actionTarget: targetId,
      allAgents,
      skills,
      inventory,
      economyDeltas: economyDeltasByAction?.[index],
      isSabotaged,
      isSuppressed,
    });

    wealthDelta += effect.wealthDelta;
    healthDelta += effect.healthDelta;
    happinessDelta += effect.happinessDelta;
    cortisolDelta += effect.cortisolDelta;
    dopamineDelta += effect.dopamineDelta;

    runningStats.wealth = Math.max(0, runningStats.wealth + effect.wealthDelta);
    runningStats.health = Math.max(0, Math.min(100, runningStats.health + effect.healthDelta));
    runningStats.happiness = Math.max(0, Math.min(100, runningStats.happiness + effect.happinessDelta));
    runningStats.cortisol = Math.max(0, Math.min(100, runningStats.cortisol + effect.cortisolDelta));
    runningStats.dopamine = Math.max(0, Math.min(100, runningStats.dopamine + effect.dopamineDelta));

    executedActions.push(queued);

    if (runningStats.health < 20) {
      interrupted = true;
      interruptedReason = 'starvation';
    } else if (runningStats.cortisol > 90) {
      interrupted = true;
      interruptedReason = 'mental_breakdown';
    }

    if (interrupted) {
      skippedActions.push(...queue.slice(index + 1));
      break;
    }
  }

  let foodConsumed = 0;
  const endingFood = inventory?.food?.quantity ?? 0;
  if (endingFood > 0) {
    foodConsumed = 1;
  } else {
    healthDelta -= PASSIVE_STARVATION_HEALTH_PENALTY;
  }

  return {
    wealthDelta: clampDelta(wealthDelta),
    healthDelta: clampDelta(healthDelta),
    happinessDelta: clampDelta(happinessDelta),
    cortisolDelta: clampDelta(cortisolDelta),
    dopamineDelta: clampDelta(dopamineDelta),
    actionsAttempted: queue.length,
    actionsExecuted: executedActions.length,
    interrupted,
    interruptedReason,
    executedActions,
    skippedActions,
    foodConsumed,
  };
}
