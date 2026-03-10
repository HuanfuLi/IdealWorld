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
  buildNaturalIntentPrompt,
  buildResolutionPrompt,
  buildGroupResolutionMessages,
  buildMergeResolutionMessages,
  buildFinalReportPrompt,
  buildPostMortemPrompt,
  type EmploymentBoardEntry,
  type MarketBoardEntry,
  type PersonalStatusBoard,
  type QueuedActionInstruction,
  type AgentIntent,
  type PostMortemInput,
} from '../llm/prompts.js';
import {
  parseResolutionStrict,
  parseGroupResolutionStrict,
  parseMergeResolutionStrict,
  parseFinalReport,
  parseSinglePassIntent,
} from '../parsers/simulation.js';
import { runWithConcurrency } from './concurrencyPool.js';
import { asyncLogFlusher } from '../db/asyncLogFlusher.js';
import { resolveAction, clampHappinessByPhysiology } from '../mechanics/physicsEngine.js';
import { type ActionCode, getAllowedActions, getRoleTier } from '../mechanics/actionCodes.js';
import { clusterByRole } from './clustering.js';
import { retryWithHealing } from '../llm/retryWithHealing.js';
// Phase 1 Economy imports
import { cleanupSessionEconomy } from '../mechanics/economyEngine.js';
import { getOrderBook } from '../mechanics/orderBook.js';
import { economyRepo, type AgentEconomyState } from '../db/repos/economyRepo.js';
import type { Inventory, ItemType, MarketState, PriceIndex, SkillMatrix, TelemetryLog } from '@idealworld/shared';
import { DEFAULT_SKILL_MATRIX, DEFAULT_INVENTORY } from '@idealworld/shared';
import { getActionMultiplier, processSkills } from '../mechanics/skillSystem.js';
// Phase 3 Cognitive Engine imports
import {
  runCognitivePreProcessing,
  runCognitivePostProcessing,
  cleanupSessionCognition,
  type CognitivePreInput,
  type CognitivePostInput,
} from '../cognition/cognitiveEngine.js';
// Tick-based Metabolism & Allostatic Load imports
import {
  runFullMetabolicTick,
  getMetCategory,
  AllostaticEngine,
  type AllostaticState,
} from '../mechanics/allostaticEngine.js';
// AMM & Demurrage UBI imports
import {
  AutomatedMarketMaker,
  createAMMForSession,
  createMultiCommodityAMMs,
  computeDemurrageCycle,
  type AgentWealth as AMMAgentWealth,
  type MultiAMMItemType,
} from '../mechanics/automatedMarketMaker.js';

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

interface EnterpriseRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  industry: string;
  employees: Set<string>;
  applicants: Set<string>;
  wage: number;
  minSkill: number;
}

interface EmploymentRecord {
  enterpriseId: string;
  employerId: string;
  employeeId: string;
  wage: number;
  minSkill: number;
  startedAt: number;
}

interface AgentWeekState {
  skills: SkillMatrix;
  inventory: Inventory;
  events: string[];
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
  cortisolDelta: number;
  dopamineDelta: number;
  executedActions: QueuedActionInstruction[];
  interrupted: boolean;
  interruptedReason: 'starvation' | 'mental_breakdown' | null;
  workedEnterpriseId: string | null;
  quitEnterpriseId: string | null;
  /** Authoritative employer: the ONLY enterprise this agent may WORK_AT_ENTERPRISE in. */
  employer_id: string | null;
  /** MET satiety units consumed this tick (for telemetry). */
  caloriesBurned: number;
  /** Food units produced via PRODUCE_AND_SELL this tick (for telemetry). */
  caloriesProduced: number;
  /** Count of explicitly failed/rejected actions this tick (for telemetry). */
  failedActionCount: number;
}

const sessionEnterpriseRegistry = new Map<string, Map<string, EnterpriseRecord>>();
const sessionEmploymentRegistry = new Map<string, Map<string, EmploymentRecord>>();
const sessionPriceHistory = new Map<string, Map<ItemType, number>>();
// AMM: one AutomatedMarketMaker instance per session, persisted across iterations
const sessionAMMRegistry = new Map<string, AutomatedMarketMaker>();
// Multi-commodity AMM pools for non-food items (raw_materials, luxury_goods)
const sessionMultiAMMRegistry = new Map<string, Map<MultiAMMItemType, AutomatedMarketMaker>>();
// Allostatic states: per-agent strain/load, persisted across iterations
const sessionAllostaticStates = new Map<string, Map<string, AllostaticState>>();
// Task 4: last iteration's resolved action events per agent, used for feedback injection
const sessionLastActionResults = new Map<string, Map<string, string>>();
// Macro-level employment metrics from the previous iteration (for survivorship bias fix)
const sessionIterationMetrics = new Map<string, string>();
// Per-session telemetry snapshots (one per completed iteration)
const sessionTelemetryLogs = new Map<string, TelemetryLog[]>();
// Stock-Flow Consistency (SFC) tracking: detect fiat leaks/minting between iterations.
// The economy is fully closed-loop — no state fiat injection. Total must remain constant.
const sessionSFCTracking = new Map<string, { initialFiat: number }>();

/**
 * Returns the telemetry log array for a session.
 * Checks the in-memory map first (populated during an active/recent simulation),
 * then falls back to reading from the DB statistics column (survives server restarts
 * and is available long after the simulation completes).
 */
export function getSessionTelemetry(sessionId: string): TelemetryLog[] {
  const inMemory = sessionTelemetryLogs.get(sessionId);
  if (inMemory && inMemory.length > 0) return inMemory;

  // DB fallback: extract _telemetry from each iteration's statistics JSON
  try {
    const rows = sqlite.prepare(
      `SELECT statistics FROM iterations WHERE session_id = ? ORDER BY iteration_number ASC`
    ).all(sessionId) as Array<{ statistics: string }>;

    const result: TelemetryLog[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.statistics) as Record<string, unknown>;
        if (parsed._telemetry) result.push(parsed._telemetry as TelemetryLog);
      } catch { /* skip malformed rows */ }
    }
    return result;
  } catch {
    return [];
  }
}

function getEnterpriseRegistry(sessionId: string): Map<string, EnterpriseRecord> {
  let registry = sessionEnterpriseRegistry.get(sessionId);
  if (!registry) {
    registry = new Map();
    sessionEnterpriseRegistry.set(sessionId, registry);
  }
  return registry;
}

function getEmploymentRegistry(sessionId: string): Map<string, EmploymentRecord> {
  let registry = sessionEmploymentRegistry.get(sessionId);
  if (!registry) {
    registry = new Map();
    sessionEmploymentRegistry.set(sessionId, registry);
  }
  return registry;
}

function normalizeItemType(raw: unknown): ItemType {
  const normalized = String(raw ?? 'food').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'food') return 'food';
  if (normalized === 'tools' || normalized === 'tool' || normalized === 'tech_parts' || normalized === 'tech') return 'tools';
  if (normalized === 'luxury_goods' || normalized === 'luxury' || normalized === 'goods') return 'luxury_goods';
  return 'raw_materials';
}

function industryToItemType(industry: string): ItemType {
  return normalizeItemType(industry);
}

function getAgentPeakSkill(skills: SkillMatrix): number {
  return Math.max(...Object.values(skills).map(entry => Math.round(entry.level)));
}

function buildMarketBoardEntries(sessionId: string, marketState?: MarketState): MarketBoardEntry[] {
  const previous = sessionPriceHistory.get(sessionId) ?? new Map<ItemType, number>();
  const indices = marketState?.priceIndices ?? [];
  return indices.map((idx): MarketBoardEntry => {
    const prev = previous.get(idx.itemType);
    let trend: MarketBoardEntry['trend'] = 'unknown';
    if (prev == null || prev === 0) trend = 'new';
    else if (idx.vwap > prev) trend = 'up';
    else if (idx.vwap < prev) trend = 'down';
    else trend = 'flat';
    return {
      itemType: idx.itemType,
      averageClearingPrice: idx.vwap || idx.lastPrice || null,
      trend,
    };
  });
}

function buildEmploymentBoardEntries(sessionId: string): EmploymentBoardEntry[] {
  const enterprises = getEnterpriseRegistry(sessionId);
  return [...enterprises.values()]
    .filter(enterprise => enterprise.wage > 0)
    .map(enterprise => ({
      enterprise_id: enterprise.id,
      industry: enterprise.industry,
      wage: enterprise.wage,
      min_skill: enterprise.minSkill,
      owner_name: enterprise.ownerName,
    }));
}

function buildPersonalStatus(sessionId: string, agentId: string, enterpriseOwnerId?: string, agentWealth?: number): PersonalStatusBoard {
  const employment = getEmploymentRegistry(sessionId).get(agentId);
  if (employment) {
    return { employed: true, enterprise_id: employment.enterpriseId, enterprise_role: 'employee', agentWealth };
  }
  if (enterpriseOwnerId) {
    return { employed: false, enterprise_id: enterpriseOwnerId, enterprise_role: 'owner', agentWealth };
  }
  return { employed: false, enterprise_id: null, enterprise_role: null, agentWealth };
}

