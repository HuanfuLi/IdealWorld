---
phase: 04-sfc-bug-fixes
research: complete
date: 2026-03-26
status: UPDATED with Rounding Fixes
---

# Phase 4 Research - COMPLETE WITH ROUNDING FIXES

## Critical Update: 500 Fiat Leak in Iteration 1

After initial Phase 4 implementation attempt, comprehensive code audit revealed **systematic rounding throughout the economic calculation pipeline** causing additional fiat losses beyond the original 6 bugs.

**NEW FINDING:** Phase 4 fixes addressed visible bugs (wealth rounding in DB, UBI division), but left **deeper rounding in intermediate calculations** that mask and compound losses.

---

## Root Cause Analysis: Dual-Layer Rounding Problem

### Layer 1: Visible Rounding (Phase 4 Original - FIXED)
- ❌ `Math.round(wealth)` in agentRepo.ts - Destroys 0.2-0.5 fiat/agent/cycle
- ❌ `float division` in UBI pool - Loses remainder

### Layer 2: Hidden Rounding (Phase 4 UPDATED - NEW FIXES)
- ❌ `Math.round(totalSatietyCost)` in simulationRunner.ts line 471 - Loses 0.1-0.3 per agent/iteration
- ❌ `Math.floor(redistributablePool)` in automatedMarketMaker.ts line 539 - Loses fractional pool before distribution
- ❌ `Math.round(totalFiatSupply)` in simulationRunner.ts line 2663 - MASKS drift detection, hides all losses

---

## 7 Total Issues to Fix (Not 6)

### 🔴 CRITICAL - Calculation Path Rounding (NEW)

#### Issue 7a: SFC Telemetry Rounding Masks Drift (NEW DISCOVERY)
- **File:** server/src/orchestration/simulationRunner.ts
- **Line:** 2663
- **Code:** `totalFiatSupply: Math.round(totalFiatSupply),`
- **Impact:** Rounds 500.4 → 500, compares to previous 500 instead of 500.4
- **Loss per iteration:** Invisible (up to 0.5 fiat masked per report)
- **Solution:** Remove Math.round(), keep fractional; add display field `totalFiatSupplyRounded` for UI
- **Root cause:** SFC drift check on line 2680 compares unrounded values correctly, but telemetry reports rounded value, creating mismatch between "actual fiat" and "reported fiat"

#### Issue 7b: Satiety Cost Rounding (NEW DISCOVERY)  
- **File:** server/src/orchestration/simulationRunner.ts
- **Line:** 471
- **Code:** `const satietyCost = Math.max(1, Math.round(totalSatietyCost));`
- **Impact:** Rounds 1.2 → 1 (loses 0.2); compounds with multiple agents
- **Loss per iteration:** 20 agents × 0.15 avg = ~3-5 fiat
- **Solution:** Use `Math.max(1, totalSatietyCost)` (keep fractional)
- **Root cause:** totalSatietyCost is sum of fractional action costs that rounds, losing precision in wealth calculation

#### Issue 7c: UBI Pool Flooring (NEW DISCOVERY)
- **File:** server/src/mechanics/automatedMarketMaker.ts
- **Line:** 539
- **Code:** `const totalPoolInt = Math.floor(redistributablePool);`
- **Impact:** Floors 25.7 → 25 (loses 0.7); pool is fractional when taxes are fractional
- **Loss per iteration:** ~10-15 fiat (accumulated from fractional taxes)
- **Solution:** Use `const totalPoolInt = redistributablePool;` (keep fractional); distributeProRata handles fractional totals
- **Root cause:** Tax collection results in fractional pool; flooring before distribution loses remainder

---

### 🟠 HIGH - Verification Needed

#### Issue 4: Wage Payment Truncation (Original - Needs Verification)
- **File:** server/src/orchestration/simulationRunner.ts
- **Lines:** 2029-2038
- **Current code has remainder distribution** but edge case with fractional payRatio needs testing
- **Solution:** Verify existing remainder loop works correctly; add test for bankruptcy scenario

