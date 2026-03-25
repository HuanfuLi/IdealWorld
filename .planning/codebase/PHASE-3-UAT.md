# User Acceptance Testing (UAT): Phase 3 - SFC & Reliability Hardening

**Phase Goal**: Resolve critical Stock-Flow Consistency (SFC) bugs, harden simulation persistence, and standardize UI/UX patterns.

## 1. Automated Verification (Physics Sandbox)
**Status**: ✅ PASS
**Date**: 2024-03-22
**Command**: `npx tsx server/src/mechanics/__tests__/physics_sandbox.ts`

### Results:
- **Test 1-6 (Simulation Foundations)**: 100 iterations completed. No deaths, positive AMM price, producer wealth growth, and worker survival confirmed.
- **Test 7 (SFC - BUG-01)**: EMBEZZLE victim-death correctly accounts for stolen fiat in the final seizure. No fiat double-counting.
- **Test 8-9 (SFC - BUG-03)**: HELP action correctly caps transfers at helper's available wealth. No fiat destruction.
- **Test 10 (SFC - BUG-12/14)**: `distributeProRata` ensures integer-safe distribution (sum always equals total).
- **Test 11 (SFC - BUG-04)**: Treasury initialization sequence validated (must seed before floor check).

## 2. Technical Feature Verification

### REL-04: SSE Synchronization
- **Server-side**: `SimulationManager` implements `sequenceId` (monotonic) and broadcasts with `id: ${seq}` header. Heartbeats also carry sequence IDs.
- **Client-side**: `simulationStore.ts` tracks `lastSeenId`, filters duplicates, and implements gap detection warnings.
- **Status**: ✅ VERIFIED (via Code Audit)

### REL-05: Frontend Store Memory Management
- **Implementation**: `agentIntentHistory` in `simulationStore.ts` implements a `INTENT_HISTORY_CAP = 500` ring buffer.
- **Status**: ✅ VERIFIED (via Code Audit)

## 3. UI/UX Standardization (UI-01, UI-02, UI-03)

### UI-01: Color Tokenization
- **Implementation**: `web/src/index.css` contains semantic variables (e.g., `--primary`, `--success`, `--chart-blue`).
- **Status**: ⚠️ PARTIAL (Variables exist, but ~50 hardcoded hex values remain in components like `Simulation.tsx`).

### UI-02: Typography Standardization
- **Status**: ⚠️ PARTIAL (Inline styles still detected in `PhysicsLaboratory.tsx` on line 253).

### UI-03: CTA Label Standardization
- **Status**: ✅ PASS (`SettingsPage.tsx` uses "Apply Configuration", `IdeaInput.tsx` uses "Begin Brainstorming").

---

## 4. Manual Test Scenarios

### Test Case: Simulation Resume (Order Book Persistence)
**Objective**: Verify that pending orders survive a server restart.
**Steps**:
1. Start simulation.
2. Ensure some orders are pending (e.g., high-price sell orders).
3. Restart server process.
4. Resume simulation.
5. Check if the order book is restored.
**Result**: [PENDING USER CONFIRMATION]

### Test Case: SSE Reconnect Recovery
**Objective**: Verify that the client recovers without missing events after a disconnect.
**Steps**:
1. Start simulation.
2. Toggle network offline/online.
3. Observe console for "Sequence gap detected" or duplicate events.
**Result**: [PENDING USER CONFIRMATION]