function createAgentWeekState(econState?: AgentEconomyState): AgentWeekState {
  return {
    skills: structuredClone(econState?.skills ?? DEFAULT_SKILL_MATRIX),
    inventory: structuredClone(econState?.inventory ?? DEFAULT_INVENTORY),
    events: [],
    wealthDelta: 0,
    healthDelta: 0,
    happinessDelta: 0,
    cortisolDelta: 0,
    dopamineDelta: 0,
    executedActions: [],
    interrupted: false,
    interruptedReason: null,
    workedEnterpriseId: null,
    quitEnterpriseId: null,
    employer_id: null,
    caloriesBurned: 0,
    caloriesProduced: 0,
    failedActionCount: 0,
  };
}

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Wealth has no upper bound — only floored at 0. No rounding: rounding destroys fractional fiat.
function clampWealth(value: number): number {
  return Math.max(0, value);
}

/**
 * MET-based weekly metabolism — replaces flat -1 food deduction.
 *
 * Satiety cost scales with the physical intensity of the agent's primary action:
 *   REST / cognitive actions: ~1 food/week
 *   WORK_MODERATE_MANUAL:     ~4.5 food/week
 *   WORK_HEAVY_MANUAL:        ~7.25 food/week
 *
 * Luxury goods are consumed here to reduce Cortisol before the starvation check.
 */
function applyMETMetabolism(
  state: AgentWeekState,
  agent: { role: string; age?: number; weightKg?: number; currentWealth: number },
  sessionId: string,
  iterationNumber: number,
): void {
  // ── Luxury services: consume 1 unit to sharply reduce Cortisol ──────────
  if (state.inventory.luxury_goods.quantity > 0) {
    state.inventory.luxury_goods.quantity -= 1;
    state.cortisolDelta -= 20;
    state.happinessDelta += 5;
    state.events.push('Enjoyed luxury services — stress reduced');
  }

  // ── Determine MET category from primary executed action ──────────────────
  const primaryAction = state.executedActions[0]?.actionCode ?? 'NONE';
  const enterpriseIndustry = (() => {
    const enterprises = getEnterpriseRegistry(sessionId);
    for (const ent of enterprises.values()) {
      if (ent.employees.has(agent.role)) return ent.industry; // approximate match
    }
    return undefined;
  })();
  const metCategory = getMetCategory(primaryAction, agent.role, enterpriseIndustry);

  // ── Compute MET satiety cost ─────────────────────────────────────────────
  const metResult = runFullMetabolicTick({
    cortisol: 0, // cortisol processed separately in allostatic loop
    weightKg: agent.weightKg ?? 70,
    age: agent.age ?? 35,
    metCategory,
    allostaticState: { allostaticStrain: 0, allostaticLoad: 0 }, // allostatic handled separately
  });
  const satietyCost = Math.max(1, Math.round(metResult.satietyCost));

  // ── Consume food proportional to MET demand ──────────────────────────────
  state.caloriesBurned += satietyCost;
  if (state.inventory.food.quantity >= satietyCost) {
    state.inventory.food.quantity -= satietyCost;
    state.events.push(`Consumed ${satietyCost} food (${metCategory}, ×${metResult.met.metMultiplier.toFixed(2)} MET)`);
  } else if (state.inventory.food.quantity > 0) {
    // Partial nutrition — hunger proportional to deficit
    const available = state.inventory.food.quantity;
    state.inventory.food.quantity = 0;
    const deficitRatio = (satietyCost - available) / satietyCost;
    state.healthDelta -= Math.round(5 * deficitRatio);
    state.cortisolDelta += Math.round(8 * deficitRatio);
    state.events.push(`Partial nutrition: ${available}/${satietyCost} food (hungry)`);
  } else {
    // Full starvation
    state.healthDelta -= 10;
    state.cortisolDelta += 15;
    state.events.push('Starvation — no food available');
  }

  // ── Auto-eat to full: if satiety deficit remains and agent has wealth, auto-buy from AMM ──
  const ammForAutoEat = sessionAMMRegistry.get(sessionId);
  if (ammForAutoEat && state.inventory.food.quantity < satietyCost) {
    const foodsNeeded = Math.max(0, satietyCost - state.inventory.food.quantity);
    if (foodsNeeded > 0) {
      const fiatCost = ammForAutoEat.fiatCostForFood(foodsNeeded);
      const availableWealth = agent.currentWealth + state.wealthDelta;
      if (fiatCost !== null && availableWealth >= fiatCost) {
        const receipt = ammForAutoEat.executeBuy(fiatCost, iterationNumber);
        if (receipt.success) {
          const buyQuote = receipt.quote as import('../mechanics/automatedMarketMaker.js').BuyQuote;
          const foodReceived = Math.floor(buyQuote.foodOut);
          state.inventory.food.quantity += foodReceived;
          state.wealthDelta -= fiatCost;
          state.events.push(`Auto-bought ${foodReceived} food from AMM for ${fiatCost.toFixed(1)} fiat (metabolic need)`);
          // Now consume the newly purchased food
          if (state.inventory.food.quantity >= satietyCost) {
            state.inventory.food.quantity -= satietyCost;
          } else {
            state.inventory.food.quantity = 0;
          }
        }
      }
    }
  }
}

function updatePriceHistory(sessionId: string, priceIndices: PriceIndex[]): void {
  const history = new Map<ItemType, number>();
  for (const idx of priceIndices) {
    history.set(idx.itemType, idx.vwap || idx.lastPrice || 0);
  }
  sessionPriceHistory.set(sessionId, history);
}

