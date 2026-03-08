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
import type { Agent, SkillMatrix, Inventory, AgentNeeds, NeedsInterrupt, AgentStats } from '@idealworld/shared';
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
  /** Phase 1 Tick-based: Agent's current needs for stat calculations */
  agentNeeds?: AgentNeeds;
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
  const { agent, actionCode, actionTarget, allAgents, skills, inventory, economyDeltas, isSabotaged, isSuppressed, agentNeeds } = input;
  let w = 0, h = 0, hap = 0, cor = 0, dop = 0;

  // Compute skill and tool multipliers if available
  const skillMult = skills ? getActionMultiplier(skills, actionCode) : 1.0;
  const toolMult = inventory ? getToolMultiplier(inventory) : 1.0;
  // Phase 2: Active sabotage reduces this agent's productivity by 50%
  const sabotageMult = isSabotaged ? 0.5 : 1.0;
  const cortisolPenalty = (agentNeeds?.cortisol ?? 0) >= 80 ? 0.5 : 1.0;
  const productionMult = skillMult * toolMult * sabotageMult * cortisolPenalty;

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

// ── Phase 3: Enterprise Physics ────────────────────────────────────────────

export interface Enterprise {
  id: string;
  sessionId: string;
  ownerId: string;
  name: string;
  industry: string;
  outputCommodity: string;
  efficiencyMultiplier: number;
  employeeIds: string; // JSON
  wagePer8Ticks: number;
  stockpile: number;
  foundedAt: number;
  isActive: boolean;
}

export interface EnterpriseProductionInput {
  enterprise: Enterprise;
  employees: Agent[];           // Current active employees (WORK_AT_ENTERPRISE task)
  rawMaterialsConsumed: number; // Units fed from stockpile/orders
  ticksWorked: number;          // Should be 8 for a full shift
}

export interface EnterpriseProductionOutput {
  unitsProduced: number;
  wagesPaid: number;            // Total wages to distribute
  perEmployeeWage: number;
  ownerProfit: number;          // Owner's cut (sales revenue - wages - input costs)
}

/**
 * Resolve one enterprise production cycle (8 ticks = 1 shift).
 * efficiencyMultiplier (default 2.5x) vs solo PRODUCE_AND_SELL (1.0x)
 * creates the surplus that allows enterprises to pay wages AND turn profit.
 */
export function resolveEnterpriseProduction(input: EnterpriseProductionInput): EnterpriseProductionOutput {
  const { enterprise, employees, rawMaterialsConsumed } = input;

  const baseOutput = employees.length * 10; // Base: 10 units per employee per shift
  const efficiencyBonus = enterprise.efficiencyMultiplier;

  // Raw materials required for Manufacturing/Tech; Agriculture has no material input
  const materialMult = enterprise.industry === 'Manufacturing'
    ? (rawMaterialsConsumed > 0 ? 1.0 : 0.3) // Penalty for no raw materials
    : 1.0;

  const unitsProduced = Math.floor(baseOutput * efficiencyBonus * materialMult);
  const wagesPaid = employees.length * enterprise.wagePer8Ticks;

  // Assuming 8w/unit sale price for profit estimate in physics
  const assumedSalePrice = 8;
  const ownerProfit = Math.max(0, (unitsProduced * assumedSalePrice) - wagesPaid);

  return {
    unitsProduced,
    wagesPaid,
    perEmployeeWage: enterprise.wagePer8Ticks,
    ownerProfit,
  };
}

// ── Phase 2: Commodities & Hard Utility ────────────────────────────────────

/** Commodity categories with deterministic physical effects */
export type CommodityCategory = 'Food' | 'Raw_Materials' | 'Tech_Parts' | 'Luxury_Services';

export interface CommodityEffect {
  category: CommodityCategory;
  /** Stat deltas applied upon consumption/use of 1 unit */
  satietyDelta: number;
  healthDelta: number;
  cortisolDelta: number;
  happinessDelta: number;
  /** Productivity multiplier if equipped (for Tech_Parts/Tools) */
  productivityBuff: number;
  /** Whether this commodity is consumed on use (vs. persistent buff) */
  consumable: boolean;
  /** Whether enterprise production requires this as input material */
  isRawInput: boolean;
}

export const COMMODITY_REGISTRY: Record<CommodityCategory, CommodityEffect> = {
  Food: {
    category: 'Food',
    satietyDelta: +35,   // Restores significant satiety
    healthDelta: +8,     // General health recovery
    cortisolDelta: -5,   // Eating is calming
    happinessDelta: +5,
    productivityBuff: 1.0,
    consumable: true,
    isRawInput: false,
  },
  Raw_Materials: {
    category: 'Raw_Materials',
    satietyDelta: 0,
    healthDelta: 0,
    cortisolDelta: 0,
    happinessDelta: 0,
    productivityBuff: 1.0,
    consumable: false,  // Not consumed by agent — fed to enterprise production
    isRawInput: true,   // Required input for Tech_Parts manufacturing
  },
  Tech_Parts: {
    category: 'Tech_Parts',
    satietyDelta: 0,
    healthDelta: 0,
    cortisolDelta: -2,   // Mild satisfaction from having good tools
    happinessDelta: +3,
    productivityBuff: 2.0,  // DOUBLES all production output when equipped
    consumable: false,   // Persistent buff; degrades over time (see below)
    isRawInput: false,
  },
  Luxury_Services: {
    category: 'Luxury_Services',
    satietyDelta: 0,
    healthDelta: +5,
    cortisolDelta: -30,  // DRASTICALLY reduces cortisol — primary anti-stress commodity
    happinessDelta: +20,
    productivityBuff: 1.0,
    consumable: true,    // Single-use experience
    isRawInput: false,
  },
};