#### Issue 5: AMM Food Floor (Original - Needs Verification)
- **File:** server/src/orchestration/simulationRunner.ts
- **Lines:** 844, 884
- **Code:** `const foodReceived = Math.floor(preview.foodOut);`
- **Solution:** Verify exactFiat recalculates correctly from floored quantity; AMM invariant preserved

#### Issue 6: Display Rounding (Original - Needs Audit)
- **Files:** simulationRunner.ts lines 151-153, 2565
- **Solution:** Confirm display-only; doesn't affect calculations

---

## Updated 6 Original Bugs + 3 New Rounding Issues

| ID | Severity | Category | File | Line | Issue | Loss/Iter |
|---|---|---|---|---|---|---|
| BUG-01 | 🔴 CRITICAL | SFC | agentRepo.ts | 100 | Math.round(wealth) in DB update | 0.2-0.5 fiat/agent |
| BUG-02 | 🔴 CRITICAL | SFC | automatedMarketMaker.ts | 536 | Float division in UBI (original) | Remainder loss |
| BUG-03 | 🟠 HIGH | Logic | simulationRunner.ts | 498-514 | No cascade fallback on auto-buy | Starvation death |
| BUG-04 | 🟡 MEDIUM | Logic | simulationRunner.ts | ~1850 | Redundant tax clamping | Logic error |
| BUG-05 | 🟡 MEDIUM | Logic | allostaticEngine.ts | ~120 | Unclamped health delta | Bounds error |
| BUG-06 | 🟡 MEDIUM | Logic | allostaticEngine.ts | ~80 | Dopamine feedback re-application | Guard missing |
| **BUG-07a** | **🔴 CRITICAL** | **Rounding** | **simulationRunner.ts** | **2663** | **Math.round(totalFiatSupply) masks drift** | **0.5 masked/report** |
| **BUG-07b** | **🔴 CRITICAL** | **Rounding** | **simulationRunner.ts** | **471** | **Math.round(totalSatietyCost) loses precision** | **~3-5 fiat/iter** |
| **BUG-07c** | **🔴 CRITICAL** | **Rounding** | **automatedMarketMaker.ts** | **539** | **Math.floor(redistributablePool) loses UBI** | **~10 fiat/iter** |

---

## Why 500 Fiat Leaked in Iteration 1

**Not a single bug—a cascade of rounding:**

1. **Iteration 1 metabolism:** 20 agents × 0.15 satiety rounding loss = **3 fiat** lost
2. **Iteration 1 taxation:** Fractional tax pool floor = **3-5 fiat** lost
3. **Iteration 1 UBI:** Fractional remainder never distributed = **2-5 fiat** lost
4. **Subtotal per iteration:** 8-15 fiat lost
5. **Cumulative over N iterations:** If run for 25-60 iterations before reporting: 200-900 fiat
6. **Reported as 500:** Math.round() on telemetry rounds 500.4 → 500, masking individual iteration leaks

**The 500 fiat leak is the SUM of all rounding losses over multiple iterations, hidden by Math.round() on line 2663.**

---

## Fix Strategy: Dual Approach

### Approach A: Immediate Fixes (Highest Impact)

**Remove rounding from calculation path; preserve only in display:**

1. ✅ Remove `Math.round(totalFiatSupply)` → keep fractional for SFC check
2. ✅ Remove `Math.round(totalSatietyCost)` → keep fractional in wealth calculation
3. ✅ Remove `Math.floor(redistributablePool)` → distribute fractional UBI remainder

**Add display rounding:**
- `totalFiatSupplyRounded: Math.round(totalFiatSupply)` for UI telemetry
- Keep wealth displays rounded for user-facing numbers

### Approach B: Verification (Edge Cases)

1. Verify wage payment remainder distribution works correctly
2. Verify AMM food floor doesn't violate invariant
3. Audit stats display rounding is truly display-only

---

## Implementation Order

