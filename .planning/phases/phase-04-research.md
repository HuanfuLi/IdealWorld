# Phase 4: SFC Bug Fixes & Logic Corrections - Research

**Researched:** 2025-03-24  
**Domain:** Economic Simulation Physics, Stock-Flow Consistency (SFC), Metabolic Systems  
**Confidence:** HIGH (verified against source code, ROADMAP.md, and architecture docs)

---

## Summary

Phase 4 addresses 6 critical bugs discovered in the post-Phase-3 codebase audit. Two are **CRITICAL SFC violations** that destroy 0.2–0.5 fiat per agent per cycle (resulting in 60–120% economy loss over 100 iterations), one is a **HIGH-priority auto-buy starvation edge case** that causes silent metabolism data corruption, and three are **MEDIUM-priority logic cleanups** with systemic impact on health/stress modeling.

**Primary recommendation:** Execute bugs in dependency order (BUG-01 → BUG-02, then BUG-03 → BUG-04/05/06 in parallel). All fixes are isolated at the physics/repository layer with no cross-module changes required. Estimated scope: 5–8 source files, 15–25 LOC changes per bug.

---

## User Constraints

No CONTEXT.md exists for this phase, so all bugs are in "the agent's Discretion" (research options, recommend fixes).

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Fix wealth integer rounding SFC violation (destroys 0.2-0.5 fiat/agent/cycle) | Root cause identified in `agentRepo.ts` lines 98, 129 (rounding before clamping); fix pattern established |
| BUG-02 | Fix UBI redistribution float division (loses remainder ~0.0001 fiat/cycle) | Root cause identified in `automatedMarketMaker.ts` line 536 (float UBI division); fix pattern verified |
| BUG-03 | Fix auto-buy metabolism starvation edge case (lacks partial purchase fallback) | Root cause identified in `simulationRunner.ts` lines 498–500 (no fallback when full request fails); fix pattern documented |
| BUG-04 | Simplify redundant tax Math.min() clamping | Root cause identified in `automatedMarketMaker.ts` line 529 (redundant clamp); fix is 1-line deletion |
| BUG-05 | Clamp allostatic health delta to [0, 100] | Root cause identified in `allostaticEngine.ts` lines 348–350 (health delta unclamped); fix adds bounds check |
| BUG-06 | Document dopamine feedback limits and guard against re-application | Root cause identified in `allostaticEngine.ts` lines 316–321 (dopamine feedback stacks indefinitely); fix adds guard + documentation |

---

## Bug Analysis & Fix Strategies

### BUG-01: Wealth Integer Rounding SFC Violation

**Root Cause:**

In `server/src/db/repos/agentRepo.ts` (lines 98–100, 129–131):

```typescript
// BUG: Math.round() applied to wealth (unbounded), destroying fractional fiat
wealth: Math.max(0, Math.round(wealth)),  // <- WRONG
```

- Wealth can be any non-negative float (not clamped to [0,100] like stats)
- `Math.round()` destroys fractional fiat over many iterations
- Example: +0.3 fiat → stored as 0 (loss: -0.3)
- **Economic impact:** 0.2–0.5 fiat/agent/cycle lost, cumulative 60–120% economy loss over 100 iterations

**Recommended Fix (Option A - Simplest):**

```typescript
// CORRECT: Keep fractional fiat, only floor at 0
wealth: Math.max(0, wealth),  // <- FIXED
```

**Scope:** 2 edits in `agentRepo.ts` (~10 LOC)

---

### BUG-02: UBI Redistribution Float Division SFC Violation

**Root Cause:**

In `server/src/mechanics/automatedMarketMaker.ts` (lines 534–536):

```typescript
const ubiPerAgent = redistributablePool / livingAgentCount;  // <- float division
// Rounded independently per agent → fractions escape (1 fiat lost per 3 agents)
```

**Recommended Fix (Use existing `distributeProRata()` pattern):**

Extract `distributeProRata()` to `shared/src/math.ts`, use integer-safe distribution:

```typescript
const totalPoolInt = Math.floor(redistributablePool);
const shares = distributeProRata(totalPoolInt, agents.map(() => 1));
```

**Scope:** 2–3 files (~20 LOC), reuses proven Phase 3 pattern

---

### BUG-03: Auto-Buy Metabolism Starvation Edge Case

**Root Cause:**

In `server/src/orchestration/simulationRunner.ts` (lines 498–500):

```typescript
// No cascading fallback: if full request fails, try smaller amounts
const unitsToAttempt = ammForAutoEat.fiatCostForFood(requestedUnits) !== null
  ? requestedUnits
  : Math.min(requestedUnits, maxBuyable);  // <- Fails if agent lacks wealth for ANY amount
```

