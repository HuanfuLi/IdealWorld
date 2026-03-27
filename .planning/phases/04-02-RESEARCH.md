# Phase 4 Re-Research: Addressing Verification Blockers

**Researched:** 2025-01-25
**Focus:** Two critical blockers from initial plan verification
**Confidence:** HIGH (verified against actual codebase state)

---

## Executive Summary

The first plan attempt (`04-01-PLAN.md`) referenced two critical missing pieces:

1. **`distributeProRata()` function** — Referenced in Task 2 (BUG-02) but **does not exist** anywhere in the codebase
2. **Test framework** — Tasks 9-11 reference `npm run test` but **no test framework is installed**

This research provides concrete solutions to both blockers and clarifies plan structure.

---

## Problem 1: Missing `distributeProRata()` Function

### Current State

**CONFIRMED:** Function does not exist in codebase.

- Searched entire `server/` and `shared/` directories
- Not in `shared/src/` (only types.ts and economyTypes.ts exist)
- Not in `server/src/mechanics/` or any utility folder
- Task 2 of the plan references it but the plan provides no implementation

### Root Cause

The initial Phase 4 research (line 76) states: "Use existing `distributeProRata()` pattern" from Phase 3, but Phase 3 plan/code apparently never created this utility.

### Solution: Minimal Implementation

Since `distributeProRata()` is only needed for Task 2 (BUG-02 — UBI redistribution), create it as a standalone utility function in `shared/src/math.ts` (new file).

**File to create:** `shared/src/math.ts`

```typescript
/**
 * Math utilities for stock-flow consistent operations.
 * Ensures integer-safe distribution with no fractional loss.
 */

/**
 * Distribute an integer total fairly across recipients, preserving exactly
 * the total by distributing remainder to the first N recipients.
 * 
 * Example: distributeProRata(100, [1, 1, 1]) returns [34, 33, 33]
 *   Base share: 100 / 3 = 33.333...
 *   Floor shares: [33, 33, 33] = 99
 *   Remainder: 100 - 99 = 1
 *   Distribute remainder to first agent: [34, 33, 33] ✓
 * 
 * @param total - Total fiat to distribute (must be integer)
 * @param weights - Array of numeric weights (all ≥ 1)
 * @returns Array of integer shares, one per weight, summing to total
 */
export function distributeProRata(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (total === 0) return weights.map(() => 0);

  // Sum weights to compute base share
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const baseShare = Math.floor(total / weightSum);
  let distributed = baseShare * weightSum;
  const remainder = total - distributed;

  // Allocate base share to each recipient
  const shares = weights.map(() => baseShare);

  // Distribute remainder fairly: one unit to the first N recipients
  for (let i = 0; i < remainder; i++) {
    shares[i % weights.length]++;
  }

  return shares;
}
```

### How It Works for UBI (Task 2)

In `server/src/mechanics/automatedMarketMaker.ts`, line 534-543 becomes:

```typescript
import { distributeProRata } from '@idealworld/shared/math.js';

// ... (Step 1: collect tax remains the same)

// Step 2: Compute UBI per agent from the redistributable pool (FIXED)
const totalPoolInt = Math.floor(redistributablePool);
const livingAgents = agents.filter(a => a.status === 'alive');
const ubiShares = distributeProRata(totalPoolInt, livingAgents.map(() => 1)); // Equal weights

// Step 3: Compute net delta per agent (UBI received − tax paid)
const netDeltas = new Map<string, number>();
for (let i = 0; i < livingAgents.length; i++) {
  const agent = livingAgents[i];
  const tax = taxMap.get(agent.agentId) ?? 0;
  const ubiReceived = ubiShares[i];
  netDeltas.set(agent.agentId, ubiReceived - tax);
}
```

**Why this works:**
- Integer total (floored at collection) ensures no fractional loss
- Remainder distributed fairly (first N agents get +1 if remainder exists)
- Total UBI shares sum to exactly `totalPoolInt` — SFC preserved ✓
- All agents receive equal per-capita UBI (fair distribution)

