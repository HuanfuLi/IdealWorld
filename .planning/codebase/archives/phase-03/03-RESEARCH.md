# Phase 3: SFC & Reliability Fixes - Research

**Researched:** 2024-03-24
**Domain:** Stock-Flow Consistency (SFC), Metabolic Accounting, SSE Reliability
**Confidence:** HIGH

## Summary
Phase 3 focuses on hardening the economic and physiological core of the simulation. Research confirms critical gaps in multi-action metabolic billing (BUG-06), Order Book persistence (BUG-02), and SSE synchronization (BUG-08). Economic leaks (SFC) were identified in the pro-rata logic of class actions like EMBEZZLE when victims have insufficient funds or die during the iteration.

**Primary recommendation:** Implement integer-safe pro-rata redistribution for EMBEZZLE and ADJUST_TAX, move Order Book to SQLite, and introduce monotonic sequence IDs for SSE events.

## User Constraints (from REVIEWS.md)

### Locked Decisions
- **BUG-01: EMBEZZLE Victim-Death**: Death during embezzlement causes fiat destruction. (Severity: Critical)
- **BUG-02: Order Book Persistence**: Order book is not saved to DB; lost on restart. (Severity: Critical)
- **BUG-06: Multi-Action MET**: Only primary action MET is billed. (Severity: High)
- **BUG-08: SSE Sequence**: Lack of IDs causes reconnect desync. (Severity: Medium)
- **Treasury Init**: Genesis wealth floor runs before treasury is seeded. (Severity: High)

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ^0.29.3 | SQLite Persistence | Type-safe schema and migrations |
| Express SSE | — | Real-time updates | Native browser support, low overhead |
| Zustand | ^4.5.0 | Frontend state | Minimal re-renders for high-frequency updates |

## Architecture Patterns

### SSE Sequence Numbering (BUG-08)
To prevent desync, the server must track a monotonic `sequenceId` for every `SimulationEvent`.
1. **Server**: `SimulationManager` maintains a `Map<sessionId, { sequence: number, buffer: Event[] }>` caching the last 100 events.
2. **Client**: `simulationStore` sends `Last-Event-ID` header.
3. **Route**: `GET /stream` checks the header and replays missed events from the buffer.

### Persistent Order Book (BUG-02)
Current `orderBook.ts` is in-memory only.
- **New Table**: `order_book` in `schema.ts` (agent_id, side, item_type, price, quantity, status).
- **Matching**: `orderBook.matchOrders()` must load 'open' orders from the DB and update status to 'filled' or 'cancelled' atomically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pro-rata Rounding | Custom division | `Math.floor` + remainder distribution | Simple division creates micro-leaks (fiat destruction) |
| Event Buffering | Custom memory management | Ring Buffer (Fixed Size) | Prevents memory leaks for long sessions (BUG-10) |

## Common Pitfalls

### Pitfall 1: Float Rounding in SFC
**What goes wrong:** Dividing 100 fiat among 3 agents as `33.33` destroyed 0.01 fiat.
**How to avoid:** Calculate `Math.floor(total * ratio)`, sum the result, and distribute the `remainder` (total - sum) to the first N participants.

### Pitfall 2: Multi-Action Metabolic Billing (BUG-06)
**What goes wrong:** Agents queue `WORK`, `WORK`, `REST`. Current code only bills for the first `WORK`.
**How to avoid:** `applyMETMetabolism` must iterate over `state.executedActions` and sum the MET costs before performing the starvation check.

## Code Examples

### Aggregating MET Metabolism
```typescript
// server/src/orchestration/simulationRunner.ts
function applyMETMetabolism(state: AgentWeekState, ...) {
  let totalSatietyCost = 0;
  for (const action of state.executedActions) {
    const metCategory = getMetCategory(action.actionCode, agent.role, industry);
    const metResult = runFullMetabolicTick({ ..., metCategory });
    totalSatietyCost += metResult.satietyCost;
  }
  const roundedCost = Math.max(1, Math.round(totalSatietyCost));
  // ... proceed with food consumption
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest / Jest |
| Config file | `server/tsconfig.json` |
| Quick run command | `npm test server/src/mechanics/__tests__/physics_sandbox.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| BUG-01 | EMBEZZLE SFC | Integration | `npm test -- -t "SFC settlement"` |
| BUG-06 | Multi-MET | Unit | `npm test -- -t "metabolism"` |

## Sources
- `server/src/orchestration/simulationRunner.ts` (Lines 2021-2048: Embezzle logic)
- `server/src/orchestration/simulationRunner.ts` (Line 414: applyMETMetabolism primary action bug)
- `REVIEWS.md` (Source of BUG-XX IDs)
- `server/src/mechanics/orderBook.ts` (Missing persistence)
