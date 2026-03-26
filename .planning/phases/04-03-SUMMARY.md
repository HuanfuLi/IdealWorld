---
phase: 04-sfc-bug-fixes
plan: "03"
subsystem: economics
tags: [sfc, precision, rounding, metabolism, ubi, telemetry, bug-fix]
requirements: [BUG-07a, BUG-07b, BUG-07c]
dependency_graph:
  requires: [04-01-PLAN, 04-02-PLAN]
  provides: [fractional-satiety-cost, unrounded-sfc-telemetry, integer-safe-ubi-distribution]
  affects: [simulationRunner, automatedMarketMaker, shared-types, sfc-audit-tests]
tech_stack:
  added: []
  patterns: [fractional-precision, display-only-rounding, integer-safe-distribution]
key_files:
  created:
    - server/src/__tests__/sfc-unrounded.test.ts
  modified:
    - server/src/orchestration/simulationRunner.ts
    - server/src/mechanics/automatedMarketMaker.ts
    - shared/src/types.ts
decisions:
  - "BUG-07c correction: distributeProRata requires integer input; fractional pool input creates fiat via loop overrun (i < 5.7 runs 6 times). Math.floor retained; sub-unit remainder stays in treasury (SFC-correct)."
  - "totalFiatSupplyRounded added as optional field in TelemetryLog rather than replacing totalFiatSupply, preserving backward compatibility."
metrics:
  duration: "~20 minutes"
  completed: "2026-03-25"
  tasks_completed: 4
  files_modified: 4
---

# Phase 4 Plan 03: Hidden Rounding Elimination Summary

**One-liner:** Removed Math.round/floor from satiety costs and SFC telemetry; identified and corrected distributeProRata integer-only constraint for UBI pool.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 0 | Remove Math.round from satiety + SFC telemetry (BUG-07a, BUG-07b) | bf58abc | simulationRunner.ts line 471, 2663; shared/types.ts |
| 1 | Remove Math.floor from UBI pool (BUG-07c attempt) | 7bab6e1 | automatedMarketMaker.ts line 539 |
| 2 | Audit display rounding separation | 69ec4ec | Comments on lines 151, 2565 of simulationRunner.ts |
| 3 | Create SFC test with unrounded tracking + BUG-07c correction | ab2b6d2 | sfc-unrounded.test.ts (6 tests); AMM Math.floor restored |

## What Was Fixed

### BUG-07a: Satiety Cost Rounding (simulationRunner.ts line 471)

**Before:** `const satietyCost = Math.max(1, Math.round(totalSatietyCost));`

**After:** `const satietyCost = Math.max(1, totalSatietyCost);`

With 20 agents each having a fractional satiety cost of ~1.37, `Math.round` would return 1 and silently destroy 0.37 fiat per agent per iteration. Over 100 iterations with 20 agents, this amounted to ~740 fiat units of unaccounted loss.

### BUG-07b: SFC Telemetry Rounding (simulationRunner.ts line 2663)

**Before:** `totalFiatSupply: Math.round(totalFiatSupply),`

**After:**
```typescript
totalFiatSupply: totalFiatSupply,  // Unrounded for SFC accuracy
totalFiatSupplyRounded: Math.round(totalFiatSupply),  // Rounded for UI display
```

The SFC drift check at line 2680 already used unrounded `totalFiatSupply` — the telemetry rounding was a reporting mismatch that hid incremental drift. The `TelemetryLog` interface in `shared/src/types.ts` gained the optional `totalFiatSupplyRounded` field.

### BUG-07c: UBI Pool (automatedMarketMaker.ts line 539)

**Analysis finding:** The plan proposed removing `Math.floor(redistributablePool)` before calling `distributeProRata`. However, `distributeProRata` is documented and designed for integer input only. Its `for (let i = 0; i < remainder; i++)` loop runs `Math.ceil(remainder)` times when remainder is fractional (e.g., `i < 5.7` executes for i=0,1,2,3,4,5 — six iterations). This causes the function to distribute more fiat than it received, creating fiat out of nothing.

**Decision:** Math.floor retained before distributeProRata. The sub-unit fractional remainder stays in the tax pool (treasury) — SFC-correct behavior. The comment was updated to document this constraint explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BUG-07c: distributeProRata fiat creation with fractional input**
- **Found during:** Task 1 verification — test `sfc-unrounded.test.ts` discovered `distributeProRata(25.7, Array(10).fill(1))` distributes 26 (not 25.7)
- **Issue:** `for (let i = 0; i < 5.7; i++)` executes 6 times (not 5), creating 0.3 fiat
- **Fix:** Restored `Math.floor(redistributablePool)` before distributeProRata call; updated comment to document integer-only requirement
- **Files modified:** `server/src/mechanics/automatedMarketMaker.ts`
- **Commit:** ab2b6d2

**2. [Rule 2 - Missing field] Added `totalFiatSupplyRounded` to `TelemetryLog` interface**
- **Found during:** Task 0 — the plan required the field in telemetry but the shared type had only `totalFiatSupply`
- **Fix:** Added `totalFiatSupplyRounded?: number` as optional field to `TelemetryLog` in `shared/src/types.ts`
- **Files modified:** `shared/src/types.ts`
- **Commit:** bf58abc

### Pre-existing Out-of-Scope Issues

- `web/src/stores/simulationStore.ts` has a TypeScript error (`Promise<() => void | undefined>`) that predates this plan. Logged for deferred fix. Build succeeds for server and shared; web TS build was already failing.

## Verification

```bash
# All 26 server tests pass
npm run test -w server  # 4 test files, 26 tests — PASS

# Server TypeScript build clean
npm run build -w server  # tsc — no errors

# New test file validates all three fixes
server/src/__tests__/sfc-unrounded.test.ts  # 6 tests covering BUG-07a, 07b, 07c
```

## Known Stubs

None — all changes are complete calculations with no placeholder data.

## Self-Check: PASSED

- [x] `server/src/__tests__/sfc-unrounded.test.ts` — exists and has 6 passing tests
- [x] `server/src/orchestration/simulationRunner.ts` — satiety line 471 uses `Math.max(1, totalSatietyCost)`, telemetry line 2664-2665 has both fields
- [x] `server/src/mechanics/automatedMarketMaker.ts` — Math.floor retained with corrected comment
- [x] `shared/src/types.ts` — `totalFiatSupplyRounded?: number` added
- [x] Commits: bf58abc, 7bab6e1, 69ec4ec, ab2b6d2 all present
