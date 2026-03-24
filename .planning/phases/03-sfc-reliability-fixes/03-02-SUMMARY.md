---
phase: 03-sfc-reliability-fixes
plan: 02
subsystem: economy/persistence
tags: [order-book, sqlite, atomic-transactions, met-metabolism, sfc]
dependency_graph:
  requires: [03-01]
  provides: [persistent-order-book, atomic-iteration-snapshots, met-aggregation]
  affects: [simulationRunner, orderBook, schema, migrate]
tech_stack:
  added: []
  patterns: [sqlite.transaction() for atomic writes, Drizzle .run() for synchronous inserts]
key_files:
  created: []
  modified:
    - server/src/db/schema.ts
    - server/src/db/migrate.ts
    - server/src/mechanics/orderBook.ts
    - server/src/orchestration/simulationRunner.ts
decisions:
  - "Used sqlite.transaction() + Drizzle .run() (synchronous) for atomic snapshots rather than async db.transaction() to avoid await inside the synchronous better-sqlite3 transaction callback"
  - "AMM snapshot now co-committed with iterations row; old standalone saveAMMSnapshot call removed"
  - "MET metabolism uses actionsToMeter.length as queue size indicator in event log (replaces per-action metMultiplier which was not available post-aggregation)"
  - "Order book restore is gated on isOrderBookWarm() to avoid overwriting live in-memory state during mid-session continuation"
metrics:
  duration: ~25min
  completed: 2026-03-24
  tasks_completed: 2
  files_changed: 4
---

# Phase 03 Plan 02: Persistent Order Book, Atomic Snapshots, MET Aggregation Summary

Implemented three reliability fixes: SQLite-backed Order Book persistence (BUG-02/REL-01), atomic iteration snapshot commits (BUG-05/REL-02), and multi-action MET metabolic billing aggregation (BUG-06/REL-03).

## What Was Changed

### Task 1 — Persistent Order Book (BUG-02 / REL-01)

**`server/src/db/schema.ts`**
Added `orderBook` table definition with columns: `id`, `sessionId`, `agentId`, `side`, `itemType`, `price`, `quantity`, `filledQuantity`, `iterationPlaced`, `status` (open/filled/cancelled), `createdAt`.

**`server/src/db/migrate.ts`**
Added `CREATE TABLE IF NOT EXISTS order_book` migration block with an index on `(session_id, status)` for efficient open-order queries.

**`server/src/mechanics/orderBook.ts`** (complete rewrite)
- `OrderBook` class now accepts `sessionId` in its constructor
- `submitOrder()`: inserts a row with `status='open'` into the DB (via `sqlite.transaction()`) before adding to in-memory arrays
- `matchOrders()`: after matching, atomically updates `filledQuantity` and `status` for all touched orders in a single `sqlite.transaction()`
- `removeAgentOrders()`: marks cancelled orders `status='cancelled'` in DB before removing from memory
- `loadFromDB()`: loads all `status='open'` rows for the session and rebuilds the sorted in-memory arrays
- New exports: `restoreOrderBook(sessionId)` — creates/updates registry entry and calls `loadFromDB()`; `isOrderBookWarm(sessionId)` — returns true if an in-memory entry already exists

**`server/src/orchestration/simulationRunner.ts`**
- Imports `restoreOrderBook` and `isOrderBookWarm` from `orderBook.ts`
- During simulation initialisation, calls `restoreOrderBook(sessionId)` when `!isOrderBookWarm(sessionId)` (cold process / server restart path only — avoids clobbering live in-memory state on continuation)

### Task 2 — MET Aggregation + Atomic Snapshots (BUG-06/REL-03, BUG-05/REL-02)

**`applyMETMetabolism` in `simulationRunner.ts`**

Before (only primary action billed):
```
const primaryAction = state.executedActions[0]?.actionCode ?? 'NONE';
const metCategory = getMetCategory(primaryAction, ...);
const metResult = runFullMetabolicTick({ metCategory, ... });
const satietyCost = Math.max(1, Math.round(metResult.satietyCost));
```

After (all actions in the queue are billed):
```
const actionsToMeter = state.executedActions.length > 0 ? state.executedActions : [{ actionCode: 'NONE' }];
let totalSatietyCost = 0;
for (const action of actionsToMeter) {
  const metCategory = getMetCategory(action.actionCode, ...);
  const metResult = runFullMetabolicTick({ metCategory, ... });
  totalSatietyCost += metResult.satietyCost;
}
const satietyCost = Math.max(1, Math.round(totalSatietyCost));
```

Agents performing 3 heavy-labour actions per week now correctly burn ~21.75 food instead of ~7.25 from the primary action only.

**Atomic iteration snapshots in `simulationRunner.ts`**

`iterationsTable` insert and `ammSnapshotsTable` insert are now wrapped in a single `sqlite.transaction()` call. This means either both rows land or neither does, preventing the previous race where a crash after the iteration row but before the AMM row would leave the DB in an inconsistent state.

The old standalone AMM persist block (`economyRepo.saveAMMSnapshot`) was removed; the vacuum call is retained.

## Bugs Fixed

| Bug | Requirement | Description |
|-----|-------------|-------------|
| BUG-02 | REL-01 | Order Book orders lost on server restart — now persisted to SQLite `order_book` table |
| BUG-05 | REL-02 | Iteration + AMM snapshot committed non-atomically — now wrapped in single `sqlite.transaction()` |
| BUG-06 | REL-03 | MET metabolism billed only primary action — now aggregates costs across all `executedActions` |

## Test Results

```
Results: 16 passed, 0 failed
✅ ALL PHYSICS SANDBOX TESTS PASSED — Economy is mathematically sound.
```

Build: `npm run build -w server` — zero TypeScript errors.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Added `isOrderBookWarm()` guard**
- **Found during:** Task 1 — the plan called for calling `restoreOrderBook` unconditionally during init
- **Issue:** Calling `restoreOrderBook` on a warm (already running) session would reload DB rows and overwrite orders placed earlier in the current iteration
- **Fix:** Added `isOrderBookWarm(sessionId)` export; restoration is gated on the registry being cold
- **Files modified:** `server/src/mechanics/orderBook.ts`, `server/src/orchestration/simulationRunner.ts`

**2. [Rule 1 - Bug] Removed stale `metResult.met.metMultiplier` reference**
- **Found during:** Task 2 — after switching from single-action to multi-action billing, `metResult` no longer existed as a variable
- **Fix:** Updated the event log message to report action count instead of a per-action MET multiplier

## Known Stubs

None.

## Self-Check: PASSED

Files verified:
- `server/src/db/schema.ts` — `orderBook` table export present
- `server/src/db/migrate.ts` — `order_book` CREATE TABLE migration present
- `server/src/mechanics/orderBook.ts` — `restoreOrderBook`, `isOrderBookWarm` exports present
- `server/src/orchestration/simulationRunner.ts` — `restoreOrderBook` call in init path, atomic transaction wrapping iterations + AMM inserts

Commits verified:
- `a3e5077` — Task 1 (persistent order book)
- `9aa03f5` — Task 2 (MET aggregation + atomic snapshots)
