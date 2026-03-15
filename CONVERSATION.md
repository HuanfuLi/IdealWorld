# Enhancement Plan: Long-Run Physics Diagnostics & Sandbox Visualisation

## 1. Objective
Upgrade the "Physics Sandbox" from a raw text output into a visual diagnostic tool. This will allow developers to see 100-iteration "Survival Curves" (Health/Wealth/Happiness) and market price trends, enabling rapid balancing of the global physics constants.

## 2. Architectural Changes

### Phase A: Structured Sandbox Telemetry (`physics_sandbox.ts`)
**Goal:** Extract per-iteration data from the sandbox for charting.
- **Action:** Modify `server/src/mechanics/__tests__/physics_sandbox.ts`.
- **Change:** 
    - Add a `--json` flag to the script.
    - When enabled, suppress standard logs and collect `avgHealth`, `avgWealth`, `avgHappiness`, and `spotPrice` for each iteration.
    - Output the final result as a clean JSON object containing these 100-point time series.
- **Note:** Ensure the sandbox uses the live server-side `physicsConfig` for its calculations.

### Phase B: The "Long-Run" Survival Charts (Frontend)
**Goal:** Visualize the 100-iteration economy to detect "Poverty Traps" or "Price Collapses."
- **Action:** Update `web/src/pages/PhysicsLaboratory.tsx`.
- **Change:**
    - Integrate the `LineChart.tsx` component into the Sandbox section.
    - Plot two main charts:
        1. **Survival Curve:** Avg Health, Avg Wealth, and Avg Happiness over 100 iterations.
        2. **Market Stability:** AMM Spot Price over 100 iterations.
- **Result:** Developers can see the "History of the World" at a glance after a sandbox run.

### Phase C: Tweak-Test-Save-Reset Workflow
**Goal:** Provide a safe playground for balancing without touching the codebase.
- **Action:** Refine UI in `SettingsPage.tsx` and `PhysicsLaboratory.tsx`.
- **Feature: "Tweak"** -> User modifies constants in the Laboratory (e.g., `passiveStarvationHealthPenalty`).
- **Feature: "Test"** -> User clicks "Run Long-Run Sandbox" to see the impact on the Survival Charts.
- **Feature: "Save"** -> User clicks "Apply to World" to persist the best-performing constants to the server.
- **Feature: "Reset"** -> A prominent "Reset to Defaults" button to instantly revert all `physicsConfig` values to factory defaults.

## 3. Implementation Steps for Next Agent
1. **Sandbox JSON:** Update `physics_sandbox.ts` to support the `--json` flag and collect iteration stats.
2. **API Update:** Ensure the `settings.ts` route handles the JSON response from the sandbox child process.
3. **Chart Integration:** Add the two `LineChart` components to the Laboratory UI and wire them to the sandbox response data.
4. **Safety Features:** Implement the "Reset Defaults" UI trigger and verify the sandbox respects live config updates.

## 4. Success Criteria
- **Insight:** A developer can identify a "Starvation Spiral" at iteration 40 via visual charts.
- **Safety:** A "Reset Defaults" action restores the simulation to a known stable state.
- **Speed:** The "Tweak constants -> Run Sandbox -> Check Chart" loop takes less than 15 seconds.
