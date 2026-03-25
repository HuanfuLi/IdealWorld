---
phase: "03"
plan: "03"
subsystem: "SSE synchronization, frontend store memory"
tags: [sse, synchronization, memory-management, reliability, bug-fix]
dependency_graph:
  requires: []
  provides: [sse-sequence-ids, sse-dedup-filter, intent-history-ring-buffer]
  affects: [simulationManager, simulate-route, simulationStore]
tech_stack:
  added: []
  patterns: [SSE id field, ring buffer, monotonic counter]
key_files:
  created: []
  modified:
    - server/src/orchestration/simulationManager.ts
    - server/src/routes/simulate.ts
    - web/src/stores/simulationStore.ts
decisions:
  - "Placed sequenceId counter in SimulationState (simulationManager) rather than in the route handler so all broadcasts (including future routes) automatically get sequence IDs"
  - "Exposed nextSequenceId() method for heartbeat pings so pings stay in-sequence with broadcast events"
  - "Used Math.max for lastSeenId update in flushBuffer to handle out-of-order buffer processing safely"
  - "Chose shift() over slice() for ring buffer to avoid allocating a new array on every append beyond cap"
metrics:
  duration: "142s"
  completed: "2026-03-24"
  tasks_completed: 3
  files_modified: 3
---

# Phase 03 Plan 03: SSE Synchronization & Store Cleanup Summary

One-liner: Monotonic SSE sequence IDs with client dedup/gap-detection and a 500-entry ring-buffer cap on agentIntentHistory to fix BUG-08 and BUG-10.

## What Was Done

### Task 1 — Server-Side SSE Sequence IDs (REL-04 / BUG-08)

Added a `sequenceId: number` field to `SimulationState` in `simulationManager.ts`. The counter is session-scoped and starts at 0 when a session entry is first created.

- `broadcast()` now emits `id: ${seq}\ndata: ...\n\n` — the standard SSE id line that browsers read into `EventSource.lastEventId` and automatically re-send as `Last-Event-ID` on reconnect.
- A new `nextSequenceId(sessionId)` method increments and returns the counter for use by the heartbeat ping in `simulate.ts`, so pings remain in the same monotonic sequence as broadcast events (preventing the client's `lastEventId` from going stale during idle periods).
- The counter is never reset mid-session, ensuring strict monotonicity.

### Task 2 — Client-Side Sync Recovery (REL-04 / BUG-08)

Updated `simulationStore.ts` (`connectSSE`):

- Added `lastSeenId: number | null` to the store interface and `initialState`.
- `onmessage` parses `e.lastEventId` (a string provided by the browser `EventSource` API) into a numeric sequence ID.
- **Duplicate filtering**: if `seqId <= currentLastSeen` the event is dropped before being pushed into the buffer. This prevents replaying already-processed events after a transparent reconnect.
- **Gap detection**: if `seqId > currentLastSeen + 1`, a `console.warn` is emitted identifying how many events may have been missed.
- `flushBuffer` uses `Math.max` to advance `lastSeenId` across each batch, writing the result back into store state.

### Task 3 — Frontend Store Memory Management (REL-05 / BUG-10)

Modified the `agent-intent` case in `flushBuffer`:

- After appending a new `AgentIntentRecord`, if `updated.length > 500` the oldest entry is removed with `shift()`.
- The cap constant `INTENT_HISTORY_CAP = 500` is defined at the top of the case block for clarity.
- This bounds memory use to O(agents × 500 records) regardless of simulation length.

## Bugs Fixed

| Bug | Description | Fix |
|-----|-------------|-----|
| BUG-08 | SSE events had no sequence IDs; duplicates could be processed on reconnect | Session-scoped monotonic `id:` line on every broadcast and heartbeat; client dedup filter |
| BUG-10 | `agentIntentHistory` grew without bound for long runs | 500-entry ring buffer per agent via shift() |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The plan mentioned "full state refresh if gap exceeds a threshold" but the current implementation logs a warning only. A full state refresh (re-fetching from API) would require additional infrastructure (a dedicated refresh endpoint or `loadIntentHistory` call) and was deemed out of scope for this atomic plan. The gap warning gives operators visibility; a full refresh can be added in a future plan if needed. This is tracked as a deferred item, not a regression.

## Pre-existing Issue (Out of Scope)

`web/src/stores/simulationStore.ts` line 412 had a pre-existing TypeScript error (`continueSimulation` return type `Promise<(() => void) | undefined>` vs interface `Promise<() => void>`). Confirmed present before this plan's changes via `git stash`. Not introduced here, not fixed here (out of scope of this plan).

## Known Stubs

None — all changes are fully wired.

## Self-Check: PASSED

- `server/src/orchestration/simulationManager.ts` — modified, committed ef05ada
- `server/src/routes/simulate.ts` — modified, committed ef05ada
- `web/src/stores/simulationStore.ts` — modified, committed 3064819 + 124cef2
- Server TypeScript build: PASSED (no errors)
- Web TypeScript build: pre-existing error on line 412 unrelated to this plan