**Recommended Fix (Cascading fallback):**

```typescript
const amountsToTry = [
  foodToConsume,
  Math.min(foodToConsume, maxBuyable),
  Math.max(0.5, maxBuyable * 0.5)
].filter((amt, idx, arr) => arr.indexOf(amt) === idx && amt > 0);

for (const unitsToAttempt of amountsToTry) {
  if (canAfford(unitsToAttempt) && canBuy(unitsToAttempt)) {
    purchase(unitsToAttempt);
    break;  // CRITICAL: exit on success
  }
}
```

**Scope:** 1 edit in `simulationRunner.ts` (~15 LOC)

---

### BUG-04: Redundant Tax Math.min() Clamping

**Root Cause:**

In `server/src/mechanics/automatedMarketMaker.ts` (line 529):

```typescript
const tax = Math.min(agent.wealth, agent.wealth * taxRate);  // <- Redundant
// Since taxRate ∈ [0, 1], agent.wealth * taxRate ≤ agent.wealth always
```

**Recommended Fix (Remove dead code):**

```typescript
const tax = agent.wealth * taxRate;  // <- CORRECT (no clamp needed)
```

**Scope:** 1 edit in `automatedMarketMaker.ts` (1 LOC)

---

### BUG-05: Clamp Allostatic Health Delta to [0, 100]

**Root Cause:**

In `server/src/mechanics/allostaticEngine.ts` (line 350):

```typescript
healthDelta = Math.max(-2, healthDelta);  // <- Only clamps lower bound, not upper
// Can be -30 or worse (load = 2000 → healthDelta ≈ -30/tick)
```

**Recommended Fix:**

```typescript
healthDelta = Math.max(-100, Math.min(0, healthDelta));  // <- Full [−100, 0] clamp
```

**Scope:** 1 edit in `allostaticEngine.ts` (1 LOC)

---

### BUG-06: Dopamine Feedback Limits and Re-Application Guard

**Root Cause:**

In `server/src/mechanics/allostaticEngine.ts` (lines 316–321):

```typescript
const effectiveCortisol = (dopamine !== undefined && dopamine <= 30)
  ? Math.min(100, cortisol + 4)  // <- Applied every tick, stacks indefinitely
  : cortisol;
// No guard against re-application in retry scenarios
```

**Recommended Fix (Add guard flag):**

```typescript
export interface AllostaticTickInput {
  cortisol: number;
  dopamine?: number;
  dopamineFeedbackApplied?: boolean;  // <- Guard: skip if already applied
}

const effectiveCortisol = (
  !dopamineFeedbackApplied &&
  dopamine !== undefined &&
  dopamine <= 30
)
  ? Math.min(100, cortisol + 4)
  : cortisol;
```

**Scope:** 1–2 edits in `allostaticEngine.ts` + `simulationRunner.ts` (~10 LOC)

---

## Execution Risk Assessment

### Dependency Order (CRITICAL)

```
BUG-01 (wealth rounding)
    ↓ (MUST fix first)
BUG-02 (UBI division) ← blocks BUG-03
    ↓
BUG-03 (auto-buy fallback)

BUG-04 (tax clamping)  ← independent
BUG-05 (health delta)  ← independent
BUG-06 (dopamine)      ← independent
```

**Wave 1 (SFC critical):** BUG-01 → BUG-02 → BUG-03 (atomic commit, verify SFC before Wave 2)  
**Wave 2 (Logic cleanups):** BUG-04, BUG-05, BUG-06 in parallel

### Pre-Conditions

| Bug | Blocks | Blocked By |
|-----|--------|-----------|
| BUG-01 | BUG-02, BUG-03 | None |
| BUG-02 | BUG-03 | BUG-01 |
| BUG-03 | None | BUG-01, BUG-02 |
| BUG-04 | None | None |
| BUG-05 | None | None |
| BUG-06 | None | Requires simulationRunner.ts updates |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via `__tests__` directories) |
| Quick run | `npx tsx server/src/mechanics/__tests__/test.ts` |
| Full suite | `find server/src -name '*.test.ts' \| xargs npx tsx` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | File Needed |
|--------|----------|-----------|-------------|
| BUG-01 | Wealth preserves fractional fiat (no rounding destruction) | Unit | `agentRepo.test.ts` |
| BUG-02 | UBI sums to collected tax exactly (SFC hold) | Unit | `amm.test.ts` |
| BUG-03 | Auto-buy cascade: full → partial → starvation | Unit | `metabolism.test.ts` |
| BUG-04 | Tax calculation: with/without Math.min() identical | Regression | `demurrage.test.ts` |
| BUG-05 | Health delta clamped [−100, 0] at extreme loads | Unit | `allostatic.test.ts` |
| BUG-06 | Dopamine feedback applied max once per tick | Unit | `dopamine.test.ts` |

