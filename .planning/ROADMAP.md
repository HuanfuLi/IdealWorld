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
