# Ideal World — Tick-Based Architecture: Comprehensive Implementation Guide

**Branch:** `dev-tick`
**Scope:** Massive refactor of `simulationRunner.ts`, `physicsEngine.ts`, `prompts.ts`, `actionCodes.ts`, and supporting modules.
**Philosophy:** Strictly preserve the Neuro-Symbolic boundary — LLMs (Neuro) dictate intent and narrative; the Physics Engine (Symbolic) handles all deterministic math.

---

## Architectural Overview: From Iteration to Tick

### Current State (Turn-Based)
```
Iteration N → [Prompt ALL agents] → [Collect ALL intents] → [Central Agent resolves] → [Apply deltas] → Iteration N+1
```

### Target State (Tick-Based)
```
Tick T (1 in-game hour) → [Passive needs decay] → [Check interrupts] → [Advance active task timers] → [Emit SSE] → Tick T+1
                                                      ↓ (async, event-driven)
                          [LLM prompted ONLY when agent finishes task OR needs interrupt fires OR economic trigger received]
```

**Key Invariants to Preserve:**
- Frontend `requestAnimationFrame` double-buffering in `simulationStore.ts` — **do not touch**.
- `asyncLogFlusher` pattern for DB writes — **extend, don't replace**.
- `retryWithHealing` for all LLM calls — **keep intact**.
- `MAPREDUCE_THRESHOLD` / `clusterByRole` — **adapt for async batch prompting, not remove**.

---

## Phase 1: The Tick Engine & Needs Metabolism

### 1.1 New Type Definitions (`shared/src/types.ts`)

Add the following types to the shared package. These represent the new real-time agent state:

```typescript
/** An agent's currently active long-running task */
export interface ActiveTask {
  taskId: string;           // uuid
  actionCode: ActionCode;   // e.g., 'PRODUCE_AND_SELL', 'WORK_AT_ENTERPRISE'
  startTick: number;        // global tick when task started
  durationTicks: number;    // total ticks required (e.g., 8 for PRODUCE_AND_SELL)
  targetId?: string;        // enterprise ID or agent ID
  metadata?: Record<string, unknown>; // arbitrary task params
}

/** Dynamic biological/psychological needs (0–100 scale) */
export interface AgentNeeds {
  satiety: number;          // Hunger proxy. 0 = starving, 100 = full
  cortisol: number;         // Stress/mental health. 0 = calm, 100 = breakdown
  energy: number;           // Sleep/fatigue. 0 = exhausted, 100 = rested
}

/** Extended agent state for tick simulation */
export interface TickAgentState extends AgentNeeds {
  activeTask: ActiveTask | null;
  lastPromptedTick: number;
  pendingInterrupt: NeedsInterrupt | null;
}

/** Fired by the Symbolic engine when needs cross thresholds */
export interface NeedsInterrupt {
  type: 'STARVATION' | 'MENTAL_BREAK' | 'EXHAUSTION';
  severity: 'warning' | 'critical';
  injectedDirective: string; // e.g., "You are starving. Buy food IMMEDIATELY."
  firedAtTick: number;
}
```

**Why:** These types form the data contract between the Symbolic tick engine and the Neuro LLM layer. The `pendingInterrupt` field is the exact mechanism by which the Physics Engine "speaks" to the LLM without doing math inside prompts.

---

### 1.2 Tick State Store (`server/src/orchestration/tickStateStore.ts`)

**Create a new file** — a lightweight in-memory store for the mutable per-tick agent state (not persisted on every tick, only flushed to DB periodically):

```typescript
/**
 * In-memory tick state for running simulation.
 * Avoids per-tick DB reads for hot-path needs data.
 * Flushed to DB every N ticks or on task completion.
 */
export class TickStateStore {
  private states = new Map<string, TickAgentState>();
  private globalTick = 0;

  init(agents: Agent[]): void {
    this.globalTick = 0;
    for (const agent of agents) {
      this.states.set(agent.id, {
        satiety: 70,
        cortisol: agent.currentStats.cortisol ?? 20,
        energy: 80,
        activeTask: null,
        lastPromptedTick: -1,
        pendingInterrupt: null,
      });
    }
  }

  get(agentId: string): TickAgentState | undefined {
    return this.states.get(agentId);
  }

  set(agentId: string, state: Partial<TickAgentState>): void {
    const existing = this.states.get(agentId);
    if (existing) this.states.set(agentId, { ...existing, ...state });
  }

  incrementTick(): number {
    return ++this.globalTick;
  }

  getCurrentTick(): number {
    return this.globalTick;
  }

  /** Dump all states for DB flush — called every 10 ticks */
  snapshot(): Map<string, TickAgentState> {
    return new Map(this.states);
  }
}

export const tickStateStore = new TickStateStore();
```

**Why a separate store vs. DB:** Each tick runs at potentially 100ms–500ms intervals. Reading/writing all agent needs to SQLite on every tick for 150 agents would cause the same `SQLITE_BUSY` deadlocks the `asyncLogFlusher` was designed to solve. Keep hot data in-memory; flush cold snapshots asynchronously.