function applyEnterpriseAction(params: {
  sessionId: string;
  iterationNumber: number;
  agent: Agent;
  action: QueuedActionInstruction;
  state: AgentWeekState;
  allWeekStates: Map<string, AgentWeekState>;
  enterpriseRegistry: Map<string, EnterpriseRecord>;
  employmentRegistry: Map<string, EmploymentRecord>;
  orderBook: ReturnType<typeof getOrderBook>;
  /** AMM instance for this session — food trades route through it instead of order book. */
  amm?: AutomatedMarketMaker;
  /** Multi-commodity AMM pools for non-food items. */
  multiAMMs?: Map<MultiAMMItemType, AutomatedMarketMaker>;
}): { wealthDelta: number; healthDelta: number; happinessDelta: number; cortisolDelta: number; dopamineDelta: number } {
  const {
    iterationNumber,
    agent,
    action,
    state,
    allWeekStates,
    enterpriseRegistry,
    employmentRegistry,
    orderBook,
    amm,
    multiAMMs,
  } = params;
  const economyDelta = { wealthDelta: 0, healthDelta: 0, happinessDelta: 0, cortisolDelta: 0, dopamineDelta: 0 };
  const getNumber = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  switch (action.actionCode) {
    case 'FOUND_ENTERPRISE': {
      // Require 40 Wealth to start a private enterprise (lowered from 100).
      const FOUNDING_COST = 40;
      const currentWealth = agent.currentStats.wealth + economyDelta.wealthDelta;
      if (currentWealth < FOUNDING_COST) {
        state.failedActionCount++;
        state.events.push(`FOUND_ENTERPRISE failed: need ${FOUNDING_COST} Wealth (have ${Math.round(currentWealth)})`);
        break;
      }
      const industry = String(action.parameters.industry ?? `${agent.role}_enterprise`);
      const enterpriseId = `e-${agent.id.slice(0, 8)}-${iterationNumber}`;
      if (!enterpriseRegistry.has(enterpriseId)) {
        enterpriseRegistry.set(enterpriseId, {
          id: enterpriseId,
          ownerId: agent.id,
          ownerName: agent.name,
          industry,
          employees: new Set(),
          applicants: new Set(),
          wage: 0,
          minSkill: 0,
        });
        economyDelta.wealthDelta -= FOUNDING_COST;
        // Registration fee re-enters the circular economy via the AMM fiat reserve.
        // This prevents the 40 Wealth from vanishing into a black hole.
        if (amm) amm.injectFiatReserve(FOUNDING_COST);
        state.events.push(`Founded enterprise ${enterpriseId} in ${industry} (spent ${FOUNDING_COST} Wealth — fee recycled into market pool)`);
      }
      break;
    }
    case 'POST_JOB_OFFER': {
      const enterpriseId = String(action.parameters.enterprise_id ?? '');
      const enterprise = enterpriseRegistry.get(enterpriseId);
      if (enterprise && enterprise.ownerId === agent.id) {
        enterprise.wage = getNumber(action.parameters.wage, enterprise.wage || 6);
        enterprise.minSkill = getNumber(action.parameters.min_skill, enterprise.minSkill || 10);
        state.events.push(`Posted job offer for ${enterpriseId} at wage ${enterprise.wage}`);
      }
      break;
    }
    case 'APPLY_FOR_JOB': {
      const enterpriseId = String(action.parameters.enterprise_id ?? '');
      const enterprise = enterpriseRegistry.get(enterpriseId);
      if (enterprise) {
        // All enterprises are private: add to applicant pool for owner to review via HIRE_EMPLOYEE
        enterprise.applicants.add(agent.id);
        state.events.push(`Applied for job at ${enterpriseId}`);
      }
      break;
    }
    case 'HIRE_EMPLOYEE': {
      const targetAgentId = String(action.parameters.agent_id ?? '');
      const enterprise = [...enterpriseRegistry.values()].find(entry => entry.ownerId === agent.id);
      if (enterprise && enterprise.applicants.has(targetAgentId)) {
        const targetState = allWeekStates.get(targetAgentId);
        const skillFloor = targetState ? getAgentPeakSkill(targetState.skills) : 0;
        if (skillFloor >= enterprise.minSkill) {
          employmentRegistry.set(targetAgentId, {
            enterpriseId: enterprise.id,
            employerId: agent.id,
            employeeId: targetAgentId,
            wage: enterprise.wage,
            minSkill: enterprise.minSkill,
            startedAt: iterationNumber,
          });
          enterprise.applicants.delete(targetAgentId);
          enterprise.employees.add(targetAgentId);
          state.events.push(`Hired ${targetAgentId} into ${enterprise.id}`);
        }
      }
      break;
    }
    case 'FIRE_EMPLOYEE': {
      const targetAgentId = String(action.parameters.agent_id ?? '');
      const employment = employmentRegistry.get(targetAgentId);
      if (employment) {
        const enterprise = enterpriseRegistry.get(employment.enterpriseId);
        if (enterprise?.ownerId === agent.id) {
          enterprise.employees.delete(targetAgentId);
          employmentRegistry.delete(targetAgentId);
          state.events.push(`Fired ${targetAgentId} from ${enterprise.id}`);
        }
      }
      break;
    }
    case 'QUIT_JOB': {
      const enterpriseId = String(action.parameters.enterprise_id ?? '');
      const employment = employmentRegistry.get(agent.id);
      if (employment && employment.enterpriseId === enterpriseId) {
        employmentRegistry.delete(agent.id);
        const enterprise = enterpriseRegistry.get(enterpriseId);
        enterprise?.employees.delete(agent.id);
        state.quitEnterpriseId = enterpriseId;
        state.employer_id = null;
        state.events.push(`Quit job at ${enterpriseId}`);
      }
      break;
    }
    case 'WORK_AT_ENTERPRISE': {
      const enterpriseId = String(action.parameters.enterprise_id ?? '');
      const employment = employmentRegistry.get(agent.id);

      // Strict validation: agent must be formally employed at this enterprise.
      // APPLY_FOR_JOB is the ONLY way to obtain employment. Direct WORK_AT_ENTERPRISE
      // without a valid contract is silently rejected (no auto-hire bypass).
      if (state.employer_id !== enterpriseId) {
        state.cortisolDelta += 5;
        state.failedActionCount++;
        state.events.push(`WORK_AT_ENTERPRISE rejected: not employed at ${enterpriseId} (employer: ${state.employer_id ?? 'none'})`);
        break;
      }

      if (employment && employment.enterpriseId === enterpriseId) {
        state.workedEnterpriseId = enterpriseId;
        const enterprise = enterpriseRegistry.get(enterpriseId);
        if (enterprise) {
          const ownerState = allWeekStates.get(enterprise.ownerId);
          const itemType = industryToItemType(enterprise.industry);
          const producedQty = Math.max(1, Math.round(getActionMultiplier(state.skills, 'WORK_AT_ENTERPRISE')));
          if (ownerState) {
            ownerState.inventory[itemType].quantity += producedQty;
            ownerState.events.push(`Enterprise ${enterpriseId} received ${producedQty} ${itemType} from employee labor`);
          }
          // System enterprise: production goes to state commons (no ownerState — that's fine)
          state.events.push(`Worked at ${enterpriseId}`);
        }
      }
      break;
    }
    case 'PRODUCE_AND_SELL': {
      const itemType = normalizeItemType(action.parameters.itemType);
      // Agricultural Yield Rule: 1 farmer must feed ≥ 4 people.
      // MET cost ≈ ceil(4.5) = 5 food/iter per agent → 4 people × 5 = 20 food per farmer.
      // Baseline 20 food gives 20/4.5 = 4.44× surplus over the farmer's own caloric cost.
      const BASE_PRODUCE_QUANTITY = 20;
      const skillMult = getActionMultiplier(state.skills, 'PRODUCE_AND_SELL');
      const quantity = Math.max(BASE_PRODUCE_QUANTITY, getNumber(action.parameters.quantity, Math.round(BASE_PRODUCE_QUANTITY * skillMult)));
      const price = Math.max(1, getNumber(action.parameters.price, 5));
      if (itemType === 'food' && amm) {
        // Food production → sell directly to AMM pool (instant liquidity)
        const receipt = amm.executeSell(quantity, iterationNumber);
        if (receipt.success) {
          const fiatReceived = Math.floor('fiatOut' in receipt.quote ? receipt.quote.fiatOut : 0);
          economyDelta.wealthDelta += fiatReceived;
          const effectivePrice = 'effectivePrice' in receipt.quote ? receipt.quote.effectivePrice.toFixed(2) : price.toString();
          state.events.push(`Produced ${quantity} food → sold to market at ${effectivePrice}/unit (+${fiatReceived} fiat)`);
          state.caloriesProduced += quantity;
        } else {
          // AMM pool saturated — keep food in inventory
          state.inventory.food.quantity += quantity;
          state.caloriesProduced += quantity;
          state.events.push(`Produced ${quantity} food (market saturated — kept in inventory)`);
        }
      } else {
        // Non-food: try multi-commodity AMM first for instant liquidity
        const commodityAMMProduce = multiAMMs?.get(itemType as MultiAMMItemType);
        if (commodityAMMProduce) {
          const receipt = commodityAMMProduce.executeSell(quantity, iterationNumber);
          if (receipt.success) {
            const fiatReceived = Math.floor('fiatOut' in receipt.quote ? receipt.quote.fiatOut : 0);
            economyDelta.wealthDelta += fiatReceived;
            const effectivePrice = 'effectivePrice' in receipt.quote ? receipt.quote.effectivePrice.toFixed(2) : price.toString();
            state.events.push(`Produced ${quantity} ${itemType} → sold to AMM at ${effectivePrice}/unit (+${fiatReceived} fiat)`);
          } else {
            // AMM saturated — list on order book
            orderBook.submitOrder({ sessionId: params.sessionId, agentId: agent.id, side: 'sell', itemType, price, quantity, iterationPlaced: iterationNumber });
            state.events.push(`Produced and listed ${quantity} ${itemType} at ${price} (AMM saturated)`);
          }
        } else {
          orderBook.submitOrder({
            sessionId: params.sessionId,
            agentId: agent.id,
            side: 'sell',
            itemType,
            price,
            quantity,
            iterationPlaced: iterationNumber,
          });
          state.events.push(`Produced and listed ${quantity} ${itemType} at ${price}`);
        }
      }
      break;
    }
    case 'POST_BUY_ORDER': {
      const itemType = normalizeItemType(action.parameters.itemType);
      const quantity = Math.max(1, getNumber(action.parameters.quantity, 1));
      const price = Math.max(1, getNumber(action.parameters.price, amm ? Math.round(amm.spotPrice) : 5));
      if (itemType === 'food' && amm) {
        // Buy food directly from AMM pool
        const fiatToSpend = price * quantity;
        const agentCurrentWealth = agent.currentStats.wealth + economyDelta.wealthDelta;
        if (agentCurrentWealth <= 0) {
          state.events.push(`RECEIPT: FAILED — Insufficient wealth. Need ${fiatToSpend} fiat, have ${Math.round(agentCurrentWealth)}.`);
          state.failedActionCount++;
        } else {
          const affordableFiat = Math.min(fiatToSpend, agentCurrentWealth);
          const currentSpot = amm.spotPrice;
          // Step 1: preview how much food affordableFiat would buy (no state mutation)
          const preview = amm.quoteBuy(affordableFiat);
          if (!preview.executable) {
            state.events.push(`RECEIPT: FAILED — Food buy rejected. Bid ${price}/unit, AMM spot ${currentSpot.toFixed(2)}/unit. Reason: ${preview.rejectReason}`);
            state.failedActionCount++;
          } else {
            // Step 2: floor to integer food units (agents can't hold fractional food)
            const foodReceived = Math.floor(preview.foodOut);
            if (foodReceived <= 0) {
              state.events.push(`RECEIPT: FAILED — Bid too low to purchase even 1 food unit (AMM spot ${currentSpot.toFixed(2)}).`);
              state.failedActionCount++;
            } else {
              // Step 3: compute EXACT fiat cost for precisely foodReceived integer units
              const exactFiat = amm.fiatCostForFood(foodReceived);
              if (exactFiat === null || exactFiat > agentCurrentWealth) {
                state.events.push(`RECEIPT: FAILED — Cannot afford ${foodReceived} food (need ${exactFiat?.toFixed(2) ?? '?'} fiat).`);
                state.failedActionCount++;
              } else {
                // Step 4: execute for exact amount — no fractional remainder leak
                const receipt = amm.executeBuy(exactFiat, iterationNumber);
                if (receipt.success) {
                  economyDelta.wealthDelta -= exactFiat;
                  state.inventory.food.quantity += foodReceived;
                  const effectivePrice = exactFiat / foodReceived;
                  if (foodReceived < quantity) {
                    state.events.push(`RECEIPT: Price slipped. Bid ${price}/unit for ${quantity} food, AMM spot ${currentSpot.toFixed(2)}. Got ${foodReceived} food for ${exactFiat.toFixed(2)} fiat (${effectivePrice.toFixed(2)}/unit).`);
                  } else {
                    state.events.push(`Bought ${foodReceived} food from market at ${effectivePrice.toFixed(2)}/unit (spent ${exactFiat.toFixed(2)} fiat)`);
                  }
                } else {
                  state.events.push(`RECEIPT: FAILED — Food buy rejected. Reason: ${receipt.rejectReason}`);
                  state.failedActionCount++;
                }
              }
            }
          }
        }
      } else {
        // Non-food: try multi-commodity AMM first (guaranteed liquidity)
        const commodityAMM = multiAMMs?.get(itemType as MultiAMMItemType);
        if (commodityAMM) {
          const fiatCost = commodityAMM.fiatCostForFood(quantity);
          const agentCurrentWealth = agent.currentStats.wealth + economyDelta.wealthDelta;
          if (fiatCost !== null && agentCurrentWealth >= fiatCost) {
            const receipt = commodityAMM.executeBuy(fiatCost, iterationNumber);
            if (receipt.success) {
              const buyQuote = receipt.quote as import('../mechanics/automatedMarketMaker.js').BuyQuote;
              const received = Math.floor(buyQuote.foodOut);
              state.inventory[itemType as keyof typeof state.inventory].quantity += received;
              economyDelta.wealthDelta -= fiatCost;
              state.events.push(`Bought ${received} ${itemType} from AMM for ${fiatCost.toFixed(1)} fiat`);
            } else {
              orderBook.submitOrder({ sessionId: params.sessionId, agentId: agent.id, side: 'buy', itemType, price, quantity, iterationPlaced: iterationNumber });
              state.events.push(`Posted buy order for ${quantity} ${itemType} at ${price} (AMM rejected)`);
            }
          } else {
            orderBook.submitOrder({ sessionId: params.sessionId, agentId: agent.id, side: 'buy', itemType, price, quantity, iterationPlaced: iterationNumber });
            state.events.push(`Posted buy order for ${quantity} ${itemType} at ${price}`);
          }
        } else {
          orderBook.submitOrder({ sessionId: params.sessionId, agentId: agent.id, side: 'buy', itemType, price, quantity, iterationPlaced: iterationNumber });
          state.events.push(`Posted buy order for ${quantity} ${itemType} at ${price}`);
        }
      }
      break;
    }
    case 'POST_SELL_ORDER': {
      const itemType = normalizeItemType(action.parameters.itemType);
      const quantity = Math.max(1, getNumber(action.parameters.quantity, 1));
      const price = Math.max(1, getNumber(action.parameters.price, amm ? Math.round(amm.spotPrice) : 5));
      if (itemType === 'food' && amm) {
        // Sell food directly to AMM pool
        if (state.inventory.food.quantity >= quantity) {
          state.inventory.food.quantity -= quantity;
          const receipt = amm.executeSell(quantity, iterationNumber);
          if (receipt.success) {
            const fiatReceived = Math.floor('fiatOut' in receipt.quote ? receipt.quote.fiatOut : 0);
            economyDelta.wealthDelta += fiatReceived;
            const effectivePrice = 'effectivePrice' in receipt.quote ? receipt.quote.effectivePrice.toFixed(2) : price.toString();
            state.events.push(`Sold ${quantity} food to market at ${effectivePrice}/unit (+${fiatReceived} fiat)`);
          } else {
            state.inventory.food.quantity += quantity; // restore on failure
            state.events.push(`Food sell failed: ${receipt.rejectReason}`);
          }
        }
      } else {
        // Non-food: try multi-commodity AMM first (guaranteed liquidity)
        const commodityAMMSell = multiAMMs?.get(itemType as MultiAMMItemType);
        if (commodityAMMSell && state.inventory[itemType as keyof typeof state.inventory].quantity >= quantity) {
          const receipt = commodityAMMSell.executeSell(quantity, iterationNumber);
          if (receipt.success) {
            const sellQuote = receipt.quote as import('../mechanics/automatedMarketMaker.js').SellQuote;
            state.inventory[itemType as keyof typeof state.inventory].quantity -= quantity;
            economyDelta.wealthDelta += sellQuote.fiatOut;
            state.events.push(`Sold ${quantity} ${itemType} to AMM for ${sellQuote.fiatOut.toFixed(1)} fiat (spot: ${sellQuote.spotPriceBefore.toFixed(2)})`);
          } else {
            // AMM rejected — fall back to order book
            if (state.inventory[itemType as keyof typeof state.inventory].quantity >= quantity) {
              state.inventory[itemType as keyof typeof state.inventory].quantity -= quantity;
              orderBook.submitOrder({ sessionId: params.sessionId, agentId: agent.id, side: 'sell', itemType, price, quantity, iterationPlaced: iterationNumber });
              state.events.push(`Posted sell order for ${quantity} ${itemType} at ${price} (AMM insufficient liquidity)`);
            }
          }
        } else if (!commodityAMMSell) {
          if (state.inventory[itemType as keyof typeof state.inventory].quantity >= quantity) {
            state.inventory[itemType as keyof typeof state.inventory].quantity -= quantity;
            orderBook.submitOrder({ sessionId: params.sessionId, agentId: agent.id, side: 'sell', itemType, price, quantity, iterationPlaced: iterationNumber });
            state.events.push(`Posted sell order for ${quantity} ${itemType} at ${price}`);
          }
        }
      }
      break;
    }
    default:
      break;
  }

  return economyDelta;
}

