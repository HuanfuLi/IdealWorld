# RESEARCH: Phase 3 SFC & Reliability Fixes

This research document outlines the technical requirements and implementation strategies for resolving the critical and high-severity issues identified in the Phase 3 codebase review.

## 1. EMBEZZLE Victim-Death (BUG-01)
- **Location**: `server/src/orchestration/simulationRunner.ts`
- **Current State**: Embezzlement happens before death resolution. If a victim dies, their `wealthDelta` (negative from embezzlement) is lost during the final wealth capture (seizure).
- **Required Change**: Ensure EMBEZZLE logic tracks the total amount stolen and that death seizures explicitly include the negative wealth deltas of victims if they die in the same turn.
- **Verification Strategy**: Unit test with one embezzler and multiple victims, where one victim's health is low enough to trigger death in the same iteration.

## 2. Order Book Persistence (BUG-02)
- **Location**: `server/src/orchestration/simulationRunner.ts`, `server/src/db/repos/iterationRepo.ts` (or new repository).
- **Current State**: `orderBook.reset()` clears orders in memory without persisting them.
- **Required Change**: Create a DB schema for `order_book_snapshots` linked to the session/iteration. Modify `simulationRunner` to save the order book state atomically with the AMM and Treasury. Restore the order book on session resume.
- **Verification Strategy**: Start a simulation, pause it, restart the server, resume, and confirm that pending orders from before the restart are still in the order book.

## 3. MET Metabolism Aggregation (BUG-06)
- **Location**: `server/src/mechanics/physicsEngine.ts` (`resolveActionQueue`), `server/src/mechanics/allostaticEngine.ts`.
- **Current State**: Only the first action in the queue is billed for MET costs.
- **Required Change**: Modify `resolveActionQueue` to iterate through all 3 actions in the queue and sum their MET values. Pass the total MET to the metabolism engine.
- **Verification Strategy**: Compare caloric burn of an agent performing `REST, REST, REST` versus `WORK, WORK, WORK`.

## 4. SSE Sequence Numbering (BUG-08)
- **Location**: `server/src/routes/simulate.ts`, `web/src/stores/simulationStore.ts`.
- **Current State**: SSE events lack sequence IDs.
- **Required Change**: Assign a monotonic `id` to each SSE event on the server. Update the frontend to track `lastSeenId` and discard any event with `id <= lastSeenId`.
- **Verification Strategy**: Simulate a network disconnection/reconnection and confirm that no duplicate events are processed and no sequence gaps go unnoticed.

## 5. Treasury Initialization & Rounding (Codex Findings)
- **Location**: `server/src/orchestration/simulationRunner.ts`, `server/src/db/repos/agentRepo.ts`.
- **Current State**: Treasury init runs after the wealth floor check. Wealth updates are rounded to integers in the repo, causing SFC drift.
- **Required Change**: 
  - Move treasury seeding to before any wealth floor calculations.
  - Audit all wealth transfers to ensure they are integer-safe OR implement a "dust" reconciliation to the treasury for any fractional remainders.
- **Verification Strategy**: Run 100 iterations and verify that `Sum(Agent Wealth) + Treasury + AMM Reserve` remains perfectly constant.

## 6. Snapshot Atomicity (BUG-05)
- **Location**: `server/src/orchestration/simulationRunner.ts`.
- **Current State**: Snapshots are written as separate DB operations.
- **Required Change**: Use a single Drizzle DB transaction to commit the iteration record, AMM snapshot, and Treasury snapshot.
- **Verification Strategy**: Induce a DB failure mid-snapshot and confirm that no partial iteration data is persisted.