---

### 1.3 Needs Decay Engine (`server/src/mechanics/physicsEngine.ts` — new function)

Add a pure, deterministic function to compute needs decay per tick. This belongs in `physicsEngine.ts` because it is entirely Symbolic (no LLM involvement):

```typescript
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
```

**High-Cortisol Action Penalty** — also add to `resolveAction`:
```typescript
// In resolveAction(), before computing productionMult:
const cortisolPenalty = (input.agentNeeds?.cortisol ?? 0) >= 80 ? 0.5 : 1.0;
const productionMult = skillMult * toolMult * sabotageMult * cortisolPenalty;
```

---

### 1.4 The Tick Loop (`server/src/orchestration/simulationRunner.ts` — core refactor)

This is the most invasive change. The existing `runSimulation()` function with its `for (let iterNum = startIter; iterNum <= endIter; iterNum++)` loop must be replaced.

**New loop structure:**

```typescript
export async function runSimulation(sessionId: string, totalTicks: number): Promise<void> {
  // ... existing setup (settings, providers, session load, DB init) ...

  // NEW: Initialize tick state
  tickStateStore.init(agents);

  // Queue of agents awaiting LLM prompting (async, not blocking tick)
  const promptQueue = new Map<string, 'needs-interrupt' | 'task-complete' | 'economic-trigger'>();

  // ── TICK LOOP ────────────────────────────────────────────────────────────
  for (let tick = 0; tick < totalTicks; tick++) {
    // 1. Check pause/abort (same as existing)
    if (simulationManager.isPaused(sessionId)) { /* ... existing pause logic ... */ }
    if (simulationManager.isAborted(sessionId)) break;

    const currentTick = tickStateStore.incrementTick();

    // 2. Emit tick-start SSE (replaces iteration-start)
    emit({ type: 'tick-start', tick: currentTick });

    // 3. SYMBOLIC: Apply passive needs decay for ALL agents (pure math, no LLM)
    for (const agent of aliveAgents) {
      const tickState = tickStateStore.get(agent.id)!;
      const activeCode = tickState.activeTask?.actionCode;

      const decayResult = applyNeedsDecay({
        needs: { satiety: tickState.satiety, cortisol: tickState.cortisol, energy: tickState.energy },
        currentTick,
        isResting: activeCode === 'REST',
        isEating: activeCode === 'EAT',
      });

      tickStateStore.set(agent.id, { ...decayResult.updatedNeeds });

      // 4. SYMBOLIC → NEURO Bridge: If interrupt fires, cancel current task and queue LLM prompt
      if (decayResult.interrupt && decayResult.interrupt.severity === 'critical') {
        tickStateStore.set(agent.id, {
          activeTask: null,         // Cancel whatever they were doing
          pendingInterrupt: decayResult.interrupt,
        });
        promptQueue.set(agent.id, 'needs-interrupt');
      }
    }

    // 5. SYMBOLIC: Advance active task timers; complete if ticks elapsed
    for (const agent of aliveAgents) {
      const tickState = tickStateStore.get(agent.id)!;
      const task = tickState.activeTask;
      if (!task) continue;

      const elapsed = currentTick - task.startTick;
      if (elapsed >= task.durationTicks) {
        // Task complete — resolve outcomes (physics), then queue LLM for next decision
        const outcome = resolveCompletedTask(agent, task, agentEconomyMap, tickState);
        applyOutcomeToAgent(agent, outcome); // update in-memory stats
        tickStateStore.set(agent.id, { activeTask: null });
        promptQueue.set(agent.id, 'task-complete');

        emit({ type: 'task-complete', agentId: agent.id, task, outcome, tick: currentTick });
      }
    }

    // 6. NEURO: Prompt agents in queue (async — does NOT block tick)
    if (promptQueue.size > 0) {
      const agentsToPrompt = [...promptQueue.entries()];
      promptQueue.clear();

      // Fire-and-forget async prompting (non-blocking)
      promptAgentsBatch(agentsToPrompt, agents, session, currentTick, agentEconomyMap)
        .then(newTasks => {
          for (const { agentId, task } of newTasks) {
            tickStateStore.set(agentId, { activeTask: task, lastPromptedTick: currentTick });
          }
        })
        .catch(err => {
          // Log but don't crash the tick loop
          console.error('[TickLoop] Async prompt batch failed:', err);
        });
    }

    // 7. Emit tick SSE with all agent states (for frontend live feed)
    const agentSnapshots = aliveAgents.map(a => ({
      id: a.id,
      name: a.name,
      stats: a.currentStats,
      needs: tickStateStore.get(a.id),
    }));
    emit({ type: 'tick-complete', tick: currentTick, agents: agentSnapshots });

    // 8. Flush needs to DB every 10 ticks (non-blocking)
    if (currentTick % 10 === 0) {
      flushNeedsToDB(sessionId, tickStateStore.snapshot());
    }

    // 9. Tick pacing (prevents CPU spinlock; adjust based on LLM latency)
    await sleep(100); // 100ms = ~10 ticks/second real-time
  }
}
```