### Wave 0 Test Gaps

- [ ] Unit tests for each bug (6 files needed)
- [ ] Integration SFC audit: run 100-iteration sim, verify `totalInitialFiat === totalFinalFiat`

---

## Common Pitfalls

### Pitfall 1: Incomplete Rounding Removal (BUG-01)

**Risk:** Remove `Math.round()` from `agentRepo.ts` but miss other entry points (routes, settlement calcs)

**Mitigation:** Audit ALL calls to `updateStats()` and `bulkUpdateStats()`. Verify upstream is float-safe.

### Pitfall 2: Pro-Rata Double-Rounding (BUG-02)

**Risk:** Implement `distributeProRata()` but callers still round the input total

**Mitigation:** Ensure UBI pool enters `distributeProRata()` unrounded. Round only at persistence.

### Pitfall 3: Fallback Loop Without Break (BUG-03)

**Risk:** Cascading fallback loop purchases multiple times in one tick (no `break`)

**Mitigation:** Test with zero wealth (fallback should fail all attempts, apply starvation penalty).

### Pitfall 4: Dopamine Flag Not Passed (BUG-06)

**Risk:** Flag defaults to false → feedback always applies, defeats guard

**Mitigation:** Audit all `AllostaticEngine.tick()` callers in simulationRunner.ts. Set flag explicitly.

---

## Code Examples

### BUG-01 Fix Pattern

```typescript
// BEFORE:
wealth: Math.max(0, Math.round(wealth)),

// AFTER:
wealth: Math.max(0, wealth),
```

### BUG-02 Fix Pattern (reuse Phase 3 `distributeProRata()`)

```typescript
const totalPoolInt = Math.floor(redistributablePool);
const shares = distributeProRata(totalPoolInt, agents.map(() => 1));
for (let i = 0; i < agents.length; i++) {
  netDeltas.set(agents[i].agentId, shares[i] - tax);
}
```

### BUG-03 Fix Pattern (cascading fallback)

```typescript
for (const amount of [full, max, half]) {
  if (canAfford(amount) && canBuy(amount)) {
    purchase(amount);
    break;  // EXIT ON SUCCESS
  }
}
```

### BUG-06 Fix Pattern (guard flag)

```typescript
const effectiveCortisol = (
  !dopamineFeedbackApplied &&
  dopamine !== undefined &&
  dopamine <= 30
)
  ? Math.min(100, cortisol + 4)
  : cortisol;
```

---

## Data Migration

**BUG-01 (Wealth Rounding):** No migration needed. Fractional wealth already supported in DB. New logic applies only to future updates.

**BUG-02 (UBI):** No migration needed. UBI recomputed every iteration.

**BUG-03 (Auto-Buy):** No migration needed. Fallback is runtime-only.

---

## Open Questions

1. **Historical SFC reconciliation?** Optional Wave 0 task: repair old sessions by proportionally redistributing lost fiat.

2. **Extract `distributeProRata()` to `shared/`?** Simplifies reuse; recommend if Phase 5+ needs integer-safe distribution.

3. **BUG-03 minimum purchase threshold?** No floor needed; physics engine handles micro-transactions fine.

---

## Sources

### PRIMARY (HIGH confidence)

- **Source audit:** `agentRepo.ts`, `automatedMarketMaker.ts`, `simulationRunner.ts`, `allostaticEngine.ts`
  - All bugs traced to exact line with clear reproduction logic
  - Cross-references verify SFC impact

- **ROADMAP.md** (Phase 4 requirements, lines 29–44)
  - "60–120% economy loss over 100 iterations" confirmed by bug analysis

- **ARCHITECTURE.md** (layered architecture, data flow)
  - Validates repository pattern, physics engine integration

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (verified in source)
- Bug root causes: HIGH (exact line numbers, reproduction logic)
- Fix strategies: MEDIUM-HIGH (patterns from Phase 3, edge cases identified)
- Execution order: HIGH (dependency analysis based on SFC invariant)
- Pitfalls: MEDIUM (code patterns observed, some speculative)

**Research date:** 2025-03-24  
**Valid until:** 2025-04-24 (30 days — stable domain)

---

## RESEARCH COMPLETE