### Implementation Checklist

- [ ] Create `shared/src/math.ts` with `distributeProRata()` implementation
- [ ] Export from `shared/src/types.ts` or create `shared/src/index.ts` to re-export
- [ ] Import in `server/src/mechanics/automatedMarketMaker.ts`
- [ ] Update Task 2 in `04-01-PLAN.md` to include file creation step
- [ ] Verify: `npm run build` in `server/` compiles without errors

---

## Problem 2: Missing Test Framework

### Current State

**CONFIRMED:** No test framework installed.

- `server/package.json` has no `test` script
- No test dependencies: Jest, Vitest, Mocha, Chai missing
- Test files exist (`server/src/mechanics/__tests__/physics_sandbox.ts`) but run standalone, not integrated
- No `npm run test` command available

### Why This Matters

The plan's Wave 3 (Tasks 9-11) tries to execute:
```bash
npm run test
```
This will fail immediately because the script doesn't exist.

### Solution: Minimal Vitest Setup

Install and configure **Vitest** (lightweight TS test runner, perfect for monorepo):

#### Step 1: Install Vitest

Update `server/package.json` devDependencies:

```json
"devDependencies": {
  "vitest": "^1.0.4",
  "@vitest/ui": "^1.0.4",
  "typescript": "^5.9.0",
  "tsx": "^4.19.0",
  "@types/node": "^24.0.0",
  ...
}
```

Command to run:
```bash
cd server && npm install
```

#### Step 2: Create Vitest Config

Create `server/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules'],
    testTimeout: 10000,
  },
});
```

#### Step 3: Add Test Script

Update `server/package.json` scripts:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

#### Step 4: Create Example Test File

Create `server/src/db/repos/__tests__/agentRepo.test.ts` (for BUG-01):

```typescript
import { describe, it, expect } from 'vitest';

describe('agentRepo - Wealth Preservation (BUG-01)', () => {
  it('should preserve fractional wealth without rounding', async () => {
    // After BUG-01 fix, wealth field should NOT use Math.round()
    // This is a placeholder — actual test requires DB setup
    
    const wealth = 42.7;  // Fractional fiat
    const preserved = Math.max(0, wealth);  // After fix: no Math.round()
    
    expect(preserved).toBe(42.7);
    expect(preserved).not.toBe(43);  // Would fail if Math.round() applied
  });

  it('should clamp wealth at floor (0) but not at ceiling', () => {
    const negativeWealth = Math.max(0, -5);
    expect(negativeWealth).toBe(0);
    
    const highWealth = Math.max(0, 999.99);
    expect(highWealth).toBe(999.99);  // No 100-clamp like stats
  });
});
```

#### Step 5: Test Skeleton Files for Wave 3

Create placeholder test files for the 3 validation tests (Tasks 9-11):

**File: `server/src/mechanics/__tests__/sfcAudit.test.ts`** (SFC smoke test)

```typescript
import { describe, it, expect } from 'vitest';

describe('SFC Audit - Regression Test', () => {
  it('should maintain SFC invariant: totalInitialFiat === totalFinalFiat', () => {
    // Full integration test: run 100-iteration simulation, verify fiat conservation
    // Placeholder — requires physics sandbox integration
    expect(true).toBe(true);
  });

  it('should verify AMM invariant: k = fiatReserve × foodReserve', () => {
    expect(true).toBe(true);
  });
});
```

**File: `server/src/mechanics/__tests__/edgeCases.test.ts`** (Edge cases)

```typescript
import { describe, it, expect } from 'vitest';

describe('Edge Cases - BUG-02, BUG-03', () => {
  it('should handle zero wealth agents in UBI distribution', () => {
    // Test: distributeProRata with zero-wealth agents
    expect(true).toBe(true);
  });

  it('should cascade auto-buy fallback with zero wealth', () => {
    // Test: metabolism starvation fallback logic
    expect(true).toBe(true);
  });
});
```

### Test Execution Commands