**Critical Design Decision — Async Prompting:** The `promptAgentsBatch()` call is fire-and-forget (`.then()` not `await`). This means the tick loop NEVER waits for LLMs. Agents without an active task simply do nothing until their LLM call resolves. This is the key architectural difference from the current turn-based model.

---

### 1.5 Task Duration Table (`server/src/mechanics/actionCodes.ts`)

Add a lookup table mapping action codes to tick durations:

```typescript
/** Duration in ticks (1 tick = 1 in-game hour) for long-running tasks */
export const ACTION_TICK_DURATIONS: Partial<Record<ActionCode, number>> = {
  'PRODUCE_AND_SELL': 8,        // 8 hours of production + market listing
  'WORK_AT_ENTERPRISE': 8,      // 8-hour work shift
  'REST': 6,                    // 6 hours sleep
  'FOUND_ENTERPRISE': 24,       // 1 day to set up enterprise
  'POST_JOB_OFFER': 1,          // Instant admin action
  'APPLY_FOR_JOB': 1,           // Instant application
  'HIRE_EMPLOYEE': 1,           // Instant HR decision
  'FIRE_EMPLOYEE': 1,           // Instant HR decision
  'POST_BUY_ORDER': 1,          // Instant market order
  'POST_SELL_ORDER': 1,         // Instant market order
  'STEAL': 2,                   // 2-hour heist
  'HELP': 3,                    // 3-hour assistance
  'INVEST': 1,                  // Instant financial action
  'SABOTAGE': 4,                // 4-hour covert operation
  'EMBEZZLE': 2,
  'ADJUST_TAX': 1,
  'SUPPRESS': 3,
  'NONE': 1,
};

/** Get duration for an action, defaulting to 1 tick for instant actions */
export function getActionDuration(code: ActionCode): number {
  return ACTION_TICK_DURATIONS[code] ?? 1;
}
```

---

## Phase 2: Commodities & Hard Utility

### 2.1 Item Category & Utility Registry (`server/src/mechanics/physicsEngine.ts`)

Add a typed commodity system. The utility effects must be deterministic and hardcoded — LLMs must NEVER compute these:

```typescript
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
  stats: AgentStats,
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
```

**Why Luxury_Services is -30 cortisol:** The `MENTAL_BREAK` interrupt fires at cortisol ≥ 85. A single REST tick only removes ~3–5 cortisol. Without Luxury_Services, agents in mental-break territory would need 15+ REST ticks to recover — making them economically unproductive for hours. This creates a genuine market demand: agents *must* buy services or they become useless. That's the economic forcing function.

---

### 2.2 Update Order Book Resolution (`server/src/mechanics/orderBook.ts`)

When a buy order is matched, the order book should call `applyCommodityEffect()` and inject the result into the agent's tick state. This is Symbolic-layer work:

```typescript
// In orderBook.ts, after a buy order matches:
import { applyCommodityEffect } from './physicsEngine.js';

function onOrderMatched(buyerId: string, category: CommodityCategory, quantity: number) {
  const tickState = tickStateStore.get(buyerId);
  if (!tickState) return;

  for (let i = 0; i < quantity; i++) {
    const { updatedNeeds, statDelta } = applyCommodityEffect(
      { satiety: tickState.satiety, cortisol: tickState.cortisol, energy: tickState.energy },
      getBuyerStats(buyerId),
      category,
    );
    tickStateStore.set(buyerId, updatedNeeds);
    // Queue stat delta for async DB flush
    asyncLogFlusher.enqueue('agent_stat_deltas', [...], [...]);
  }

  // If Food was bought and agent had STARVATION interrupt — clear it
  if (category === 'Food' && tickState.pendingInterrupt?.type === 'STARVATION') {
    tickStateStore.set(buyerId, { pendingInterrupt: null });
  }

  // If Luxury_Services bought and agent had MENTAL_BREAK interrupt — clear it
  if (category === 'Luxury_Services' && tickState.pendingInterrupt?.type === 'MENTAL_BREAK') {
    tickStateStore.set(buyerId, { pendingInterrupt: null });
  }

  // Trigger LLM reprompt if interrupt was cleared (agent can now decide rationally)
  if (tickState.pendingInterrupt) {
    promptQueue.set(buyerId, 'economic-trigger');
  }
}
```

---

## Phase 3: Enterprise & HR Recruitment System

### 3.1 New Action Codes (`server/src/mechanics/actionCodes.ts`)

Add the Enterprise/HR action set:

