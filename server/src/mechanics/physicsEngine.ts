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

export interface PhysicsOutput {
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
  cortisolDelta: number;
  dopamineDelta: number;
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

/** Calculate trade wealth delta based on partner's wealth */
function tradeCalc(agent: Agent, allAgents: Agent[], targetId?: string): number {
  const target = targetId ? allAgents.find(a => a.id === targetId) : undefined;
  if (!target || !target.isAlive) return 2; // no valid partner → small gain
  // Both parties gain a small amount; wealthier party gains less
  const diff = target.currentStats.wealth - agent.currentStats.wealth;
  return Math.round(Math.max(-5, Math.min(5, diff * 0.1)) + 2);
}

/** Calculate steal wealth gain */
function stealCalc(agent: Agent, allAgents: Agent[], targetId?: string): number {
  const target = targetId ? allAgents.find(a => a.id === targetId) : undefined;
  if (!target || !target.isAlive) return 3;
  return Math.min(15, Math.round(target.currentStats.wealth * 0.15));
}

const clampDelta = (v: number): number => Math.max(-30, Math.min(30, Math.round(v)));

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
    case 'TRADE':
      w = tradeCalc(agent, allAgents, actionTarget);
      h = 0;
      hap = 3;
      cor = -2;
      dop = 3;
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
    case 'CONSUME':
      w = -8;
      h = 3;
      hap = 8;
      cor = -8;
      dop = 8;
      break;
    // ── Phase 1 new action codes ──────────────────────────────────────
    case 'PRODUCE':
      // Subsistence production: no wealth change, but skill improves output
      w = 0;
      h = -3;    // Physical labor
      hap = 1;   // Satisfaction from self-sufficiency
      cor = -2;
      dop = 2;
      break;
    case 'EAT':
      // Extra food consumption (inventory handles the food mechanics)
      w = 0;
      h = 2;
      hap = 3;
      cor = -4;
      dop = 3;
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
    case 'SET_WAGE':
      // Management action: small stress, leadership satisfaction
      w = 0;
      h = 0;
      hap = 2;
      cor = 2;
      dop = 2;
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

  // Automatic adjustments applied AFTER action resolution
  // Health baseline: -2/iter (metabolism). REST/CONSUME partially offset this.
  h -= 2;

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