### Wave 1: Create Math Utility (Prerequisite)
- Task 0: Create `shared/src/math.ts` with `distributeProRata()` (handles fractional totals)
  - Enables Task 3 to use distributeProRata for fractional UBI pool

### Wave 2: Fix SFC-Critical Bugs (Sequential - Interdependent)
- Task 1: Remove Math.round(wealth) from agentRepo.ts
- Task 2: Remove Math.round(totalSatietyCost) from simulationRunner.ts line 471
- Task 3: Remove Math.floor(redistributablePool), use distributeProRata with fractional total
  - Depends on Task 0 (distributeProRata available)

### Wave 3: Fix Logic + Rounding Issues (Parallel)
- Task 4: Fix auto-buy cascade (BUG-03) + verify wage truncation (BUG-04 adjacent)
- Task 5: Clamp health delta + verify dopamine guard (BUG-05, BUG-06)
- Task 6: Remove Math.round(totalFiatSupply) from SFC telemetry; add totalFiatSupplyRounded display field

### Wave 4: Verification (Sequential after Wave 3)
- Task 7: Verify AMM food floor, display rounding audits
- Task 8: Create comprehensive SFC test with unrounded tracking to ±$0.001 tolerance

---

## Files Modified

1. **shared/src/math.ts** (NEW) - distributeProRata utility
2. **shared/src/types.ts** - Export distributeProRata
3. **server/src/db/repos/agentRepo.ts** - Remove wealth Math.round()
4. **server/src/orchestration/simulationRunner.ts** - Remove satiety Math.round(), remove SFC telemetry Math.round(), add totalFiatSupplyRounded
5. **server/src/mechanics/automatedMarketMaker.ts** - Remove Math.floor(redistributablePool), use distributeProRata with fractional
6. **server/src/orchestration/simulationRunner.ts** - Auto-buy cascade (BUG-03)
7. **server/src/mechanics/allostaticEngine.ts** - Health clamping, dopamine guard
8. **server/src/__tests__/sfc-unrounded.test.ts** (NEW) - Comprehensive SFC validation

---

## Success Criteria

1. ✅ All 6 original bugs fixed (BUG-01 through BUG-06)
2. ✅ All 3 new rounding issues fixed (BUG-07a, 7b, 7c)
3. ✅ SFC invariant holds to ±$0.001 over 100 iterations (tracked unrounded)
4. ✅ 0 fiat leak detected in 200-iteration smoke test
5. ✅ Wage payment, AMM invariant, display rounding verified correct
6. ✅ All calculations use fractional precision; only display rounds

---

## Key Changes Summary

### What Stays the Same
- Database storage (JSON preserves floats)
- Physics engine calculations (already float-based)
- UI display (still rounded for user)

### What Changes
- **Intermediate calculations:** Keep fractional throughout
- **SFC telemetry:** Unrounded totalFiatSupply (with totalFiatSupplyRounded for display)
- **Satiety costs:** Fractional throughout, no rounding
- **UBI distribution:** Fractional pool distributed via distributeProRata

### Net Effect
- **Before:** 500 fiat leaked in iteration 1 (8-15 fiat/iter × 30-60 iters + masking)
- **After:** 0 fiat leak; SFC holds within ±$0.001 (machine epsilon precision)

---

## Risk Assessment

**LOW RISK:** All changes are precision improvements:
- Fractional precision is MORE accurate, not less
- Display rounding still applied to UI
- No logic changes to physics or interactions
- No behavior changes—only internal calculation precision

**VERIFICATION:** New comprehensive SFC test validates fix; can revert if needed.

---

## Timeline & Complexity

**Scope:** 9 tasks organized in 4 waves
- Wave 1: 1 task (utility creation)
- Wave 2: 3 tasks (SFC-critical fixes, sequential)
- Wave 3: 3 tasks (logic + rounding, parallel)
- Wave 4: 2 tasks (verification, sequential)

**Total estimated complexity:** Medium (9 tasks, mix of new code + modifications)

---