```typescript
export type ActionCode =
  // ... existing codes ...
  // Enterprise founding
  | 'FOUND_ENTERPRISE'
  // HR actions
  | 'POST_JOB_OFFER'
  | 'APPLY_FOR_JOB'
  | 'HIRE_EMPLOYEE'
  | 'FIRE_EMPLOYEE'
  // Employment actions
  | 'WORK_AT_ENTERPRISE'
  // New production action (replaces bare PRODUCE for tick system)
  | 'PRODUCE_AND_SELL';

// Update VALID_ACTIONS Set, BASE_ACTIONS, SPECIALIST_ACTIONS, ELITE_ACTIONS accordingly.
// FOUND_ENTERPRISE → specialist+ (requires capital)
// POST_JOB_OFFER, HIRE_EMPLOYEE, FIRE_EMPLOYEE → specialist+ (requires enterprise ownership)
// APPLY_FOR_JOB, WORK_AT_ENTERPRISE → BASE (any citizen can apply)
// PRODUCE_AND_SELL → BASE (replaces PRODUCE)
```

**Fuzzy matching additions for `normalizeActionCode()`:**
```typescript
if (upper.includes('FOUND') || upper.includes('START') || upper.includes('ESTABLISH') || upper.includes('CREATE_ENTERPRISE')) return 'FOUND_ENTERPRISE';
if (upper.includes('POST_JOB') || upper.includes('RECRUIT') || upper.includes('HIRING')) return 'POST_JOB_OFFER';
if (upper.includes('APPLY') || upper.includes('JOB_APP')) return 'APPLY_FOR_JOB';
if (upper.includes('HIRE') && !upper.includes('FIRE')) return 'HIRE_EMPLOYEE';
if (upper.includes('FIRE') || upper.includes('DISMISS') || upper.includes('LAYOFF')) return 'FIRE_EMPLOYEE';
if (upper.includes('WORK_AT') || upper.includes('SHIFT') || upper.includes('CLOCKING_IN')) return 'WORK_AT_ENTERPRISE';
if (upper.includes('PRODUCE_AND_SELL') || upper.includes('CRAFT_SELL')) return 'PRODUCE_AND_SELL';
```

---

### 3.2 Enterprise Data Model (`server/src/db/schema.ts`)

Add two new SQLite tables:

```typescript
export const enterprises = sqliteTable('enterprises', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  industry: text('industry').notNull(), // 'Agriculture' | 'Extraction' | 'Manufacturing' | 'Services'
  outputCommodity: text('output_commodity').notNull(), // CommodityCategory
  efficiencyMultiplier: real('efficiency_multiplier').notNull().default(2.5),
  employeeIds: text('employee_ids').notNull().default('[]'), // JSON array
  wagePer8Ticks: real('wage_per_8_ticks').notNull().default(0),
  stockpile: real('stockpile').notNull().default(0),
  foundedAt: integer('founded_at').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const jobOffers = sqliteTable('job_offers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  enterpriseId: text('enterprise_id').notNull(),
  ownerId: text('owner_id').notNull(),
  industry: text('industry').notNull(),
  wage: real('wage').notNull(),
  minSkillReq: real('min_skill_req').notNull().default(0),
  isOpen: integer('is_open', { mode: 'boolean' }).notNull().default(true),
  postedAt: integer('posted_at').notNull(),
  applicantIds: text('applicant_ids').notNull().default('[]'), // JSON array
});
```

---

### 3.3 Enterprise Physics (`server/src/mechanics/physicsEngine.ts`)

Add enterprise production resolution — purely Symbolic:

```typescript
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
  const ownerProfit = Math.max(0, (unitsProduced * 8) - wagesPaid); // Assuming 8w/unit sale price

  return {
    unitsProduced,
    wagesPaid,
    perEmployeeWage: enterprise.wagePer8Ticks,
    ownerProfit,
  };
}
```

**Why 2.5x efficiency:** Solo `PRODUCE_AND_SELL` takes 8 ticks to produce ~10 units. At market price of ~8w/unit = 80w/shift, minus agent's own food cost (~40w/day). Net: ~40w/day profit solo. Enterprise at 2.5x: 25 units × 8w = 200w revenue. With 3 employees paid 25w each (75w wages), owner nets 125w. Both owner and employees earn more than solo — this creates a rational incentive to participate in enterprise labor markets.

---

### 3.4 HR Event Triggers (`server/src/orchestration/simulationRunner.ts`)

Add an "economic trigger" system for HR events. When specific HR events occur, they must prompt the relevant agents immediately (not wait for task completion):

```typescript
/** Economic/social events that require immediate LLM re-prompt */
type EconomicTriggerType =
  | 'FIRED'           // Employee was fired — must decide next action
  | 'JOB_APPLICATION' // Owner received application — must decide HIRE/REJECT
  | 'HIRED'           // Citizen was hired — must decide to ACCEPT/start WORK_AT_ENTERPRISE
  | 'WAGE_UPDATED'    // Owner changed wage mid-employment
  | 'ENTERPRISE_BANKRUPT'; // Owner's enterprise collapsed

interface EconomicTrigger {
  targetAgentId: string;
  type: EconomicTriggerType;
  contextData: Record<string, unknown>;
  sourceTick: number;
}

// In the tick loop, after resolving enterprise production:
function emitEconomicTrigger(trigger: EconomicTrigger) {
  promptQueue.set(trigger.targetAgentId, 'economic-trigger');
  tickStateStore.set(trigger.targetAgentId, {
    activeTask: null, // Cancel current task — HR events take priority
    pendingInterrupt: null,
  });
  // Store trigger context so it can be injected into the next prompt
  economicTriggerCache.set(trigger.targetAgentId, trigger);
}
```