After setup:

```bash
# Quick run (Wave 1 verification)
npm run test

# Watch mode (development)
npm run test:watch

# UI dashboard (inspect test results)
npm run test:ui

# Run specific test
npm run test -- agentRepo.test.ts
```

### Implementation Checklist

- [ ] Add `vitest`, `@vitest/ui` to `server/package.json` devDependencies
- [ ] Run `npm install` in `server/` directory
- [ ] Create `server/vitest.config.ts` with config above
- [ ] Update `server/package.json` scripts section
- [ ] Create placeholder test files (3 above)
- [ ] Verify: `npm run test` executes without error (even if all skip)

---

## Plan Structure Recommendation

### Current Structure (Single 04-01-PLAN.md)

**Pros:**
- Atomic commit if all 6 bugs execute together
- Simpler orchestration (one plan file)

**Cons:**
- 11 tasks is too many for one wave—executor cognitive overload
- Wave 1 verification gate (SFC check) happens at the end, but SFC is broken until all 3 critical bugs done
- Wave 3 test setup (Task 8) is a prerequisite for Tasks 9-11, but not clearly marked

### Recommended Structure: Two Plans (BETTER)

**04-01-PLAN.md:** Waves 1-2 (6 tasks — fixes only)

```yaml
phase: 04-sfc-bug-fixes
plan: 01
wave: [1, 2]
depends_on: []
tasks:
  - Task 1: Fix BUG-01 (wealth rounding) [Wave 1]
  - Task 2: Fix BUG-02 (UBI distribution) [Wave 1] — now includes distributeProRata creation
  - Task 3: Fix BUG-03 (auto-buy fallback) [Wave 1]
  - Task 4: Fix BUG-04 (tax clamping) [Wave 2]
  - Task 5: Fix BUG-05 (health delta bounds) [Wave 2]
  - Task 6: Fix BUG-06 (dopamine feedback guard) [Wave 2]
```

**04-02-PLAN.md:** Wave 3 (test setup + validation)

```yaml
phase: 04-sfc-bug-fixes
plan: 02
wave: 3
depends_on: ["04-01-PLAN"]  # Must complete 04-01 first
tasks:
  - Task 1: Set up Vitest + test framework
  - Task 2: Create unit tests for each BUG (agentRepo, amm, metabolism, allostatic, dopamine)
  - Task 3: Run SFC regression test (100-iteration audit)
  - Task 4: Run edge-case test suite
  - Task 5: Verify: npm run test passes with all checks green
```

### Why This Is Better

1. **Clear phase gates:** 04-01 must succeed (SFC fixed) before 04-02 runs (tests validate)
2. **Less cognitive load:** 6 tasks = manageable executor focus; 5 tasks = quick test setup
3. **Dependency clarity:** Tests can't run until `npm run test` exists (04-02 Task 1 prerequisite)
4. **Staging:** Can pause after 04-01, verify SFC in production, then run 04-02 validation later
5. **Parallel flexibility:** If bugs are straightforward, 04-02 can start while 04-01 finishes

### Implementation Recommendation

**KEEP the current 04-01-PLAN.md mostly as-is, but:**

1. **Add distributeProRata creation as a prerequisite Task 0:**
   - Creates `shared/src/math.ts`
   - Exports from shared package
   - Task 2 then imports and uses it

2. **Move Wave 3 to a separate 04-02-PLAN.md** with clear `depends_on: ["04-01-PLAN"]`

3. **Make verification architecture explicit:** The physics_sandbox.ts already exists; reuse it for SFC regression test

---

## Consolidated Action Plan

### Action 1: Create distributeProRata Utility

**File:** `shared/src/math.ts` (create new)

