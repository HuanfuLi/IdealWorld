# Simulation Audit & Resolution Plan (Refined)

Following a deep audit of the **Eudaimonia Collective** simulation results and the underlying codebase, I have identified several critical bugs and logical misalignments that are hindering simulation accuracy.

## 🚨 Root Cause Analysis

### 1. The "Eternal Stats" / "Dead Man Walking" Bug (Code Confirmed)
*   **Root Cause**: In `simulationRunner.ts`, the `agents` array is fetched once at the start. While the database is updated via `bulkUpdateStats` and `bulkMarkDead`, the local `agents` array is never synced. 
*   **Result**: `computeStats(agents)` uses Iteration 0 data for all 25 iterations, causing flat charts and narrating dead agents as still alive.

### 2. Narrative-Market Disconnect (Prompt Confirmed)
*   **Root Cause**: The AMM reserve levels ($y$) and spot prices are **not** passed to the LLM in `buildGroupResolutionMessages` or `buildResolutionPrompt`.
*   **Result**: The LLM narrates "famine" and "empty shelves" based on declining health stats, even when the market is overflowing with cheap food (0.44 wealth).

### 3. Hedonic Collapse (Physics Confirmed)
*   **Root Cause**: `dopamineDecay` (-3) is applied **per action** in the multi-action queue.
*   **Result**: Agents with 3 actions lose **9 dopamine points per week**. This outpaces almost all dopamine-positive actions, leading to a society-wide depression (Dopamine ≈ 0) that triggers a "REST/SLEEP" loop.

### 4. Punitive Metabolic Rounding
*   **Root Cause**: `applyMETMetabolism` uses `Math.ceil(metResult.satietyCost)`.
*   **Result**: Significant "phantom food" waste, accelerating starvation even when food is abundant.

---

## 🛠️ Resolution Plan

### Phase 1: Data Integrity & Stat Sync
1.  **Stat Sync (Priority)**: Immediately after `agentRepo.bulkUpdateStats(statUpdates)` and `agentRepo.bulkMarkDead(deaths)`, the local `agents` array in `simulationRunner.ts` MUST be updated in-memory to reflect these changes.
2.  **Floating-Point Food**: Replace `Math.ceil(metResult.satietyCost)` with `r4(metResult.satietyCost)` in `simulationRunner.ts` to allow fractional food consumption.

### Phase 2: Narrative & Physics Alignment
1.  **Market Awareness**: Update `buildGroupResolutionMessages` and `buildResolutionPrompt` in `prompts.ts` to include the current AMM Food Reserves and Spot Price.
2.  **Dopamine Decay Fix**: Move the `dopamineDecay` calculation out of the per-action loop in `physicsEngine.ts` (or reduce its magnitude) to ensure it is a per-week penalty, not per-action.

### Phase 3: Enterprise & SFC Hardening
1.  **Ghost Enterprise Cleanup**: (Already planned) Ensure enterprises with dead owners are dissolved at the start of each iteration.
2.  **SFC Drift Alerting**: (Already planned) Log warnings for fiat drift even when agents are alive.

---
**Next Step for Coding Agent**: Implement **Phase 1 (Stat Sync & Floating-Point Food)** and **Phase 2 (Market Awareness & Dopamine Fix)**.