---

## Phase 4: Asynchronous Prompting & Context Injection

### 4.1 Async Prompt Batch Function (`server/src/orchestration/simulationRunner.ts`)

The new `promptAgentsBatch()` replaces the old synchronous intent collection loop:

```typescript
/**
 * Asynchronously prompt a batch of agents who need LLM decisions.
 * Called fire-and-forget from the tick loop.
 * Returns assigned tasks for each agent.
 */
async function promptAgentsBatch(
  agentsToPrompt: Array<[string, 'needs-interrupt' | 'task-complete' | 'economic-trigger']>,
  allAgents: Agent[],
  session: Session,
  currentTick: number,
  agentEconomyMap: Map<string, AgentEconomyState>,
  prevMarketPrices: PriceIndex[],
  employmentBoard: JobOffer[],
): Promise<Array<{ agentId: string; task: ActiveTask }>> {

  const promptTasks = agentsToPrompt.map(([agentId, reason]) => async () => {
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent || !agent.isAlive) return null;

    const tickState = tickStateStore.get(agentId)!;
    const econState = agentEconomyMap.get(agentId);
    const economicTrigger = economicTriggerCache.get(agentId);
    economicTriggerCache.delete(agentId);

    // Build the context-rich prompt (see Phase 4.2)
    const messages = buildTickIntentPrompt(
      agent,
      session,
      tickState,
      econState,
      prevMarketPrices,
      employmentBoard,
      currentTick,
      reason,
      economicTrigger ?? null,
    );

    // Use existing retryWithHealing infrastructure
    const raw = await retryWithHealing({ provider: citizenProv, messages, maxRetries: 2 });
    const intent = parseAgentIntentStrict(raw);
    if (!intent) return null;

    const actionCode = normalizeActionCode(intent.actionCode);
    const duration = getActionDuration(actionCode);

    // Emit SSE for the frontend live feed
    emit({
      type: 'agent-intent',
      agentId,
      agentName: agent.name,
      actionCode,
      intent: intent.internal_monologue,
      publicAction: intent.public_action_narrative,
      tick: currentTick,
    });

    return {
      agentId,
      task: {
        taskId: uuidv4(),
        actionCode,
        startTick: currentTick,
        durationTicks: duration,
        targetId: intent.actionTarget ?? undefined,
        metadata: { enterpriseId: intent.enterpriseId, commodity: intent.commodity },
      },
    };
  });

  // Respect existing concurrency limits
  const results = await runWithConcurrency(promptTasks, settings.maxConcurrency);
  return results.filter(Boolean) as Array<{ agentId: string; task: ActiveTask }>;
}
```

---

### 4.2 Enhanced Prompt Builder (`server/src/llm/prompts.ts`)

Add `buildTickIntentPrompt()` — a new prompt builder specifically for the tick-based context. It replaces `buildIntentPrompt()` for the new system:

```typescript
export function buildTickIntentPrompt(
  agent: Agent,
  session: Session,
  tickState: TickAgentState,
  econState: AgentEconomyState | undefined,
  prevMarketPrices: PriceIndex[],
  employmentBoard: JobOffer[],
  currentTick: number,
  promptReason: 'needs-interrupt' | 'task-complete' | 'economic-trigger',
  economicTrigger: EconomicTrigger | null,
): LLMMessage[] {

  // ── Market Board ─────────────────────────────────────────────────────────
  const marketBoard = buildEnhancedMarketBoard(prevMarketPrices);

  // ── Employment Board ─────────────────────────────────────────────────────
  const employmentSection = buildEmploymentBoard(employmentBoard);

  // ── Needs Status ─────────────────────────────────────────────────────────
  const needsSection = `[YOUR BIOLOGICAL NEEDS]
Satiety: ${tickState.satiety.toFixed(0)}/100 ${tickState.satiety < 30 ? '⚠ DANGEROUSLY LOW' : tickState.satiety < 50 ? '(hungry)' : '(ok)'}
Cortisol: ${tickState.cortisol.toFixed(0)}/100 ${tickState.cortisol > 80 ? '⚠ CRITICAL STRESS — 50% PRODUCTIVITY PENALTY ACTIVE' : tickState.cortisol > 60 ? '(high stress)' : '(ok)'}
Energy: ${tickState.energy.toFixed(0)}/100 ${tickState.energy < 20 ? '⚠ EXHAUSTED' : '(ok)'}`;

  // ── Needs Interrupt Override ─────────────────────────────────────────────
  const interruptSection = tickState.pendingInterrupt
    ? `\n\n${tickState.pendingInterrupt.injectedDirective}\n`
    : '';

  // ── Economic Trigger Context ─────────────────────────────────────────────
  const triggerSection = economicTrigger
    ? buildEconomicTriggerSection(economicTrigger)
    : '';

  // ── Prompt Reason ────────────────────────────────────────────────────────
  const reasonContext = {
    'needs-interrupt': 'A critical biological need has interrupted your current task.',
    'task-complete': 'You have just finished your previous task. Decide what to do next.',
    'economic-trigger': 'An economic or social event requires your immediate attention.',
  }[promptReason];

  const systemPrompt = `You are ${agent.name}, a ${agent.role} in a real-time tick simulation of: "${session.idea}"