export async function runSimulation(sessionId: string, totalIterations: number): Promise<void> {
  const settings = readSettings();
  const provider = getProvider();
  const citizenProv = getCitizenProvider();
  const summaries: Array<{ number: number; summary: string }> = [];

  try {
    asyncLogFlusher.start();
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
    const enterpriseRegistry = getEnterpriseRegistry(sessionId);
    const employmentRegistry = getEmploymentRegistry(sessionId);
    let latestMarketBoard: MarketBoardEntry[] = [];

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

    // ── AMM Initialisation ────────────────────────────────────────────────
    // Primary and multi-commodity AMMs are initialised independently so that
    // a desync (one registry populated, the other not) never silently loses state.
    // On server restart, each missing registry fetches the latest DB snapshot
    // and restores only its own pool; fresh sessions fall back to agent-wealth sizing.
    const primaryMissing = !sessionAMMRegistry.has(sessionId);
    const multiMissing = !sessionMultiAMMRegistry.has(sessionId);

    if (primaryMissing || multiMissing) {
      // One DB round-trip covers both registries if both are missing.
      const savedAMM = await economyRepo.getLatestAMMSnapshot(sessionId);
      const avgWealth = citizenAgents.length > 0
        ? Math.round(citizenAgents.reduce((s, a) => s + a.currentStats.wealth, 0) / citizenAgents.length)
        : 50;

      if (primaryMissing) {
        const amm = createAMMForSession(Math.max(citizenAgents.length, 1), avgWealth, 6.0, startIter);
        if (savedAMM?.primary) amm.restore(savedAMM.primary);
        sessionAMMRegistry.set(sessionId, amm);
      }

      if (multiMissing) {
        const multiAMMs = createMultiCommodityAMMs(Math.max(citizenAgents.length, 1), avgWealth, startIter);
        if (savedAMM?.multi) {
          for (const [itemType, pool] of multiAMMs) {
            const savedPool = savedAMM.multi[itemType];
            if (savedPool) pool.restore(savedPool);
          }
        }
        sessionMultiAMMRegistry.set(sessionId, multiAMMs);
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
        sessionAMMRegistry.delete(sessionId);
        sessionMultiAMMRegistry.delete(sessionId);
        sessionAllostaticStates.delete(sessionId);
        sessionIterationMetrics.delete(sessionId);
        sessionSFCTracking.delete(sessionId);
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
      const employmentBoard = buildEmploymentBoardEntries(sessionId);

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
          const ownedEnterprise = [...enterpriseRegistry.values()].find(enterprise => enterprise.ownerId === agent.id);
          const personalStatus = buildPersonalStatus(sessionId, agent.id, ownedEnterprise?.id, agent.currentStats.wealth);

          // Single-pass: one LLM call returns structured JSON with narrative + actionCode.
          // Phase 3: pass role-restricted action set so elite agents see privileged actions.
          const lastActionResults = sessionLastActionResults.get(sessionId)?.get(agent.id);
          const messages = buildNaturalIntentPrompt(
            agent, session, previousSummary, iterNum,
            economyContext, cognitiveContext, isFirstIteration, aliveAgentNames,
            getAllowedActions(agent.role),
            latestMarketBoard,
            employmentBoard,
            personalStatus,
            lastActionResults,
          );

          // throwOnExhaustion: true — after all retries, throw instead of silently defaulting to REST.
          // This surfaces parse/context failures so the simulation can pause rather than
          // produce meaningless REST-filled iterations ("zombie simulation").
          const parsed = await retryWithHealing({
            provider: citizenProv,
            messages,
            options: { model: settings.citizenAgentModel },
            parse: parseSinglePassIntent,
            fallback: {
              intent: '',
              reasoning: '',
              actions: [{ actionCode: 'REST' as ActionCode, parameters: {} }],
              primaryActionCode: 'REST' as ActionCode,
              primaryActionTarget: null,
            },
            throwOnExhaustion: true,
            label: `intent:${agent.name}`,
          });

          // Task 3: Validate actionCodes against the role-allowed set.
          // normalizeActionCode maps hallucinations to 'NONE', but some may still
          // slip through as 'NONE' when the agent intended something else.
          // Here we explicitly drop any code not in the agent's allowed list,
          // preventing hallucinated actions from reaching the physics engine.
          const allowedSet = new Set<string>(getAllowedActions(agent.role));
          let validatedActions = parsed.actions.filter(a => {
            if (!allowedSet.has(a.actionCode)) {
              console.warn(`[HALLUCINATION] ${agent.name} (${agent.role}) returned disallowed code "${a.actionCode}" — dropped`);
              return false;
            }
            return true;
          });
          if (validatedActions.length === 0) {
            console.warn(`[HALLUCINATION] ${agent.name} had no valid actions after filtering — defaulting to REST`);
            validatedActions = [{ actionCode: 'REST' as ActionCode, parameters: {} }];
          }
          const validatedPrimary = validatedActions[0]!;
          const validatedPrimaryTarget = (() => {
            const p = validatedPrimary.parameters;
            const raw = p.target ?? p.agent_id ?? p.enterprise_id;
            return raw && String(raw).toLowerCase() !== 'null' ? String(raw).trim() || null : null;
          })();

          return {
            agentId: agent.id,
            agentName: agent.name,
            intent: parsed.intent.slice(0, 500),
            reasoning: parsed.reasoning,
            actions: validatedActions,
            primaryActionCode: validatedPrimary.actionCode,
            primaryActionTarget: validatedPrimaryTarget,
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
          actionCode: intent.primaryActionCode ?? 'NONE',
          actionTarget: intent.primaryActionTarget ?? null,
          actions: intent.actions?.map(action => ({
            actionCode: action.actionCode,
            parameters: action.parameters,
          })) ?? [],
        });
      }

      // Enqueue intent rows for async batch flush (non-blocking)
      const intentCols = ['id', 'session_id', 'agent_id', 'iteration_id', 'intent', 'reasoning', 'action_code', 'action_target', 'action_queue', 'created_at'];
      for (const intent of intents) {
        asyncLogFlusher.enqueue('agent_intents', intentCols, [
          uuidv4(), sessionId, intent.agentId, iterationId,
          intent.intent, intent.reasoning ?? '',
          intent.primaryActionCode ?? 'NONE', intent.primaryActionTarget ?? null,
          JSON.stringify(intent.actions ?? []),
          now,
        ]);
      }

      // ── Central Agent resolves (standard or map-reduce) ──────────────────
      let resolution: import('../parsers/simulation.js').ParsedResolution;

      const prevIterMetrics = sessionIterationMetrics.get(sessionId) ?? null;

      if (aliveAgents.length > MAPREDUCE_THRESHOLD) {
        // ── Map-Reduce path for large sessions (role-based clustering) ──
        const allIntentsBrief = intents
          .map(i => `- ${i.agentName}: ${i.intent.slice(0, 80)}`)
          .join('\n');

        const groups = clusterByRole(aliveAgents, BATCH_SIZE);
        const groupTasks = groups.map((group, gi) => async () => {
          const groupIntents = intents.filter(i => group.some(a => a.id === i.agentId));
          const msgs = buildGroupResolutionMessages(session, group, groupIntents, allIntentsBrief, iterNum, previousSummary, prevIterMetrics);
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
        const mergeMessages = buildMergeResolutionMessages(session, groupSummaries, iterNum, previousSummary, prevIterMetrics);
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
        const resolutionMessages = buildResolutionPrompt(session, aliveAgents, intents, iterNum, previousSummary, prevIterMetrics);
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

      // ── Hybrid micro-turn execution: per-agent action queues + end-of-week market ──
      const intentMap = new Map(intents.map(i => [i.agentId, i]));
      const outcomeMap = new Map(resolution.agentOutcomes.map(o => [o.agentId, o]));
      const weekStateMap = new Map<string, AgentWeekState>(
        aliveAgents.map(agent => [agent.id, createAgentWeekState(agentEconomyMap.get(agent.id))])
      );
      // Populate employer_id from persisted employment registry
      for (const agent of aliveAgents) {
        const state = weekStateMap.get(agent.id)!;
        state.employer_id = employmentRegistry.get(agent.id)?.enterpriseId ?? null;
      }
      const orderBook = getOrderBook(sessionId);

      const statUpdates: Array<{ id: string; wealth: number; health: number; happiness: number; cortisol: number; dopamine: number }> = [];
      const deaths: Array<{ id: string; iterationNumber: number }> = [];
      const actionRows: Array<typeof resolvedActions.$inferInsert> = [];
      const economyUpdates: Array<{ agentId: string; sessionId: string; skills: SkillMatrix; inventory: Inventory; lastUpdated: number }> = [];
      const humiliatedAgentIds = new Set<string>();


      for (const agent of aliveAgents) {
        const weekState = weekStateMap.get(agent.id)!;
        const agentIntent = intentMap.get(agent.id);
        const queue = (agentIntent?.actions?.slice(0, 3) ?? [{ actionCode: 'NONE', parameters: {} }]) as QueuedActionInstruction[];
        let runningWealth = agent.currentStats.wealth;
        let runningHealth = agent.currentStats.health;
        let runningHappiness = agent.currentStats.happiness;
        let runningCortisol = agent.currentStats.cortisol ?? 20;
        let runningDopamine = agent.currentStats.dopamine ?? 50;

        for (const action of queue) {
          const rawTarget = action.parameters?.target ?? action.parameters?.agent_id;
          const targetText = typeof rawTarget === 'string' ? rawTarget.toLowerCase() : '';
          const targetAgent = aliveAgents.find(a => a.id === rawTarget || a.name.toLowerCase() === targetText);

          const economyDelta = applyEnterpriseAction({
            sessionId,
            iterationNumber: iterNum,
            agent,
            action,
            state: weekState,
            allWeekStates: weekStateMap,
            enterpriseRegistry,
            employmentRegistry,
            orderBook,
            amm: sessionAMMRegistry.get(sessionId),
            multiAMMs: sessionMultiAMMRegistry.get(sessionId),
          });

          const physics = resolveAction({
            agent: {
              ...agent,
              currentStats: {
                ...agent.currentStats,
                wealth: runningWealth,
                health: runningHealth,
                happiness: runningHappiness,
                cortisol: runningCortisol,
                dopamine: runningDopamine,
              },
            },
            actionCode: action.actionCode,
            actionTarget: targetAgent?.id,
            allAgents: aliveAgents,
            skills: weekState.skills,
            inventory: weekState.inventory,
            economyDeltas: economyDelta,
            isSabotaged: sabotageRegistry.has(agent.id),
            isSuppressed: suppressRegistry.has(agent.id),
          });

          weekState.executedActions.push(action);
          weekState.wealthDelta += physics.wealthDelta;
          weekState.healthDelta += physics.healthDelta;
          weekState.happinessDelta += physics.happinessDelta;
          weekState.cortisolDelta += physics.cortisolDelta;
          weekState.dopamineDelta += physics.dopamineDelta;

          runningWealth = clampWealth(runningWealth + physics.wealthDelta);
          runningHealth = clampStat(runningHealth + physics.healthDelta);
          runningHappiness = clampStat(runningHappiness + physics.happinessDelta);
          runningCortisol = clampStat(runningCortisol + physics.cortisolDelta);
          runningDopamine = clampStat(runningDopamine + physics.dopamineDelta);

          weekState.skills = processSkills(weekState.skills, action.actionCode);

          if (runningHealth < 20) {
            weekState.interrupted = true;
            weekState.interruptedReason = 'starvation';
            break;
          }
          if (runningCortisol > 90) {
            weekState.interrupted = true;
            weekState.interruptedReason = 'mental_breakdown';
            break;
          }
        }
      }

      // ── Non-food order book matching (raw_materials, tools, luxury_goods) ─
      // Food trades were executed immediately via AMM above; only non-food
      // orders remain in the order book and require peer matching.
      const trades = orderBook.matchOrders();
      for (const trade of trades) {
        const buyerState = weekStateMap.get(trade.buyerId);
        const sellerState = weekStateMap.get(trade.sellerId);
        if (buyerState) {
          buyerState.wealthDelta -= trade.executionPrice * trade.quantity;
          buyerState.inventory[trade.itemType].quantity += trade.quantity;
          buyerState.events.push(`Bought ${trade.quantity} ${trade.itemType} at ${trade.executionPrice}`);
        }
        if (sellerState) {
          sellerState.wealthDelta += trade.executionPrice * trade.quantity;
          sellerState.events.push(`Sold ${trade.quantity} ${trade.itemType} at ${trade.executionPrice}`);
        }
      }

      // ── Wage Settlement & Bankruptcy Check ───────────────────────────────
      // Group employees by enterprise, check if the owner can cover all wages,
      // then either pay in full or declare bankruptcy with proportional liquidation.
      let bankruptciesThisIter = 0;
      {
        // Build per-enterprise wage obligation map: enterpriseId → [employmentRecords that worked]
        const enterpriseWorkers = new Map<string, EmploymentRecord[]>();
        for (const employment of employmentRegistry.values()) {
          const employeeState = weekStateMap.get(employment.employeeId);
          if (!employeeState) continue;
          if (employeeState.workedEnterpriseId === employment.enterpriseId) {
            const list = enterpriseWorkers.get(employment.enterpriseId) ?? [];
            list.push(employment);
            enterpriseWorkers.set(employment.enterpriseId, list);
          } else if (employeeState.quitEnterpriseId !== employment.enterpriseId) {
            // Missed shift penalty
            employeeState.cortisolDelta += 10;
            employeeState.happinessDelta -= 5;
            employeeState.events.push(`Failed to fulfill employment obligation at ${employment.enterpriseId}`);
          }
        }

        for (const [enterpriseId, workers] of enterpriseWorkers) {
          const enterprise = enterpriseRegistry.get(enterpriseId);
          if (!enterprise) continue;
          const ownerState = weekStateMap.get(enterprise.ownerId);
          if (!ownerState) continue;

          const totalWageObligation = workers.reduce((sum, e) => sum + e.wage, 0);
          const ownerAvailableWealth = enterprise.ownerId
            ? (aliveAgents.find(a => a.id === enterprise.ownerId)?.currentStats.wealth ?? 0) + ownerState.wealthDelta
            : 0;

          if (ownerAvailableWealth >= totalWageObligation) {
            // ── Solvent: pay all employees in full ──
            for (const employment of workers) {
              const employeeState = weekStateMap.get(employment.employeeId);
              if (!employeeState) continue;
              ownerState.wealthDelta -= employment.wage;
              ownerState.events.push(`Paid wage ${employment.wage} to ${employment.employeeId}`);
              employeeState.wealthDelta += employment.wage;
              employeeState.events.push(`Received wage ${employment.wage} from ${enterpriseId}`);
            }
          } else {
            // ── Insolvent: proportional liquidation then bankruptcy ──
            bankruptciesThisIter++;
            const liquidatable = Math.max(0, ownerAvailableWealth);
            const payRatio = totalWageObligation > 0 ? liquidatable / totalWageObligation : 0;

            for (const employment of workers) {
              const employeeState = weekStateMap.get(employment.employeeId);
              if (!employeeState) continue;
              const partialPay = Math.floor(employment.wage * payRatio);
              if (partialPay > 0) {
                ownerState.wealthDelta -= partialPay;
                employeeState.wealthDelta += partialPay;
                employeeState.events.push(`Partial wage ${partialPay}/${employment.wage} from bankrupt enterprise ${enterpriseId}`);
              } else {
                employeeState.events.push(`Wage unpaid — enterprise ${enterpriseId} declared bankruptcy`);
              }
              // Release employee from this enterprise
              employmentRegistry.delete(employment.employeeId);
              enterprise.employees.delete(employment.employeeId);
              const empWeekState = weekStateMap.get(employment.employeeId);
              if (empWeekState) empWeekState.employer_id = null;
              employeeState.cortisolDelta += 20;
              employeeState.happinessDelta -= 15;
            }

            // Punish owner
            ownerState.events.push(`CRITICAL: Your enterprise ${enterpriseId} went bankrupt! You failed to pay your workers and lost your business.`);
            ownerState.cortisolDelta += 40;
            ownerState.happinessDelta -= 30;

            // Dissolve enterprise
            enterpriseRegistry.delete(enterpriseId);
          }
        }
      }

      const TAX_PER_AGENT = 3;
      for (const intent of intents) {
        const taxActions = intent.actions?.filter(action => action.actionCode === 'ADJUST_TAX') ?? [];
        if (taxActions.length === 0) continue;
        const taxerState = weekStateMap.get(intent.agentId);
        const taxableAgents = aliveAgents.filter(a =>
          !a.isCentralAgent && a.id !== intent.agentId && getRoleTier(a.role) !== 'elite'
        );
        // SFC-safe: accumulate only what each agent can actually pay — no ghost minting.
        let actualTaxCollected = 0;
        for (const taxed of taxableAgents) {
          const taxedState = weekStateMap.get(taxed.id);
          if (!taxedState) continue;
          const required = TAX_PER_AGENT * taxActions.length;
          const availableWealth = taxed.currentStats.wealth + taxedState.wealthDelta;
          const actualDeduction = Math.min(required, Math.max(0, availableWealth));
          taxedState.wealthDelta -= actualDeduction;
          actualTaxCollected += actualDeduction;
          taxedState.cortisolDelta += 5 * taxActions.length;
          taxedState.happinessDelta -= 3 * taxActions.length;
        }
        // Taxer receives only what was actually collected
        if (taxerState) taxerState.wealthDelta += actualTaxCollected;
      }

      // ── MET Metabolism: replace flat -1 food with physiological depletion ─
      for (const agent of aliveAgents) {
        const weekState = weekStateMap.get(agent.id)!;
        applyMETMetabolism(weekState, { ...agent, currentWealth: agent.currentStats.wealth }, sessionId, iterNum);
      }

      // ── Allostatic Load Pipeline: cortisol → strain → load → health ───────
      {
        let sessionAlloStates = sessionAllostaticStates.get(sessionId);
        if (!sessionAlloStates) {
          sessionAlloStates = new Map();
          sessionAllostaticStates.set(sessionId, sessionAlloStates);
        }
        for (const agent of aliveAgents) {
          const weekState = weekStateMap.get(agent.id)!;
          const currentCortisol = clampStat((agent.currentStats.cortisol ?? 20) + weekState.cortisolDelta);
          const priorState = sessionAlloStates.get(agent.id) ?? { allostaticStrain: 0, allostaticLoad: 0 };
          const engine = new AllostaticEngine(priorState);
          const alloResult = engine.tick({ cortisol: currentCortisol, state: priorState });
          if (alloResult.healthDelta < 0) {
            weekState.healthDelta += alloResult.healthDelta;
            weekState.events.push(
              `Allostatic overload: health ${alloResult.healthDelta.toFixed(1)} (strain: ${alloResult.updatedState.allostaticStrain.toFixed(1)}, load: ${alloResult.updatedState.allostaticLoad.toFixed(1)})`
            );
          }
          sessionAlloStates.set(agent.id, alloResult.updatedState);
        }
      }

      // ── Demurrage UBI: 2% wealth tax → redistributed as equal UBI ─────────
      {
        const agentWealthList: AMMAgentWealth[] = aliveAgents.map(agent => ({
          agentId: agent.id,
          wealth: clampWealth(agent.currentStats.wealth + (weekStateMap.get(agent.id)?.wealthDelta ?? 0)),
        }));
        const demurrage = computeDemurrageCycle(agentWealthList);
        for (const [agentId, netDelta] of demurrage.netDeltas) {
          const weekState = weekStateMap.get(agentId);
          if (!weekState) continue;
          weekState.wealthDelta += netDelta;
          if (netDelta > 0.5) {
            weekState.events.push(`UBI received: +${netDelta.toFixed(1)} fiat (demurrage redistribution)`);
          } else if (netDelta < -0.5) {
            weekState.events.push(`Demurrage tax: ${netDelta.toFixed(1)} fiat (2% wealth decay)`);
          }
        }
      }


      // ── Market board: AMM spot price for food + order book for other items ─
      const sessionAMM = sessionAMMRegistry.get(sessionId);
      const marketState = orderBook.getMarketState();
      latestMarketBoard = buildMarketBoardEntries(sessionId, marketState);
      if (sessionAMM) {
        // Inject AMM food spot price into market board (overrides order book food entry)
        const ammFoodPrice = Math.round(sessionAMM.spotPrice * 100) / 100;
        const prevFoodPrice = sessionPriceHistory.get(sessionId)?.get('food');
        let ammFoodTrend: MarketBoardEntry['trend'] = 'unknown';
        if (prevFoodPrice == null) ammFoodTrend = 'new';
        else if (ammFoodPrice > prevFoodPrice) ammFoodTrend = 'up';
        else if (ammFoodPrice < prevFoodPrice) ammFoodTrend = 'down';
        else ammFoodTrend = 'flat';
        // Replace or prepend food entry
        const withoutFood = latestMarketBoard.filter(e => e.itemType !== 'food');
        // Compute profit signal for PRODUCE_AND_SELL food
        const BASE_FOOD_PRODUCTION = 4;
        const INITIAL_FOOD_SPOT_PRICE = 6.0;
        const priceRatio = ammFoodPrice / INITIAL_FOOD_SPOT_PRICE;
        let foodProfitAlert: string | undefined;
        if (priceRatio >= 1.5) {
          const expectedProfit = Math.round(ammFoodPrice * BASE_FOOD_PRODUCTION);
          const pctAbove = Math.round((priceRatio - 1) * 100);
          const scarcityLabel = priceRatio >= 10 ? 'EXTREME FAMINE — CRITICAL SHORTAGE'
            : priceRatio >= 5 ? 'SEVERE FOOD SHORTAGE'
              : priceRatio >= 2 ? 'HIGH SCARCITY'
                : 'ELEVATED DEMAND';
          foodProfitAlert = `🚨 PROFIT ALERT: Food is ${scarcityLabel} (Spot Price: ${ammFoodPrice} Wealth/unit, +${pctAbove}% above baseline). Executing [PRODUCE_AND_SELL] for 'Food' will yield an estimated ${expectedProfit} Wealth this week. This is currently the most lucrative action in the economy.`;
        }
        latestMarketBoard = [{ itemType: 'food', averageClearingPrice: ammFoodPrice, trend: ammFoodTrend, profitAlert: foodProfitAlert }, ...withoutFood];
        // Update price history for food from AMM
        let priceHist = sessionPriceHistory.get(sessionId);
        if (!priceHist) { priceHist = new Map(); sessionPriceHistory.set(sessionId, priceHist); }
        priceHist.set('food', ammFoodPrice);
      }
      // Add multi-commodity AMM spot prices to market board
      const multiAMMsForBoard = sessionMultiAMMRegistry.get(sessionId);
      if (multiAMMsForBoard) {
        const multiEntries = Array.from(multiAMMsForBoard.entries()).map(([itemType, pool]) => {
          const spotPrice = Math.round(pool.spotPrice * 100) / 100;
          return { itemType, averageClearingPrice: spotPrice, trend: 'unknown' as const };
        });
        latestMarketBoard = [
          ...latestMarketBoard,
          ...multiEntries.filter(e => !latestMarketBoard.some(m => m.itemType === e.itemType)),
        ];
      }
      updatePriceHistory(sessionId, marketState.priceIndices);
      orderBook.reset();

      for (const agent of aliveAgents) {
        const outcome = outcomeMap.get(agent.id);
        const agentIntent = intentMap.get(agent.id);
        const weekState = weekStateMap.get(agent.id)!;

        let newWealth = clampWealth(agent.currentStats.wealth + weekState.wealthDelta);
        let newHealth = clampStat(agent.currentStats.health + weekState.healthDelta);
        let newHappiness = clampStat(agent.currentStats.happiness + weekState.happinessDelta);
        let newCortisol = clampStat((agent.currentStats.cortisol ?? 20) + weekState.cortisolDelta);
        let newDopamine = clampStat((agent.currentStats.dopamine ?? 50) + weekState.dopamineDelta);

        // Task 1: Psychological clamping — cap Happiness based on physiological state.
        // Prevents LLM hallucinations of "100 Happiness" while starving to death.
        newHappiness = clampHappinessByPhysiology(newHappiness, newHealth, newCortisol);

        const shouldDie = (outcome?.died === true) || newHealth <= 0;
        const shouldHumiliate = !shouldDie && newHealth < 20 && weekState.inventory.food.quantity <= 0;

        if (shouldDie) {
          deaths.push({ id: agent.id, iterationNumber: iterNum });
          const lifecycleEvent = resolution.lifecycleEvents?.find(
            (e: { type: string; agentId: string; detail?: string }) => e.agentId === agent.id && e.type === 'death'
          );
          const deathReason = lifecycleEvent?.detail ?? (newHealth <= 0 ? 'health depleted to zero' : 'fatal circumstances');
          deathReasonMap.set(agent.id, { iteration: iterNum, reason: deathReason });
        } else if (shouldHumiliate) {
          humiliatedAgentIds.add(agent.id);
          newHealth = 30;
          newWealth = 0;
          newCortisol = 100;
        }

        statUpdates.push({
          id: agent.id,
          wealth: newWealth,
          health: newHealth,
          happiness: newHappiness,
          cortisol: newCortisol,
          dopamine: newDopamine,
        });

        // Task 4: Build action-result feedback for next iteration's prompt injection
        {
          const wDelta = newWealth - agent.currentStats.wealth;
          const hDelta = newHealth - agent.currentStats.health;
          const hapDelta = newHappiness - agent.currentStats.happiness;
          const lines: string[] = [];
          if (weekState.executedActions.length > 0) {
            lines.push(`Actions taken: ${weekState.executedActions.map(a => a.actionCode).join(', ')}`);
          }
          const economyLines = weekState.events.filter(e =>
            /sold|bought|produced|wage|starv|food|fail|UBI|demurrage|AMM|market|hired|quit|enterprise/i.test(e)
          ).slice(0, 6);
          if (economyLines.length > 0) lines.push(...economyLines.map(e => `• ${e}`));
          lines.push(`Net changes: Wealth ${wDelta >= 0 ? '+' : ''}${wDelta}, Health ${hDelta >= 0 ? '+' : ''}${hDelta}, Happiness ${hapDelta >= 0 ? '+' : ''}${hapDelta}`);
          if (weekState.interrupted) {
            lines.push(`⚠️ Action queue interrupted: ${weekState.interruptedReason}`);
          }
          const resultText = `[Week ${iterNum} Results]\n${lines.join('\n')}`;
          let agentResults = sessionLastActionResults.get(sessionId);
          if (!agentResults) { agentResults = new Map(); sessionLastActionResults.set(sessionId, agentResults); }
          agentResults.set(agent.id, resultText);
        }

        for (const action of weekState.executedActions) {
          const rawTarget = action.parameters?.target ?? action.parameters?.agent_id;
          const targetText = typeof rawTarget === 'string' ? rawTarget.toLowerCase() : '';
          const targetAgent = aliveAgents.find(a => a.id === rawTarget || a.name.toLowerCase() === targetText);
          if (action.actionCode === 'SABOTAGE' && targetAgent) {
            sabotageRegistry.set(targetAgent.id, 3);
          }
          if (action.actionCode === 'SUPPRESS' && targetAgent) {
            suppressRegistry.set(targetAgent.id, 2);
            const targetUpdate = statUpdates.find(u => u.id === targetAgent.id);
            if (targetUpdate) {
              targetUpdate.cortisol = clampStat(targetUpdate.cortisol + 25);
              targetUpdate.happiness = clampStat(targetUpdate.happiness - 10);
            }
          }
        }

        economyUpdates.push({
          agentId: agent.id,
          sessionId,
          skills: weekState.skills,
          inventory: weekState.inventory,
          lastUpdated: iterNum,
        });

        actionRows.push({
          id: uuidv4(),
          sessionId,
          agentId: agent.id,
          iterationId,
          action: outcome?.outcome ?? agentIntent?.intent ?? 'No action.',
          outcome: JSON.stringify({
            text: outcome?.outcome ?? agentIntent?.intent ?? 'No action.',
            actionQueue: weekState.executedActions,
            wealthDelta: weekState.wealthDelta,
            healthDelta: weekState.healthDelta,
            happinessDelta: weekState.happinessDelta,
            // Final clamped stat values after physiology clamping and lifecycle events.
            // Used by /agent-stats to reconstruct per-agent history accurately.
            finalWealth: newWealth,
            finalHealth: newHealth,
            finalHappiness: newHappiness,
            interrupted: weekState.interrupted,
            interruptedReason: weekState.interruptedReason,
            economyEvents: weekState.events,
            foodAfterMetabolism: weekState.inventory.food.quantity,
          }),
          resolvedAt: now,
        });
      }

      const cognitivePostInputs: CognitivePostInput[] = aliveAgents.map(agent => {
        const agentIntent = intentMap.get(agent.id);
        const weekState = weekStateMap.get(agent.id)!;
        const isHumiliated = humiliatedAgentIds.has(agent.id);
        return {
          agentId: agent.id,
          sessionId,
          iteration: iterNum,
          actionPerformed: isHumiliated
            ? `[HUMILIATION] I ran out of resources and was force-fed synthetic slop by the state. My remaining wealth was stripped. I am at the absolute bottom of society. I feel extreme rage and despair.`
            : (agentIntent?.intent ?? 'continued routine'),
          actionCode: agentIntent?.primaryActionCode ?? 'NONE',
          wealthDelta: isHumiliated ? -agent.currentStats.wealth : weekState.wealthDelta,
          healthDelta: isHumiliated ? -(agent.currentStats.health - 30) : weekState.healthDelta,
          happinessDelta: isHumiliated ? -20 : weekState.happinessDelta,
          economyEvents: weekState.events,
          isStarving: weekState.inventory.food.quantity <= 0,
          narrativeSummary: resolution.narrativeSummary,
        };
      });
      runCognitivePostProcessing(cognitivePostInputs);

      // ── Compute employment metrics ────────────────────────────────────────
      {
        const totalWorked = [...weekStateMap.values()].filter(ws => ws.workedEnterpriseId !== null).length;
        const unemployedAgents = aliveAgents.filter(a => !employmentRegistry.has(a.id));
        const avgUnemployedWealth = unemployedAgents.length > 0
          ? Math.round(unemployedAgents.reduce((s, a) => s + a.currentStats.wealth, 0) / unemployedAgents.length)
          : 0;
        const bankruptcyNote = bankruptciesThisIter > 0
          ? ` ${bankruptciesThisIter} enterprise${bankruptciesThisIter > 1 ? 's' : ''} went bankrupt this week, causing a spike in unemployment.`
          : '';
        sessionIterationMetrics.set(sessionId,
          `System Metrics (iteration ${iterNum}): ${totalWorked}/${aliveAgents.length} agents successfully worked. ${unemployedAgents.length} total unemployed. Average unemployed wealth: ${avgUnemployedWealth}.${bankruptcyNote}`
        );
      }

      // ── Telemetry: push per-iteration physics snapshot ────────────────────
      // Declared outside the block so it can be embedded in the statistics JSON below.
      let iterTelemetry: TelemetryLog | null = null;
      {
        const sessionAMMForTelemetry = sessionAMMRegistry.get(sessionId);
        const multiAMMsForTelemetry = sessionMultiAMMRegistry.get(sessionId);
        const multiAMMFiatTotal = multiAMMsForTelemetry
          ? [...multiAMMsForTelemetry.values()].reduce((sum, pool) => sum + pool.currentFiatReserve, 0)
          : 0;
        const totalFiatSupply = statUpdates.reduce((sum, u) => sum + u.wealth, 0)
          + (sessionAMMForTelemetry?.currentFiatReserve ?? 0)
          + multiAMMFiatTotal;
        const totalCaloriesBurned = [...weekStateMap.values()].reduce((sum, ws) => sum + ws.caloriesBurned, 0);
        const totalCaloriesProduced = [...weekStateMap.values()].reduce((sum, ws) => sum + ws.caloriesProduced, 0);
        const totalFailedActions = [...weekStateMap.values()].reduce((sum, ws) => sum + ws.failedActionCount, 0);
        const totalActionSlots = aliveAgents.length * 3; // max 3 actions per agent per iteration
        const actionFailureRate = totalActionSlots > 0
          ? Math.round((totalFailedActions / totalActionSlots) * 1000) / 1000
          : 0;
        iterTelemetry = {
          iterationNumber: iterNum,
          totalFiatSupply: Math.round(totalFiatSupply),
          ammFoodReserve_Y: Math.round((sessionAMMForTelemetry?.currentFoodReserve ?? 0) * 100) / 100,
          ammFiatReserve_X: Math.round(sessionAMMForTelemetry?.currentFiatReserve ?? 0),
          ammSpotPrice_Food: Math.round((sessionAMMForTelemetry?.spotPrice ?? 0) * 100) / 100,
          totalCaloriesBurned: Math.round(totalCaloriesBurned * 10) / 10,
          totalCaloriesProduced: Math.round(totalCaloriesProduced),
          actionFailureRate,
        };
        let logs = sessionTelemetryLogs.get(sessionId);
        if (!logs) { logs = []; sessionTelemetryLogs.set(sessionId, logs); }
        logs.push(iterTelemetry);
      }

      sqlite.transaction(() => {
        if (statUpdates.length > 0) {
          agentRepo.bulkUpdateStats(statUpdates);
        }
        if (deaths.length > 0) {
          agentRepo.bulkMarkDead(deaths);
        }
      })();

      if (economyUpdates.length > 0) {
        await economyRepo.bulkUpsertAgentEconomy(economyUpdates);
        for (const eu of economyUpdates) {
          agentEconomyMap.set(eu.agentId, eu);
        }
      }

      const snapshot = {
        iteration: iterNum,
        market: marketState,
        contracts: [...employmentRegistry.values()].map(contract => ({
          employerId: contract.employerId,
          employeeId: contract.employeeId,
          wage: contract.wage,
          startedAt: contract.startedAt,
        })),
        summary: {
          totalWealth: aliveAgents.reduce((sum, agent) => sum + clampWealth(agent.currentStats.wealth + (weekStateMap.get(agent.id)?.wealthDelta ?? 0)), 0),
          totalFood: aliveAgents.reduce((sum, agent) => sum + (weekStateMap.get(agent.id)?.inventory.food.quantity ?? 0), 0),
          totalTools: aliveAgents.reduce((sum, agent) => sum + (weekStateMap.get(agent.id)?.inventory.tools.quantity ?? 0), 0),
          avgSkillLevel: aliveAgents.length > 0
            ? Math.round(
              aliveAgents.reduce((sum, agent) => sum + getAgentPeakSkill(weekStateMap.get(agent.id)!.skills), 0) / aliveAgents.length
            )
            : 0,
          activeContracts: employmentRegistry.size,
        },
      };
      await economyRepo.saveSnapshot(sessionId, iterNum, snapshot);
      if (marketState.priceIndices.length > 0) {
        await economyRepo.savePriceIndices(sessionId, iterNum, marketState.priceIndices);
      }

      // ── Persist AMM state for SFC resilience across server restarts ───────
      {
        const ammToPersist = sessionAMMRegistry.get(sessionId);
        const multiAMMsToPersist = sessionMultiAMMRegistry.get(sessionId);
        if (ammToPersist) {
          const multiRecord: Record<string, ReturnType<typeof ammToPersist.snapshot>> = {};
          if (multiAMMsToPersist) {
            for (const [itemType, pool] of multiAMMsToPersist) {
              multiRecord[itemType] = pool.snapshot(iterNum);
            }
          }
          await economyRepo.saveAMMSnapshot(sessionId, iterNum, ammToPersist.snapshot(iterNum), multiRecord);
          // Vacuum old snapshots every 10 iterations to reduce WAL write amplification.
          // Retains decadal rows + the latest for crash recovery.
          if (iterNum % 10 === 0) economyRepo.vacuumAMMSnapshots(sessionId);
        }
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

      // ── SFC assertion: detect unexpected fiat creation or destruction ─────
      // The economy is fully closed-loop. Every transfer must be zero-sum.
      // If total fiat (agent wealth + all AMM reserves) drifts beyond ±0.1 from
      // the initial baseline, log a critical warning.
      {
        const sfcAMM = sessionAMMRegistry.get(sessionId);
        const sfcMultiAMMs = sessionMultiAMMRegistry.get(sessionId);
        const sfcMultiAMMFiat = sfcMultiAMMs
          ? [...sfcMultiAMMs.values()].reduce((sum, pool) => sum + pool.currentFiatReserve, 0)
          : 0;
        const sfcActual = agents.reduce((sum, a) => sum + a.currentStats.wealth, 0)
          + (sfcAMM?.currentFiatReserve ?? 0)
          + sfcMultiAMMFiat;

        let sfcEntry = sessionSFCTracking.get(sessionId);
        if (!sfcEntry) {
          // First iteration: establish baseline
          sfcEntry = { initialFiat: sfcActual };
          sessionSFCTracking.set(sessionId, sfcEntry);
        } else {
          const drift = sfcActual - sfcEntry.initialFiat;
          if (Math.abs(drift) > 0.1) {
            console.error(
              `🚨 CRITICAL SFC LEAK DETECTED! Session ${sessionId} iter ${iterNum}: ` +
              `Fiat drifted by ${drift > 0 ? '+' : ''}${drift.toFixed(4)} ` +
              `(expected ${sfcEntry.initialFiat.toFixed(2)}, actual ${sfcActual.toFixed(2)})`
            );
          }
        }
      }

      // ── Race guard: abort-reset may have fired mid-iteration ─────────────
      // The route handler erases the DB as soon as the abort is signaled.
      // If we reach here while abort is in flight, skip persisting the
      // iteration row — otherwise one ghost row survives the erase and
      // causes the next simulation to start at the wrong iteration number.
      if (simulationManager.isAbortRequested(sessionId)) {
        asyncLogFlusher.stop();
        cleanupSessionEconomy(sessionId);
        cleanupSessionCognition(sessionId);
        sessionAMMRegistry.delete(sessionId);
        sessionMultiAMMRegistry.delete(sessionId);
        sessionAllostaticStates.delete(sessionId);
        sessionIterationMetrics.delete(sessionId);
        sessionSFCTracking.delete(sessionId);
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
      // Embed telemetry in the statistics blob so it survives server restarts
      // and is available even when the in-memory map has been cleared.
      const statsWithTelemetry = iterTelemetry
        ? { ...stats, _telemetry: iterTelemetry }
        : stats;
      await db.insert(iterationsTable).values({
        id: iterationId,
        sessionId,
        iterationNumber: iterNum,
        stateSummary: resolution.narrativeSummary,
        statistics: JSON.stringify(statsWithTelemetry),
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
      // Skipped when early stopping is disabled by the user.
      const COLLAPSE_CORTISOL = 95;
      const COLLAPSE_HAPPINESS = 5;
      const avgCor = stats.avgCortisol ?? 0;
      if (simulationManager.isEarlyStoppingEnabled(sessionId) &&
          (avgCor >= COLLAPSE_CORTISOL || stats.avgHappiness <= COLLAPSE_HAPPINESS)) {
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
          `Final wealth: ${agent.currentStats.wealth}`,
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
    // Tick-based engines cleanup
    sessionAMMRegistry.delete(sessionId);
    sessionMultiAMMRegistry.delete(sessionId);
    sessionAllostaticStates.delete(sessionId);
    sessionLastActionResults.delete(sessionId);
    sessionIterationMetrics.delete(sessionId);
    sessionTelemetryLogs.delete(sessionId);
    sessionSFCTracking.delete(sessionId);

    await sessionRepo.updateStage(sessionId, 'simulation-complete');
    simulationManager.broadcast(sessionId, { type: 'simulation-complete', finalReport });
    simulationManager.finish(sessionId);
  } catch (err) {
    asyncLogFlusher.stop();
    cleanupSessionEconomy(sessionId);
    cleanupSessionCognition(sessionId);
    sessionAMMRegistry.delete(sessionId);
    sessionMultiAMMRegistry.delete(sessionId);
    sessionAllostaticStates.delete(sessionId);
    sessionLastActionResults.delete(sessionId);
    sessionIterationMetrics.delete(sessionId);
    sessionTelemetryLogs.delete(sessionId);
    sessionSFCTracking.delete(sessionId);

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