/**
 * Resolve the effect of an agent purchasing/using a commodity.
 * Called by the Physics Engine when BUY_ORDER is matched on the order book.
 * PURE FUNCTION — no side effects.
 */
export function applyCommodityEffect(
  needs: AgentNeeds,
  stats: AgentStats, // unused for now, kept for signature match
  category: CommodityCategory,
): { updatedNeeds: AgentNeeds; statDelta: PhysicsOutput } {
  const effect = COMMODITY_REGISTRY[category];
  return {
    updatedNeeds: {
      satiety: Math.min(100, needs.satiety + effect.satietyDelta),
      cortisol: Math.max(0, Math.min(100, needs.cortisol + effect.cortisolDelta)),
      energy: needs.energy,
    },
    statDelta: {
      wealthDelta: 0, // Wealth already deducted when order matched
      healthDelta: effect.healthDelta,
      happinessDelta: effect.happinessDelta,
      cortisolDelta: effect.cortisolDelta,
      dopamineDelta: effect.happinessDelta > 10 ? 8 : 2,
    },
  };
}

/** Decay rates per tick (1 tick = 1 in-game hour) */
const NEEDS_DECAY = {
  satiety: -1.2,   // Lose ~28 satiety over 24 ticks (1 in-game day)
  cortisol: +0.5,  // Stress accumulates slowly unless actively reduced
  energy: -0.8,    // Lose ~19 energy over 24 ticks
};

/** Interrupt thresholds */
const INTERRUPT_THRESHOLDS = {
  satiety: { warning: 40, critical: 20 },
  cortisol: { warning: 70, critical: 85 },
  energy: { warning: 25, critical: 10 },
};

export interface NeedsDecayInput {
  needs: AgentNeeds;
  currentTick: number;
  isResting: boolean;    // REST action reduces cortisol/restores energy faster
  isEating: boolean;     // EAT action restores satiety
}

export interface NeedsDecayOutput {
  updatedNeeds: AgentNeeds;
  interrupt: NeedsInterrupt | null;
}

/**
 * Apply one tick of passive needs decay.
 * Returns updated needs and any interrupt that should fire.
 * PURE FUNCTION — no side effects, no DB access.
 */
export function applyNeedsDecay(input: NeedsDecayInput): NeedsDecayOutput {
  const { needs, currentTick, isResting, isEating } = input;

  let satiety = needs.satiety + NEEDS_DECAY.satiety;
  let cortisol = needs.cortisol + NEEDS_DECAY.cortisol;
  let energy = needs.energy + NEEDS_DECAY.energy;

  // Active REST recovers energy and suppresses cortisol
  if (isResting) {
    energy += 4;
    cortisol -= 3;
  }

  // Active EAT restores satiety
  if (isEating) {
    satiety += 15;
  }

  // Clamp to [0, 100]
  satiety = Math.max(0, Math.min(100, satiety));
  cortisol = Math.max(0, Math.min(100, cortisol));
  energy = Math.max(0, Math.min(100, energy));

  // Determine interrupt
  let interrupt: NeedsInterrupt | null = null;

  if (satiety <= INTERRUPT_THRESHOLDS.satiety.critical) {
    interrupt = {
      type: 'STARVATION',
      severity: 'critical',
      injectedDirective: '[CRITICAL — STARVATION] Your body is consuming itself. You CANNOT think of anything else. You MUST buy food from the market RIGHT NOW or you will die.',
      firedAtTick: currentTick,
    };
  } else if (cortisol >= INTERRUPT_THRESHOLDS.cortisol.critical) {
    interrupt = {
      type: 'MENTAL_BREAK',
      severity: 'critical',
      injectedDirective: '[CRITICAL — MENTAL BREAKDOWN IMMINENT] Your stress has reached an unbearable level. You are unable to function. You MUST purchase Luxury_Services or REST immediately.',
      firedAtTick: currentTick,
    };
  } else if (satiety <= INTERRUPT_THRESHOLDS.satiety.warning) {
    interrupt = {
      type: 'STARVATION',
      severity: 'warning',
      injectedDirective: '[WARNING — HUNGRY] You feel intense hunger pangs. Your concentration is slipping. You should buy food soon.',
      firedAtTick: currentTick,
    };
  } else if (cortisol >= INTERRUPT_THRESHOLDS.cortisol.warning) {
    interrupt = {
      type: 'MENTAL_BREAK',
      severity: 'warning',
      injectedDirective: '[WARNING — HIGH STRESS] Your cortisol is dangerously elevated. If you do not seek relief soon, you will suffer a mental breakdown.',
      firedAtTick: currentTick,
    };
  }

  return { updatedNeeds: { satiety, cortisol, energy }, interrupt };
}
