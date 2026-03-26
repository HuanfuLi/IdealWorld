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

**Plans:** 2 plans
- [x] 04-01-PLAN.md — SFC Critical Fixes & Math Utility (completed 2026-03-25)
  - Task 0: Create distributeProRata() utility (prerequisite)
  - Tasks 1-3: Fix critical SFC violations (BUG-01, BUG-02, BUG-03)
  - Tasks 4-7: Fix logic issues and validate (BUG-04, BUG-05, BUG-06)
  - Task 8: Final validation
- [ ] 04-02-PLAN.md — Test Infrastructure & Validation (4 tasks in Wave 3)
  - Task 0: Install Vitest + configure test runner
  - Tasks 1-3: Create unit tests, SFC audit, edge case tests
  - Task 4: Execute full test suite and validate
