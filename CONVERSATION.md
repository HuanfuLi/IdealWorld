# Simulation Result Analysis Summary:

Based on an analysis of the latest exported data (`SimulationResult/session-the-liberty-guild--fork---fork-.json`) and the core backend engine logic, I have identified two major issues hindering the simulation. 

While the previous "Zombie Agent" loop was temporarily mitigated by using `"lockedVariables": ["health", "dopamine"]` in the session config, this merely masked the underlying problems and exposed a severe economic bug.

### 1. Cortisol Death Spiral & Mass Action Failure
Because `health` is locked, starving agents never drop below 20 health, which means they are never flagged for the "humiliation" mechanic that would reset their cortisol. Instead, they enter a permanent **Cortisol Death Spiral**:
* **The Cause:** Poor, starving agents (who only have 2-11 fiat) gain `+15` cortisol every turn from starvation (`applyMETMetabolism`) and `+10` cortisol from low wealth (`physicsEngine`). Their cortisol quickly caps at `100`.
* **The Result:** 16 out of 28 agents reached `100` cortisol. Because `physicsConfig.mentalBreakdownCortisolInterrupt` is set to `90`, these agents' actions are forcefully aborted every single turn due to a `mental_breakdown`. 
* **The Impact:** This causes a persistent ~12-18% action failure rate. The poorest agents are permanently incapacitated—they cannot work to earn money, and they cannot buy food to lower their cortisol. They are trapped in a state of permanent breakdown.

### 2. Severe SFC Deflationary Leak (The Arrest Bug)
The simulation suffers from a massive fiat leak that violates the Stock-Flow Consistent (SFC) design. The `totalFiatSupply` (which correctly counts Agent Wealth + AMM Reserves + Treasury) inexplicably dropped from `25,056` (Iteration 16) to `23,257` (Iteration 25). 

This leak is caused by a mathematical error in the Phase Sheriff enforcement logic in `simulationRunner.ts`:
```typescript
const seizureAmount = runningWealth * 0.25;
seizedWealthPool += seizureAmount;
// Replace any wealth gain from the action with the seizure loss
physics.wealthDelta = -seizureAmount - Math.max(0, physics.wealthDelta);
```
* **The Bug:** If an agent successfully performs an action that grants wealth (e.g., gaining `10` fiat from `WORK`), but gets arrested, the formula above calculates `physics.wealthDelta = -25 - 10 = -35`. This subtracts the `10` fiat they *would* have earned directly from their **existing** wealth! 
* **The Leak:** The `seizedWealthPool` only receives the `25` fiat seizure, while the `10` fiat simply evaporates from the economy.
* **The Double Penalty Leak:** For `PRODUCE_AND_SELL` actions, this bug is even worse. The AMM trade is executed *before* the arrest check, meaning the AMM's `fiatReserve` decreases to pay the agent. When the arrest triggers, the agent's expected fiat gain is turned into a penalty. Because the AMM lost the fiat, the agent loses the fiat, and the treasury doesn't receive it, the fiat is destroyed completely, heavily draining liquidity from the world and exacerbating the poverty crisis.

**How to fix this:**
1. **Fix the Seizure Math:** In `simulationRunner.ts`, the arrest logic must be updated so it doesn't penalize `physics.wealthDelta` twice. If an action's wealth gain is seized, that specific fiat gain should either be routed directly to the `seizedWealthPool` or negated properly without subtracting it from the agent's base wealth.
2. **Cortisol Recovery Path:** There needs to be a mechanism for agents to recover from a `mental_breakdown` when health is locked. Either `mental_breakdown` should force an automatic `REST` action that forcefully lowers cortisol, or the starvation/low-wealth penalties must cap cortisol below `90` if the agent is already in breakdown.