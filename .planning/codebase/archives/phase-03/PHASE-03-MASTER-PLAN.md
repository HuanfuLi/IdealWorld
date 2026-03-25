# Phase 3 Plan: SFC & Reliability Hardening

## Phase Goal
Resolve all identified critical and high-severity Stock-Flow Consistency (SFC) bugs, harden simulation persistence, and standardize UI/UX patterns to ensure a reliable and maintainable simulation core.

## Requirements

### Functional Requirements
- **SFC-01:** Correct EMBEZZLE logic to account for victim death wealth deltas (BUG-01).
- **SFC-02:** Prevent fiat destruction in HELP action for zero-wealth agents (BUG-03).
- **SFC-03:** Seed treasury before genesis wealth floor calculations (BUG-04).
- **REL-01:** Persistent Order Book storage using SQLite/Drizzle (BUG-02).
- **REL-03:** Multi-action metabolic billing (MET aggregation) (BUG-06).
- **REL-04:** SSE monotonic sequence numbering for client-server synchronization (BUG-08).

### Non-Functional Requirements
- **REL-02:** Atomic iteration snapshots using DB transactions (BUG-05).
- **SFC-04:** Standardize on integer-safe pro-rata redistribution and rounding (BUG-12/14, Codex).
- **REL-05:** Implement session map cleanup and frontend store memory management (BUG-10, Gemini).
- **REL-06:** Handle floating-point quantities in LLM orders (BUG-11).

### UI Requirements
- **UI-01:** Tokenize ~87 hardcoded hex values into semantic CSS variables (index.css).
- **UI-02:** Standardize typography and remove inline styles in PhysicsLaboratory.tsx.
- **UI-03:** Standardize CTA labels across SettingsPage.tsx and IdeaInput.tsx.

## Implementation Tasks

### 1. SFC & Accounting Core (Wave 1)
1. **EMBEZZLE Death Fix:** Modify `simulationRunner.ts` to ensure victims' negative `wealthDelta` from embezzlement is captured before their final wealth seizure upon death.
2. **HELP Action Safeguard:** Update `simulationRunner.ts` to check helper wealth before subtraction to prevent zero-wealth agents from destroying fiat.
3. **Treasury Order of Ops:** Relocate treasury seeding in `simulationRunner.ts` to precede genesis wealth floor and UBI calculations.
4. **Rounding Standardization:** Audit and update pro-rata logic in `simulationRunner.ts` to use `Math.floor` + remainder distribution instead of floating-point division.

### 2. Simulation Persistence & Reliability (Wave 2)
1. **Persistent Order Book:** Create `order_book` schema in `server/src/db/schema.ts` and modify `orderBook.ts` to load/save open orders from the database.
2. **Atomic Snapshots:** Wrap iteration record and AMM/Treasury snapshot updates in a single `db.transaction()` block in `simulationRunner.ts`.
3. **Multi-MET Billing:** Update `applyMETMetabolism` to aggregate MET costs for all actions in the agent's queue.
4. **Session Cleanup:** Implement cleanup logic for `paused` and `terminated` sessions to clear memory maps (BUG-10).

### 3. SSE & Frontend Reliability (Wave 3)
1. **SSE Sequence IDs:** Update `server/src/routes/simulate.ts` to assign a monotonic `id` to each SSE event.
2. **Sync Recovery:** Update `web/src/stores/simulationStore.ts` to track `lastSeenId` and filter duplicate events.
3. **Buffer Management:** Implement a fixed-size ring buffer for `agentIntentHistory` in the frontend store.

### 4. UI/UX Standardization (Wave 4)
1. **Color Tokenization:** Replace hardcoded hex values in `web/src` with semantic variables (e.g., `--primary`, `--success`) defined in `index.css`.
2. **Typography Refactor:** Replace inline `fontSize` and `lineHeight` in `PhysicsLaboratory.tsx` with Tailwind classes.
3. **Copy Standardization:** Update CTA labels in `SettingsPage.tsx` and `IdeaInput.tsx` to project-specific language (e.g., "Apply Configuration").

## Verification Tasks

### E2E and System Tests
- **SFC Audit Simulation:** Run a 100-iteration simulation and verify `Sum(Wealth) + Treasury + AMM Reserve` remains constant.
- **Persistence Verification:** Pause a simulation, restart the server, resume, and confirm Order Book and Session state are identical to pre-restart.
- **Network Sync Stress:** Simulate SSE disconnects and verify the client recovers state without sequence gaps or duplicates.

### Unit Tests
- **SFC Settlement Test:** `npm test server/src/mechanics/__tests__/physics_sandbox.ts` for EMBEZZLE/HELP/Rounding cases.
- **Metabolism Accumulation Test:** Verify satiety burn for multi-action queues.
- **Drizzle Schema Audit:** Verify `order_book` and snapshot tables match required structure.

## Success Criteria
- [ ] No fiat creation or destruction observed in long-running simulations (1000+ iterations).
- [ ] Order book survives server restarts with all pending orders intact.
- [ ] SSE sequence numbering is active and used for client-side duplicate filtering.
- [ ] 100% of hardcoded hex colors removed from frontend components.
- [ ] Frontend store memory usage remains stable over long sessions (no `agentIntentHistory` growth).
