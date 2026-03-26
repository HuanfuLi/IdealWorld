# Ideal World Roadmap

## Phase 3: SFC & Reliability Hardening

**Goal:** Resolve critical Stock-Flow Consistency (SFC) bugs, harden simulation persistence, and standardize UI/UX patterns across the simulation.

**Requirements:**
- **SFC-01:** Fix EMBEZZLE victim-death wealth destruction (BUG-01).
- **SFC-02:** Fix HELP action fiat destruction for zero-wealth agents (BUG-03).
- **SFC-03:** Move treasury seeding before genesis wealth floor calculations (BUG-04).
- **SFC-04:** Standardize integer-safe rounding and floor-based reconciliation (BUG-12/14).
- **REL-01:** Persistent Order Book storage using SQLite/Drizzle (BUG-02).
- **REL-02:** Atomic iteration snapshots using DB transactions (BUG-05).
- **REL-03:** Multi-action metabolic billing (MET aggregation) (BUG-06).
- **REL-04:** SSE sequence numbering for synchronization (BUG-08).
- **REL-05:** Prevent session map and store memory leaks (BUG-10, Gemini Review).
- **UI-01:** Tokenize color palette into semantic CSS variables.
- **UI-02:** Standardize typography and remove inline styles.
- **UI-03:** Align CTA labels with project-specific terminology.

**Plans:** 4 plans
- [x] 03-01-PLAN.md — SFC & Accounting Core Hardening (completed 2026-03-24)
- [x] 03-02-PLAN.md — Persistence & Reliability Foundations (completed 2026-03-23)
- [x] 03-03-PLAN.md — SSE Synchronization & Store Cleanup (completed 2026-03-24)
- [x] 03-04-PLAN.md — UI/UX Standardization & Cleanup (completed 2026-03-24)

---

## Phase 4: SFC Bug Fixes & Logic Corrections

**Goal:** Fix 6 critical bugs identified in codebase audit: two SFC violations that destroy fiat over long simulations, auto-buy starvation edge case, and three medium-priority logic/design issues. Restore SFC invariant to ±$0.01.

**Requirements:**
- **BUG-01:** Fix wealth integer rounding SFC violation (destroys 0.2-0.5 fiat/agent/cycle)
- **BUG-02:** Fix UBI redistribution float division (loses remainder ~0.0001 fiat/cycle)
- **BUG-03:** Fix auto-buy metabolism starvation edge case (lacks partial purchase fallback)
- **BUG-04:** Simplify redundant tax Math.min() clamping
- **BUG-05:** Clamp allostatic health delta to [0, 100]
- **BUG-06:** Document dopamine feedback limits and guard against re-application

**Impact:** Fixes will restore SFC invariant, preventing 60-120% economy loss over 100 iterations.

**Plans:** 3 plans
- [x] 04-01-PLAN.md — SFC Critical Fixes & Math Utility (completed 2026-03-25)
  - Task 0: Create distributeProRata() utility (prerequisite)
  - Tasks 1-3: Fix critical SFC violations (BUG-01, BUG-02, BUG-03)
  - Tasks 4-7: Fix logic issues and validate (BUG-04, BUG-05, BUG-06)
  - Task 8: Final validation
- [x] 04-02-PLAN.md — Test Infrastructure & Validation (completed 2026-03-25)
  - Task 0: Install Vitest + configure test runner
  - Tasks 1-3: Create unit tests, SFC audit, edge case tests
  - Task 4: Execute full test suite and validate (20 tests, 0 failures)
- [x] 04-03-PLAN.md — Hidden Rounding Elimination (completed 2026-03-25)
  - Task 0: Remove Math.round() from satiety costs and SFC telemetry (BUG-07a, BUG-07b)
  - Task 1: Remove Math.floor() from UBI pool (BUG-07c; Math.floor retained — distributeProRata integer constraint)
  - Task 2: Audit and annotate display rounding separation
  - Task 3: Create sfc-unrounded.test.ts with 6 invariant tests (26 total, all passing)

**NEW DISCOVERY:** After 04-01/04-02 execution, 500 fiat leaked in iteration 1 due to hidden rounding in intermediate calculations (not just the original 6 bugs). Plan 04-03 fixes this systemic rounding issue.

---

## Phase 5: Complete Rounding Elimination & SFC Precision Hardening

**Goal:** Eliminate all rounding from economic calculation paths. Phase 4 fixed visible bugs but left systematic rounding that masks incremental fiat losses. 500 fiat leaked in iteration 1 due to Math.round() on SFC telemetry plus precision loss in satiety, UBI, and wage calculations. Complete overhaul to separate "calculation precision" (fractional) from "display rounding" (UI only).

**Requirements:**
- **ROUND-01:** Remove Math.round() from SFC telemetry line 2663 (masks drift detection)
- **ROUND-02:** Use fractional satiety costs (line 471, prevents 5+ fiat loss/iteration)
- **ROUND-03:** Distribute fractional UBI remainder (line 539, prevents 10+ fiat loss/iteration)
- **ROUND-04:** Verify wage payment truncation doesn't lose fiat (line 2029-2038)
- **ROUND-05:** Verify AMM food floor doesn't violate invariant (line 844/884)
- **ROUND-06:** Audit display rounding is truly display-only (lines 151-153, 2565)
- **ROUND-07:** Create comprehensive SFC test tracking unrounded fiat to ±$0.001 tolerance

**Impact:** Eliminates systematic fiat leakage from rounding. Restores SFC invariant to true zero-sum (within machine epsilon).

**Plans:** (Not yet created - awaiting user approval to proceed with implementation)