${interruptSection}
SITUATION: ${reasonContext}

[YOUR STATS]
Wealth: ${agent.currentStats.wealth} | Health: ${agent.currentStats.health} | Happiness: ${agent.currentStats.happiness} | Cortisol: ${agent.currentStats.cortisol ?? 0}

${needsSection}

[YOUR INVENTORY]
Food: ${econState?.inventory?.food?.quantity ?? 0} units | Tools: ${econState?.inventory?.tools?.quantity ?? 0} | Raw Materials: ${econState?.inventory?.raw_materials?.quantity ?? 0}

${marketBoard}

${employmentSection}

${triggerSection}

[RATIONAL ACTOR DIRECTIVE]
You are a rational economic actor in a real-time tick simulation (1 tick = 1 in-game hour). You MUST:
1. Review the [MARKET BOARD] and [EMPLOYMENT BOARD] before acting.
2. If your Satiety < 40, your FIRST action MUST be POST_BUY_ORDER for Food.
3. If your Cortisol > 80, you MUST purchase Luxury_Services or REST before anything else.
4. If solo PRODUCE_AND_SELL is yielding worthless items (check market surplus), APPLY_FOR_JOB at a high-wage enterprise or switch commodity.
5. If founding an enterprise, choose the industry with HIGHEST market demand and LOWEST supply.
6. Tools (Tech_Parts) double your production output — they are worth buying if you plan to produce.
7. Raw_Materials are REQUIRED inputs for Manufacturing enterprises. Without them, output drops 70%.

[YOUR ALLOWED ACTIONS]
${getAllowedActions(agent.role).join(', ')}

Society overview: ${session.societyOverview?.slice(0, 300) ?? ''}
Laws: ${session.law?.slice(0, 200) ?? ''}
Current tick: ${currentTick} (1 tick = 1 in-game hour)

You MUST respond with ONLY valid JSON:
{
  "internal_monologue": "Your private thoughts — 2-3 sentences, reference specific market prices or needs",
  "public_action_narrative": "What you are visibly doing — 1 sentence",
  "actionCode": "EXACTLY_ONE_ALLOWED_ACTION",
  "actionTarget": "AgentName or EnterpriseID or null",
  "commodity": "Food|Raw_Materials|Tech_Parts|Luxury_Services or null (for BUY/SELL orders)",
  "priceOffer": null or number (wealth units; for BUY/SELL orders),
  "quantity": null or number,
  "enterpriseIndustry": "Agriculture|Extraction|Manufacturing|Services or null (for FOUND_ENTERPRISE)",
  "enterpriseId": "enterprise UUID or null (for WORK_AT_ENTERPRISE, APPLY_FOR_JOB)"
}`;

  return [{ role: 'system', content: systemPrompt }];
}
```

---

### 4.3 Market Board Enhancement (`server/src/llm/prompts.ts`)

Replace the existing `buildMarketBoardText()` with a richer version that includes demand trends and supply pressure:

```typescript
export function buildEnhancedMarketBoard(prices: PriceIndex[]): string {
  if (prices.length === 0) {
    return `[MARKET BOARD — no prior trades]
  Food: no data (baseline 8–12w/unit) | UNKNOWN demand
  Raw_Materials: no data (baseline 3–6w/unit) | UNKNOWN demand
  Tech_Parts: no data (baseline 15–25w/unit) | UNKNOWN demand
  Luxury_Services: no data (baseline 20–35w/unit) | UNKNOWN demand
Note: High demand = price up opportunity. Surplus = price must drop to sell.`;
  }

  const rows = prices.map(p => {
    const demandPressure = p.totalDemand > p.totalSupply * 1.5
      ? '🔴 HIGH DEMAND — sellers earn premium'
      : p.totalSupply > p.totalDemand * 1.5
      ? '🟢 SURPLUS — must price low to sell, avoid producing this'
      : '🟡 BALANCED';

    const trend = p.priceChange > 0 ? `↑+${p.priceChange.toFixed(1)}w`
                : p.priceChange < 0 ? `↓${p.priceChange.toFixed(1)}w`
                : '→ stable';

    return `  ${p.itemType}: avg ${p.vwap.toFixed(1)}w/unit ${trend} | Vol: ${p.volume} units | ${demandPressure}`;
  });

  return [
    '[MARKET BOARD — last 24 ticks]',
    ...rows,
    'System emergency: Food ceiling 15w, Raw_Materials floor 2w (system always buys/sells at these limits).',
  ].join('\n');
}
```

