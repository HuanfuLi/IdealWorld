# Phase 3 Plan Review: SFC & Reliability Hardening

This document aggregates independent reviews from Gemini, Claude, and Codex AI CLIs.

## Executive Summary
The review process has identified a significant discrepancy: **the majority of the technical fixes proposed in Phase 3 are already implemented in the codebase.** 

- **Plans 03-01 and 03-02** are largely redundant as the core bugs (EMBEZZLE, HELP, Treasury Init, Order Book Persistence, MET Aggregation) already have implementation code and comments (e.g., `// BUG-01 fix`) in the source.
- **Plan 03-03** is valid but requires more precision regarding SSE transport IDs versus JSON fields.
- **Plan 03-04** is partially complete; typography refactors are done, but color tokenization remains.

**Final Verdict: FLAG (Stale Plans)**
Execution should be pivoted from "Implementation" to "Verification & Gap Closure."

---

## [Gemini Assessment]
*Focus: Implementation Status & Empirical Verification*

- **03-01 (SFC Core)**: **STALE**. `simulationRunner.ts` already contains `distributeProRata`, the EMBEZZLE fix (L2095), the HELP fix (L1854), and the Treasury seeding fix (L1021).
- **03-02 (Persistence)**: **STALE**. `orderBook.ts` already has `loadFromDB`, `submitOrder` with persistence, and transactional matching. `simulationRunner.ts` already uses a transaction for snapshots.
- **03-04 (UI/UX)**: **PARTIAL**. `PhysicsLaboratory.tsx` still contains some inline styles (L253), contrary to Claude's automated check, but CTA labels are already standardized.

---

## [Claude Review]
*Focus: Logical Consistency & Stale Task Detection*

- **Critical**: Identified that 03-01 and 03-02 are "walking into already-done work."
- **Critical**: Noted that the `npm test` command in the plans is incorrectly formatted for the workspace/Vitest setup.
- **Improvement**: Suggested that `03-04` should exclude `index.css` from hex-count success criteria to avoid false failures.
- **Verdict**: **BLOCK** (for 03-02) / **FLAG** (for 03-01/03-04).

---

## [Codex Review]
*Focus: Technical Rigor & Edge Cases*

- **Critical (03-03)**: Pointed out the confusion between SSE `id:` transport lines and JSON `id` fields. Browser recovery only works with the former.
- **Critical (03-03)**: Noted that "full state refresh" on gap detection needs a concrete implementation plan, not just a mention.
- **Improvement**: Suggested that the intent-history ring buffer must apply during initial load/hydration, not just at append-time.
- **Verdict**: **FLAG**.

---

## Conclusion & Corrective Actions
1. **Pivot to Verification**: Convert 03-01 and 03-02 into a single "Verification & Audit" phase. Instead of implementing, the task is to run the `physics_sandbox.ts` and verify the existing fixes under stress.
2. **Refine SSE (03-03)**: Update the plan to explicitly use SSE `id:` headers and define the state-refresh protocol on gap detection.
3. **Clean UI (03-04)**: Focus strictly on the ~50 remaining hardcoded hex values in component files and the specific inline styles identified in `PhysicsLaboratory.tsx`.
4. **Fix Test Commands**: Update all plans to use `npx vitest` or `npx tsx` as appropriate.