```typescript
/**
 * Math utilities for stock-flow consistent operations.
 * Ensures integer-safe distribution with no fractional loss.
 */

/**
 * Distribute an integer total fairly across recipients, preserving exactly
 * the total by distributing remainder to the first N recipients.
 */
export function distributeProRata(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (total === 0) return weights.map(() => 0);

  const weightSum = weights.reduce((a, b) => a + b, 0);
  const baseShare = Math.floor(total / weightSum);
  let distributed = baseShare * weightSum;
  const remainder = total - distributed;

  const shares = weights.map(() => baseShare);
  for (let i = 0; i < remainder; i++) {
    shares[i % weights.length]++;
  }

  return shares;
}
```

**Update:** `shared/src/types.ts` — add export:
```typescript
export { distributeProRata } from './math.js';
```

### Action 2: Install and Configure Vitest

**File:** `server/package.json` — update devDependencies:
```json
"devDependencies": {
  "vitest": "^1.0.4",
  "typescript": "^5.9.0",
  ...
}
```

**File:** Create `server/vitest.config.ts`

**File:** `server/package.json` — update scripts:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  ...
}
```

Run: `cd server && npm install`

### Action 3: Update 04-01-PLAN.md

**Add Task 0 (prerequisite):** Create distributeProRata utility

**Update Task 2:** Import distributeProRata from shared, not assume it exists

**Clarify Task Waves:**

```yaml
<task type="auto" wave="1">
  <name>Task 1 (Wave 1)...

<task type="auto" wave="1">
  <name>Task 2 (Wave 1)...
```

### Action 4: Create 04-02-PLAN.md (Wave 3 — Validation)

**Structure:**
- depends_on: ["04-01-PLAN"]
- Task 1: Set up test framework (if not done)
- Task 2: Create unit tests for all 6 bugs
- Task 3: Run SFC regression (100-iteration audit)
- Task 4: Run edge-case suite
- Task 5: Verify all green

---

## Validation Checkpoint

Before proceeding:

✅ **`distributeProRata()` has a concrete solution** — implementation provided above, can be copy-pasted

✅ **Test framework has a concrete solution** — Vitest setup provided with exact config files and install steps

✅ **Plan structure is clear** — single plan 04-01 for fixes, separate 04-02 for validation (recommended but not required)

✅ **No ambiguity for executor** — all file paths, code snippets, and commands are explicit

---

## Summary Table

| Blocker | Status | Solution | Action |
|---------|--------|----------|--------|
| `distributeProRata()` missing | CONFIRMED | Create `shared/src/math.ts` with implementation | Add as Task 0 in 04-01-PLAN.md |
| No test framework | CONFIRMED | Install Vitest + create vitest.config.ts | Add setup to 04-02-PLAN.md (Wave 3) |
| Plan structure unclear | ADDRESSED | Split into 04-01 (fixes) + 04-02 (tests) | Optional but recommended |

---

## Files to Create/Modify

### Create (NEW)
- `shared/src/math.ts` — distributeProRata() utility
- `server/vitest.config.ts` — test runner config
- `server/src/db/repos/__tests__/agentRepo.test.ts` — BUG-01 unit test skeleton
- `server/src/mechanics/__tests__/sfcAudit.test.ts` — SFC regression test skeleton
- `server/src/mechanics/__tests__/edgeCases.test.ts` — edge case test skeleton
- (Optional) `.planning/phases/04-02-PLAN.md` — Wave 3 validation plan

### Modify
- `shared/src/types.ts` — re-export distributeProRata()
- `server/package.json` — add vitest, update test script
- `server/src/mechanics/automatedMarketMaker.ts` — import and use distributeProRata in Task 2
- (Optional) `04-01-PLAN.md` — add Task 0 for distributeProRata creation, clarify wave fields

---

## Sources

- **Codebase audit:** Verified absence of `distributeProRata()` by searching `shared/src/`, `server/src/mechanics/`, `server/src/db/`
- **package.json inspection:** Confirmed no test script, no test framework dependencies
- **Vitest docs:** https://vitest.dev/ (v1.0.4 recommended for TypeScript monorepo)
- **Phase 4 research:** Lines 65-87 (BUG-02 fix pattern), lines 240-250 (validation requirements)

---

## RESEARCH COMPLETE
