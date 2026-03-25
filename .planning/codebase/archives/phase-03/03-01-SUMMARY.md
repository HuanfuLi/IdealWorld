---
phase: 03-sfc-reliability-fixes
plan: 01
subsystem: simulation-engine
tags: [sfc, economy, accounting, bug-fix]
requirements: [SFC-01, SFC-02, SFC-03, SFC-04]
dependency_graph:
  requires: []
  provides: [integer-safe-pro-rata, sfc-hardened-embezzle, sfc-hardened-help, treasury-seeding-order]
  affects: [simulationRunner.ts, physics_sandbox.ts]
tech_stack:
  added: []
  patterns: [distributeProRata, Math.floor remainder distribution]
key_files:
  created: []
  modified:
    - server/src/orchestration/simulationRunner.ts
    - server/src/mechanics/__tests__/physics_sandbox.ts
decisions:
  - "Used distributeProRata(Math.floor + remainder) pattern in EMBEZZLE and seized-wealth redistribution for exact integer sums"
  - "BUG-04 fix: Early treasury seed uses a separate getLatestAMMSnapshot call (acceptable extra DB read on session start)"
  - "HELP fix cleaned up dead variable 'helperAvailable' identified in PLAN_SFC_FIXES.md Fix 5"
metrics:
  duration_minutes: 45
  completed: 2026-03-24
  tasks_completed: 2
  files_modified: 2
---

# Phase 3 Plan 01: SFC Reliability Fixes Summary

**One-liner:** Hardened SFC accounting with distributeProRata helper, treasury-before-floor ordering, and EMBEZZLE/HELP zero-sum invariants.

## What Was Changed and Why

### BUG-01: EMBEZZLE Victim-Death (SFC-01)

The EMBEZZLE settlement block modifies `cState.wealthDelta -= deducted` for each victim. When the stat-update loop runs and a victim dies (`shouldDie = true`), `newWealth = clampWealth(agent.currentStats.wealth + r4(weekState.wealthDelta))` already reflects the embezzle deduction because `weekState.wealthDelta` is the same reference. The `seizedWealthPool += Math.max(0, newWealth)` then seizes only the post-embezzle remaining wealth. No fiat is double-counted.

The code was correct but lacked explicit documentation. This was addressed with a detailed comment block explaining the invariant. The EMBEZZLE logic was also refactored to use `distributeProRata` (see BUG-12/14).

### BUG-03: HELP Action Fiat Destruction (SFC-02)

The HELP block had a dead variable `helperAvailable` that was computed but never referenced (identified as Fix 5 in `Documents/PLAN_SFC_FIXES.md`). The logic was refactored with clearer variable naming:

```typescript
const helpAmount = Math.abs(physics.wealthDelta);
const actualGift = Math.min(helpAmount, runningWealth);
beneficiaryState.wealthDelta += actualGift;
if (actualGift < helpAmount) {
  weekState.wealthDelta += (helpAmount - actualGift);
}
```

This ensures: helper can only give what `runningWealth` (the in-loop running position) holds; any uncovered portion is clawed back from `weekState.wealthDelta` so no fiat is destroyed.

### BUG-04: Treasury Seeding Order (SFC-03)

The genesis wealth floor (inside `if (startIter === 1)`) was reading `sessionStateTreasury.get(sessionId) ?? 0` but the treasury was only seeded in the `if (primaryMissing || multiMissing)` block that runs AFTER the genesis block. This meant `fundable = Math.min(totalTopUp, 0) = 0` and no agents ever got topped up on iteration 1.

Fixed by adding an early treasury seed before the genesis block:

```typescript
if (!sessionStateTreasury.has(sessionId)) {
  const savedAMMForTreasury = await economyRepo.getLatestAMMSnapshot(sessionId);
  const restoredTreasury = savedAMMForTreasury?.treasury;
  sessionStateTreasury.set(
    sessionId,
    restoredTreasury !== undefined ? restoredTreasury : Math.max(citizenAgents.length, 1) * 500,
  );
}
```

The original treasury init in the AMM block is guarded by `if (!sessionStateTreasury.has(sessionId))` and will not overwrite the early-seeded value.

### BUG-12/14: Integer-Safe Rounding (SFC-04)

Added `distributeProRata(total, ratios)` helper to `simulationRunner.ts`:
- Uses `Math.floor(total * (r / ratioSum))` for each share
- Distributes the integer remainder (`total - sum(shares)`) to the first N participants
- Guarantees `sum(shares) === total` exactly, eliminating IEEE-754 float drift

Applied to:
1. **EMBEZZLE settlement**: Replaced `EMBEZZLE_TARGET / contributors.length` with `distributeProRata` using available-wealth as ratios
2. **Phase Sheriff C seized-wealth redistribution**: Replaced `seizedWealthPool / survivorUpdates.length` with equal `distributeProRata` shares

## Test Results

All 16 physics sandbox tests pass:

```
Results: 16 passed, 0 failed
ALL PHYSICS SANDBOX TESTS PASSED — Economy is mathematically sound.
```

New tests added (Tests 7-11):
- Test 7: EMBEZZLE victim-death wealth conservation (BUG-01)
- Test 8-9: HELP zero-wealth and partial-wealth SFC invariant (BUG-03)
- Test 10: distributeProRata integer-safe summation (BUG-12/14)
- Test 11: Treasury-before-floor ordering requirement (BUG-04)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 802dc2a | test | Add SFC unit tests for BUG-01, BUG-03, BUG-04, BUG-12/14 |
| dd521d8 | fix | Fix EMBEZZLE victim-death and HELP fiat destruction + treasury ordering |
| a3ecc16 | fix | Integer-safe rounding for seized-wealth redistribution |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Applied distributeProRata to Phase Sheriff C redistribution**
- **Found during:** Task 2
- **Issue:** `seizedWealthPool / survivorUpdates.length` in Phase Sheriff C (line 2468) had the same float-division drift problem as EMBEZZLE
- **Fix:** Applied `distributeProRata` with equal weights so survivors receive integer shares summing exactly to `Math.floor(seizedWealthPool)`
- **Files modified:** `server/src/orchestration/simulationRunner.ts`
- **Commit:** a3ecc16

**2. [Rule 1 - Bug] Removed dead variable `helperAvailable` in HELP block**
- **Found during:** Task 1 review
- **Issue:** Variable was computed but never referenced (also noted in `Documents/PLAN_SFC_FIXES.md` Fix 5)
- **Fix:** Removed dead variable; renamed `actualGift` for clarity
- **Files modified:** `server/src/orchestration/simulationRunner.ts`
- **Commit:** dd521d8

## Known Stubs

None — all changes are hardening of existing mechanics with no placeholder data.

## Self-Check: PASSED