---

### 4.4 Employment Board Builder (`server/src/llm/prompts.ts`)

```typescript
export function buildEmploymentBoard(offers: JobOffer[]): string {
  if (offers.length === 0) {
    return '[EMPLOYMENT BOARD — no open positions]\nConsider founding an enterprise to create jobs.';
  }

  const rows = offers
    .filter(o => o.isOpen)
    .slice(0, 10) // Cap at 10 to avoid context bloat
    .map(o => `  Enterprise ${o.enterpriseId.slice(0, 8)}... | ${o.industry} | Wage: ${o.wage}w/shift | Skill req: ${o.minSkillReq}`);

  return [
    '[EMPLOYMENT BOARD — open positions]',
    ...rows,
    'Use APPLY_FOR_JOB with enterpriseId to apply. WORK_AT_ENTERPRISE once hired pays wage every 8 ticks.',
  ].join('\n');
}
```

---

## Phase 5: Database Migrations & Repository Updates

### 5.1 New Migrations (`server/src/db/migrate.ts`)

Add migration for new tables (run once on server start if tables don't exist):

```sql
-- enterprises table
CREATE TABLE IF NOT EXISTS enterprises (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  output_commodity TEXT NOT NULL,
  efficiency_multiplier REAL NOT NULL DEFAULT 2.5,
  employee_ids TEXT NOT NULL DEFAULT '[]',
  wage_per_8_ticks REAL NOT NULL DEFAULT 0,
  stockpile REAL NOT NULL DEFAULT 0,
  founded_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- job_offers table
CREATE TABLE IF NOT EXISTS job_offers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  enterprise_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  industry TEXT NOT NULL,
  wage REAL NOT NULL,
  min_skill_req REAL NOT NULL DEFAULT 0,
  is_open INTEGER NOT NULL DEFAULT 1,
  posted_at INTEGER NOT NULL,
  applicant_ids TEXT NOT NULL DEFAULT '[]'
);

-- agent_tick_state table (for periodic flush of in-memory state)
CREATE TABLE IF NOT EXISTS agent_tick_state (
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  satiety REAL NOT NULL DEFAULT 70,
  cortisol REAL NOT NULL DEFAULT 20,
  energy REAL NOT NULL DEFAULT 80,
  active_task TEXT,  -- JSON blob of ActiveTask | null
  last_prompted_tick INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, session_id)
);
```

### 5.2 Enterprise Repository (`server/src/db/repos/enterpriseRepo.ts`)

Create a new repo following the existing pattern (see `economyRepo.ts` for structure):

Key methods needed:
- `create(enterprise: Enterprise): Promise<void>`
- `getById(id: string): Promise<Enterprise | null>`
- `listBySession(sessionId: string): Promise<Enterprise[]>`
- `addEmployee(enterpriseId: string, agentId: string): Promise<void>`
- `removeEmployee(enterpriseId: string, agentId: string): Promise<void>`
- `updateStockpile(enterpriseId: string, delta: number): Promise<void>`
- `listOpenJobOffers(sessionId: string): Promise<JobOffer[]>`
- `postJobOffer(offer: JobOffer): Promise<void>`
- `closeJobOffer(offerId: string): Promise<void>`

---

## Phase 6: SSE Event Schema Updates

The frontend receives SSE events. New tick-based events to add (no frontend store changes needed — the existing `requestAnimationFrame` buffer handles new event types transparently):

```typescript
// New event types (extend existing SSEEvent union in shared/src/types.ts)
type TickStartEvent = { type: 'tick-start'; tick: number; sessionId: string };
type TickCompleteEvent = { type: 'tick-complete'; tick: number; agents: AgentTickSnapshot[]; sessionId: string };
type TaskCompleteEvent = { type: 'task-complete'; agentId: string; agentName: string; task: ActiveTask; outcome: PhysicsOutput; tick: number; sessionId: string };
type AgentInterruptEvent = { type: 'agent-interrupt'; agentId: string; agentName: string; interrupt: NeedsInterrupt; tick: number; sessionId: string };
type EnterpriseCreatedEvent = { type: 'enterprise-created'; enterprise: Enterprise; tick: number; sessionId: string };
type HireFiredEvent = { type: 'hr-event'; enterpriseId: string; employeeId: string; action: 'hired' | 'fired'; tick: number; sessionId: string };
```

---

## Implementation Order & Risk Notes

### Recommended Implementation Sequence

1. **[x] Types first** — Add `ActiveTask`, `AgentNeeds`, `TickAgentState`, `NeedsInterrupt` to `shared/src/types.ts`. Compile to catch cascading type errors immediately.

2. **[x] `tickStateStore.ts`** — Create the in-memory store. No DB dependencies; easy to test in isolation.

3. **[x] `applyNeedsDecay()`** — Add to `physicsEngine.ts`. Pure function; write unit tests before integrating.

4. **[x] `COMMODITY_REGISTRY` + `applyCommodityEffect()`** — Add to `physicsEngine.ts`. Pure function; unit-test all 4 commodity types.

5. **[x] New action codes** — Add to `actionCodes.ts`. Update `VALID_ACTIONS`, `BASE_ACTIONS`, fuzzy matching, `ACTION_TICK_DURATIONS`.

6. **[x] DB migration** — Add 3 new tables. Test with `npm run migrate`.

7. **[x] Enterprise repo** — Create `enterpriseRepo.ts` following `economyRepo.ts` pattern.

8. **[x] `buildTickIntentPrompt()`** — Add to `prompts.ts`. Manually inspect generated prompt text for token count.

9. **[x] `promptAgentsBatch()`** — Add to `simulationRunner.ts`. Wire to a test harness before integrating with tick loop.

10. **[x] Tick loop** — Replace the main `for (let iterNum...)` loop in `runSimulation()`. This is the highest-risk change; keep the old loop commented out until tick loop passes integration tests.

11. **[x] Enterprise physics** — Add `resolveEnterpriseProduction()` to `physicsEngine.ts`. Wire into tick loop's task-complete handler.

12. **[x] HR event triggers** — Add `emitEconomicTrigger()` and `economicTriggerCache` to `simulationRunner.ts`.

### Risk Areas

| Risk | Mitigation |
|------|-----------|
| Tick loop CPU spinlock (100ms sleep might be too short on slow LLM provider) | Make sleep duration configurable via `settings.ts` (`tickIntervalMs`). Default 200ms. |
| `promptQueue` growing unbounded if LLM calls are slower than ticks | Add max queue depth; if agent is already in queue, skip re-adding. |
| `tickStateStore` out-of-sync with DB on crash | Flush every 10 ticks; on restart, reload from `agent_tick_state` table. |
| Agent with `FOUND_ENTERPRISE` (24-tick task) holding up their agent thread | All tasks are non-blocking by design — agent is simply "inactive" for 24 ticks. No thread held. |
| Context window overflow with new Market Board + Employment Board injection | Cap `marketBoard` to 500 chars and `employmentBoard` to 10 rows. Monitor token counts. |
| Frontend breaking on new SSE event types | `simulationStore.ts` uses `switch` on event type; unknown types fall through silently. No risk. |

### Neuro-Symbolic Boundary Checklist

Before considering any phase complete, verify:
- [x] No numeric calculations inside `prompts.ts` or `buildTickIntentPrompt()` — all numbers come from pre-computed Symbolic layer data injected as strings.
- [x] No LLM output directly modifies stats — all LLM outputs go through `normalizeActionCode()` → `resolveAction()` / `resolveEnterpriseProduction()` → stat delta application.
- [x] `applyNeedsDecay()` is a pure function with no LLM calls.
- [x] `applyCommodityEffect()` is a pure function with no LLM calls.
- [x] `resolveEnterpriseProduction()` is a pure function with no LLM calls.
- [x] Interrupt directives (`injectedDirective`) are hardcoded strings from the Symbolic layer — the LLM reads them but does not generate them.

---

## Appendix: Key File Change Summary

| File | Change Type | Summary |
|------|------------|---------|
| `shared/src/types.ts` | Add | `ActiveTask`, `AgentNeeds`, `TickAgentState`, `NeedsInterrupt`, new SSE event types |
| `server/src/orchestration/tickStateStore.ts` | **Create** | In-memory hot store for per-tick agent needs + task state |
| `server/src/mechanics/physicsEngine.ts` | Add | `applyNeedsDecay()`, `COMMODITY_REGISTRY`, `applyCommodityEffect()`, `resolveEnterpriseProduction()`, cortisol production penalty |
| `server/src/mechanics/actionCodes.ts` | Add | 6 new action codes, `ACTION_TICK_DURATIONS`, `getActionDuration()`, fuzzy matchers |
| `server/src/db/schema.ts` | Add | `enterprises`, `jobOffers`, `agentTickState` tables |
| `server/src/db/repos/enterpriseRepo.ts` | **Create** | CRUD for enterprises and job offers |
| `server/src/llm/prompts.ts` | Add | `buildTickIntentPrompt()`, `buildEnhancedMarketBoard()`, `buildEmploymentBoard()` |
| `server/src/orchestration/simulationRunner.ts` | **Refactor** | Replace iteration loop with tick loop; add `promptAgentsBatch()`, `emitEconomicTrigger()`, `resolveCompletedTask()` |
| `server/src/mechanics/orderBook.ts` | Modify | Call `applyCommodityEffect()` on matched buy orders |
| `server/src/db/migrate.ts` | Add | 3 new table migrations |
| `web/src/stores/simulationStore.ts` | **No change** | RAF double-buffer already handles new event types |
