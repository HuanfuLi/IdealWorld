# Final Implementation Plan: Physics Fidelity & Emergent Governance

## 1. Objective
Finalise the architectural integrity of the simulation by addressing floating-point drift, synchronising the Sandbox with live UI tweaks, implementing "Emergent Politician Selection," and scaling the Law Enforcement system for high-population sessions.

## 2. Architectural Changes

### Phase A: Floating-Point Precision & SFC-Safety (Issue 1)
**Goal:** Prevent "Sum of Fiat Consistency" (SFC) leaks caused by IEEE-754 rounding errors.
- **Action:** Update the physics engine in `physicsEngine.ts` and `simulationRunner.ts`.
- **Change:**
    - Perform all calculations with high-precision floats.
    - **Final Rounding:** Before a `wealthDelta` or `ubiDelta` is added to an agent's wealth, round it to exactly **4 decimal places** (e.g., `Math.round(v * 10000) / 10000`).
    - **SFC Tolerance:** Update the SFC check in `simulationRunner.ts` to allow a tolerance of ±0.01 per iteration to account for minimal cumulative errors.

### Phase B: Sandbox Configuration Sync (Issue 2)
**Goal:** Ensure the Sandbox child process uses the "Tweaked" constants from the UI Laboratory.
- **Action:** Update `server/src/routes/settings.ts` and `physics_sandbox.ts`.
- **Change:**
    - The `sandbox-json` route will fetch the current **In-Memory** `physicsConfig` from the server process.
    - Pass this config as an Environment Variable (`PHYSICS_CONFIG_JSON`) to the `tsx` child process.
    - The `physics_sandbox.ts` script must check for this environment variable and initialize its constants from it if present.

### Phase C: Emergent Politician Selection (Issue 3)
**Goal:** Replace hardcoded "Dictatorship/Democracy" regex with Central Agent social reasoning.
- **Action:** Update `governanceManager.ts`.
- **Change:** 
    - Instead of regex, ask the Central Agent: *"Based on the current society overview and law, how many agents should have the right to make political decisions? Output an integer (1 to populationCount)."*
    - **Logic:** If the Central Agent says "1", pick the most wealthy/powerful agent. If it says "10", pick a diverse sample. If it says "All", pick everyone.
    - **Result:** The form of government is no longer a database flag; it is an **emergent interpretation** of the written law by the AI.

### Phase D: Scalable Legality Checks (Issue 4)
**Goal:** Prevent context-window overflows in the "Sheriff" system for large societies.
- **Action:** Move the legality check from the global loop into the Map-Reduce `GroupResolution` path in `simulationRunner.ts`.
- **Change:**
    - Each "Group Coordinator" (which handles 10-20 agents) will now also perform the legality check for its specific sub-group.
    - **Result:** The legality check scales horizontally with the population, avoiding the bottleneck of checking 150 agents in a single prompt.

## 3. Implementation Steps for Next Agent
1. **Precision:** Update the wealth delta logic to use 4-decimal rounding and adjust the SFC tolerance in `simulationRunner.ts`.
2. **Sync:** Implement the `PHYSICS_CONFIG_JSON` environment pass-through in the `settings.ts` route and the `physics_sandbox.ts` script.
3. **Emergence:** Update `selectPoliticians` in `governanceManager.ts` to use a Central Agent prompt to determine the "Franchise Size" (number of voters).
4. **Scaling:** Relocate the `buildLegalityCheckPrompt` logic into the `runWithConcurrency` loop for group resolution.

## 4. Success Criteria
- **Fidelity:** The SFC check remains stable (0.00 drift) even after 50 iterations of high-precision float math.
- **Sync:** Tweaking a constant in the Laboratory UI and running the Sandbox instantly shows the results of that tweak.
- **Emergence:** A society with a "Sun King" law correctly results in a 1-person voting committee, while a "Direct Democracy" results in everyone voting.
- **Performance:** A 150-agent simulation resolves legality checks without context overflow or prompt timeouts.
