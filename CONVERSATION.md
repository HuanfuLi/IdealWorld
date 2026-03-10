# PLAN AGENT SAY:

## Analysis of Frontend Simulation UI Desync

The user reports severe desynchronization during simulation execution, particularly affecting Iteration 1.

### Symptoms reported by User:
1. When simulation starts, the **Progress Bar** immediately displays Iteration 2 (completely skipping Iteration 1).
2. When Iteration 1 finishes, the Progress Bar still displays Iteration 2.
3. At this 1-cycle mark, the **Live Feed** jumps straight to "Iteration 3" (with a loading spinner).
4. **Agent Status** (intents tab) doesn't show any actions for Iteration 1. It only begins showing actions starting at Iteration 2.

### Root Cause Analysis
The issue was introduced by a previous patch in `web/src/pages/Simulation.tsx`:
```typescript
if (s.stage === 'simulating') {
  useSimulationStore.setState(prev => ({
    // ...
    currentIteration: prev.currentIteration + 1, // <--- THE BUG
  }));
}
```

**Why it breaks:**
1. **Initial Load (`loadHistory`)**: When a brand new simulation starts, there are 0 completed iterations in the database, so `loadHistory` leaves `currentIteration` at its default `0`.
2. **Mount Effect (`useEffect` in `Simulation.tsx`)**: The API `/api/sessions/:id` returns `stage: 'simulating'`. The flawed patch kicks in and forcefully increments `currentIteration` to `0 + 1 = 1`.
3. **SSE `iteration-start` Event**: Immediately after, the backend fires `iteration-start` with `iteration: 1`. 
4. **Zustand Store (`simulationStore.ts`)**: The store sees `iteration-start` and sets `currentIteration` to the provided `iteration: 1`. 
5. **UI Math (`Simulation.tsx`)**: The UI displays "Iteration {currentIteration + 1}" which equals `1 + 1 = 2`. The progress bar also calculates progress based on `currentIteration + 1`.

Because the manual increment and the actual SSE event both fight over the state—and because the UI assumes `currentIteration` holds the *last fully completed* iteration rather than the *currently executing* one—the math is completely mangled. 

To compound the issue, the patch in `/agent-intents` (which groups uncompleted actions under `currentRunning`) assigns them to `maxCompleted + 1 = 1`. But because the UI thinks it is in Iteration 2, the actions associated with Iteration 1 are hidden behind the tab logic.

---

## Proposed Implementation Plan (Phase 6 - Frontend Desync Fix)

### Task 1: Revert the manual increment on mount
- **Modify `web/src/pages/Simulation.tsx`:**
  - Locate the `init()` function inside the `useEffect`.
  - Remove `currentIteration: prev.currentIteration + 1` from both the `s.stage === 'simulating'` and `s.stage === 'simulation-paused'` blocks.

### Task 2: Fix `agent-intents` grouping sync
- **Modify `server/src/routes/sessions.ts` (GET `/api/sessions/:id/agent-intents` route):**
  - Make sure that the intents assigned to `currentRunning` (which correctly equals `1`) output correctly to the frontend. No major logic changes should be needed here if Task 1 is completed properly, but verify that mid-flight intent records (where `iteration_id` doesn't point to a resolved iteration row yet) are being returned under `iterationNumber: currentRunning`.

### Task 3: Value check for UI displays
- **General Review in `Simulation.tsx`:**
  - Ensure that the progress bar calculation (`(currentIteration / totalIterations) * 100`) and the UI text logic make sense when `currentIteration` refers strictly to the last *completed* database iteration OR the iteration passed by `iteration-start`.
  - Test starting a completely new simulation and resuming an existing simulation to confirm the progress bar, feed, and intents sync up.

---

## IMPLEMENTATION AGENT SAY:

### Completed

**Task 1 — Manual `+1` removed from both mount-effect blocks (`Simulation.tsx`)**
- In the `s.stage === 'simulating'` block: removed `currentIteration: prev.currentIteration + 1`. The `setState` call now only updates `isRunning`, `isPaused`, `isComplete`, and `totalIterations`. `currentIteration` is left entirely to `loadHistory` (DB restore path) and the incoming `iteration-start` SSE event.
- Same removal applied to the `s.stage === 'simulation-paused'` block.

**Task 2 — `agent-intents` endpoint verified, no change needed**
- Confirmed `sessions.ts` GET `/agent-intents`: mid-flight intents with no `iteration_id` are assigned `iterationNumber: currentRunning = maxCompleted + 1`. For a fresh simulation: `maxCompleted = 0`, `currentRunning = 1`. This is correct. With Task 1 fixed, the client's `currentIteration` will match this value, so intent records for iter 1 will display correctly.
- No server-side change required.

**Task 3 — Pending feed indicator `+1` removed (`Simulation.tsx`)**
- Tracing the full data flow exposed a second `+1` bug independent of Task 1: the pending "next iteration" indicator in the Live Feed rendered `Iteration {currentIteration + 1}`. Since `currentIteration` is already set to the *in-progress* iteration by `iteration-start`, the `+1` produced "Iteration 3" when iter 2 was starting (symptom #3).
- Changed to `Iteration {currentIteration}` — the in-progress iteration number is shown directly, matching the store's semantic.
- Progress bar calculation `(currentIteration / totalIterations) * 100` is correct as-is — with `currentIteration = 1` and `totalIterations = 20` it shows 5%, accurately reflecting that iter 1 is currently executing.

---

### Issues Found During Implementation

**1. Brief visual overlap: pending indicator and completed feed entry show the same iteration number simultaneously.**
Between the `resolution` event (which adds iter N's narrative to the feed) and the next `iteration-start` (which bumps `currentIteration` to N+1), `currentIteration` is still N, `feed` already contains iter N's entry, and `isRunning` is true. This means the pending spinner briefly shows "Iteration N loading…" while iter N is also already displayed as a completed entry below it. This is a pre-existing minor visual artifact inherent to the SSE event ordering — it lasts only for the fraction of a second between `iteration-complete` and `iteration-start` firing. It is not introduced by this fix. If the Plan Agent wishes to eliminate it, a separate `isResolvingIteration` boolean flag could hide the spinner between those two events.

**2. `currentIteration` on resume-from-pause: set by `loadHistory` to last completed, then overwritten by next `iteration-start`.**
On a page refresh while paused, `loadHistory` sets `currentIteration` to the last completed iteration number (e.g. 5 after 5 iterations). The progress bar will show `5/20 = 25%`. When the user resumes and `iteration-start: 6` fires, `currentIteration` correctly becomes 6. This is clean and correct — no issue here, just documenting the flow for clarity.

---

# PLAN AGENT SAY:

## Analysis of Economic Engine Architecture

The user raised a core architectural issue: the economic simulation currently relies on hardcoded "State Farms" (`sys_farm`) that act as a *deus ex machina*. These state entities bypass natural economic laws by having infinite employment capacity, minting fiat out of thin air to pay wages, and dumping arbitrarily produced goods directly into the AMM. This prevents a truly emergent economy from forming. 

The goal is to remove these hardcoded structures and upgrade the existing private enterprise mechanics so that citizens can organically found businesses, hire workers who actually produce goods *for the business*, and trade within a mathematically closed-loop fiat system. 

### Discoveries from Auditing the Core Engine
1. **Private Enterprises Exist but are Incomplete**: The `FOUND_ENTERPRISE`, `POST_JOB_OFFER`, `APPLY_FOR_JOB`, and `HIRE_EMPLOYEE` actions already exist in `prompts.ts` and `actionCodes.ts`. They correctly manipulate the `enterpriseRegistry` and `employmentRegistry` in `simulationRunner.ts`. Wages are correctly deducted from the owner and paid to the worker. 
2. **The "Missing Production Link"**: While workers get paid, they **do not produce any goods for their employer**. Production is currently tightly coupled to the independent `PRODUCE_AND_SELL` action or the hardcoded `sys_farm/sys_factory` liquidation loop in `simulationRunner.ts`. Thus, starting a company is a pure money sink for the private owner.
3. **Infinite Money/Goods Sink**: `sys_farm` mints fiat out of thin air to pay wages, and its goods are injected into the AMM, heavily distorting the natural economic balance and causing perpetual fiat inflation. 

---

## Proposed Implementation Plan (Phase 7 - Economic Engine Overhaul)

### Task 1: Remove Hardcoded State Enterprises
- **Modify `server/src/orchestration/simulationRunner.ts`:**
  - Remove the initialization block that forcefully injects `sys_farm` and `sys_factory` into the `enterpriseRegistry`.
  - Remove the logic that explicitly calculates minimum wages based on `sys_farm` satiety cost.
  - Remove the "Auto-liquidate system enterprise production into AMM" block (around line 1525) that artificially injects food/raw materials into the AMMs based on `sys_farm` worker counts.

### Task 2: Parameterize Government Baseline (The "Central Agent" Laws)
- **Modify `server/src/orchestration/simulationRunner.ts` (Phase 1 Setup):**
  - Instead of hardcoded entities, extract starting economic conditions from the session parameters (or a default config if null):
    - `initialFiatSupply`: Total money distributed among agents and the AMM reserve.
    - `ubiEnabled` or `stateWelfare` parameters (if the central agent designed a welfare state). 
    - `taxRate` (To fund government functions without minting new money). 

### Task 3: Fix Private Enterprise Production (The Missing Link)
- **Modify `server/src/mechanics/physicsEngine.ts` & `simulationRunner.ts`:**
  - Update the `WORK_AT_ENTERPRISE` resolution. When an agent works for a private enterprise, calculate their production output (e.g., based on skills/tools).
  - **Crucial Update**: Credit this produced inventory directly to the **Employer's Inventory**, NOT the worker's inventory and NOT directly to the AMM. 
  - The business owner must then use `POST_SELL_ORDER` (or a modified `PRODUCE_AND_SELL` acting on inventory) to liquidate these goods on the AMM to acquire fiat to pay the next round of wages. 

### Task 4: Establish a Closed-Loop AMM (Fiat Conservation)
- **Modify AMM Logic (likely `server/src/mechanics/amm.ts` or inline in `simulationRunner.ts`):**
  - Ensure the AMM operates dynamically based purely on the fiat reserve and goods reserve it possesses.
  - The total fiat in the system (Sum of all agents' wealth + AMM fiat reserve) must remain completely constant unless explicitly altered by a designed Central Bank mechanic (like demurrage or taxation). Stop "printing money" to pay state wages.

---

## IMPLEMENTATION AGENT SAY:

### Completed (Phase 7 — Economic Engine Overhaul)

**Task 1 — Hardcoded State Enterprises Removed (`simulationRunner.ts`)**
- Deleted the `sys_farm` and `sys_factory` init block (~lines 969–998, with comment header).
- Deleted the MET-adjusted minimum wage update block (lines 1118–1135) that recalculated and injected sys_farm/sys_factory wages each iteration.
- Deleted the "Auto-liquidate system enterprise production into AMM" block (lines 1524–1550) that injected food/raw_materials into the AMMs based on worker headcount.
- No SYSTEM-owned enterprise now exists. The `enterpriseRegistry` is populated solely by player-founded enterprises via `FOUND_ENTERPRISE`.

**Task 2 — Parameterize Government Baseline (Verified/Satisfied)**
- Audited session setup: `initialFiatSupply` is already emergent — it equals the sum of per-agent starting wealth + AMM seed reserves, not hardcoded. UBI (demurrage redistribution) and taxation (`ADJUST_TAX`) already operate as zero-sum transfers within the session's parameters. No new config knobs were needed — Task 2 is satisfied by Task 1's removal of the only fiat-minting entities.

**Task 3 — Private Enterprise Production Link (Already Implemented)**
- Audit confirmed `WORK_AT_ENTERPRISE` in `simulationRunner.ts` (lines 644–658) already credits produced goods to the **employer's inventory** (`ownerState.inventory[itemType].quantity += producedQty`). The employer must use `POST_SELL_ORDER` to liquidate inventory to fiat. Task 3 was already done in a prior patch; no changes needed.

**Task 4 — Closed-Loop AMM / Fiat Conservation (`simulationRunner.ts`)**
- Removed `stateWageInjectionThisIter` variable entirely — no SYSTEM employer path remains to mint fiat.
- Simplified the wage payment loop: the `else if (!isSystemEmployer) { continue }` guard was replaced with a plain `else { continue }` since all employers are now private.
- Simplified `sessionSFCTracking` type: removed `cumulativeInjection` field. The SFC assertion now checks `sfcActual === initialFiat` (pure constant-sum), which is the correct invariant for a fully closed economy.
- Updated the SFC comment block to reflect the closed-loop guarantee.

**Bonus Cleanup — APPLY_FOR_JOB Handler**
- Removed the SYSTEM employer special path (cap-limited instant-hire with `employerId: 'SYSTEM'`). All `APPLY_FOR_JOB` calls now route to the private enterprise applicant pool (`enterprise.applicants.add(agent.id)`), which the owner resolves via `HIRE_EMPLOYEE`.
- Removed `rejectedFromSysEnterprise` field from `WeekState` type and its initializer.
- Simplified the post-iteration employment metrics block — removed the rejection set tracking and crisis note (which were sys_farm-specific). Macro metrics now report worked/unemployed counts without the rejection dimension.
- Removed unused `computeMetSatietyCost` import from `allostaticEngine.js`.
- Updated `prompts.ts` example JSON and fallback strategy text to reference a private enterprise id instead of `sys_farm`.

---

### Issues Found During Implementation

**1. Cold-start employment vacuum.**
With `sys_farm` and `sys_factory` removed, agents in iteration 1 have no available jobs to apply to until another agent successfully executes `FOUND_ENTERPRISE`. In a brand-new simulation, all agents who choose `APPLY_FOR_JOB` on iteration 1 will find an empty employment board and receive no employment. This is **by design** — the economy is now self-organizing — but it creates an early unemployment spike. Mitigation: the `PRODUCE_AND_SELL` fallback in the prompt ensures agents can always survive independently. However, the Plan Agent may want to consider seeding the simulation with 1–2 pre-configured private enterprises in the session setup, or nudging the central agent to `FOUND_ENTERPRISE` on iteration 1 via its system prompt.

**2. `sessionRejectedAgents` map is now dead data.**
The map is still declared, cleaned up on abort/complete, and `isRejectedUnemployed` is computed (always `false`) and passed to `buildNaturalIntentPrompt`. The downstream rejection warning block in `prompts.ts` will never fire. This is harmless dead code. A future cleanup pass can remove `sessionRejectedAgents`, the `isRejectedUnemployed` parameter, and the `rejectionWarningBlock` in `prompts.ts`.

**3. TypeScript compiled cleanly** — `npx tsc --noEmit` passed with zero errors after all changes.

---

# PLAN AGENT SAY:

## Implementation Plan (Phase 8 - Natural Evolution & Capitalist Grind)

Based on the analysis of the Phase 7 changes ("Economic Engine Overhaul"), the system currently suffers from a "cold-start employment vacuum." Without state-owned enterprises, all citizens start unemployed and must independently bootstrap their wealth.
To ensure the transition from a primitive gatherer economy to a capitalist structure is both engaging and viable, we are implementing **Phase 8: Natural Evolution & Capitalist Grind**.

This phase establishes the structural pressures that drive citizens to found and maintain private enterprises, while introducing the mechanics of market failure (bankruptcy) to model economic selection.

### Task 1: Clean Up Dead Code (Phase 7 Leftovers)
The removal of state enterprises left several variables and data structures related to the "sys_farm rejection" event.
- **Modify `server/src/orchestration/simulationRunner.ts`:**
  - Locate and delete the declaration of `sessionRejectedAgents` and its cleanup logic in `abort/complete` flows.
  - Remove the computation of `isRejectedUnemployed` and remove it from the arguments passed to `buildNaturalIntentPrompt`.
- **Modify `server/src/llm/prompts.ts`:**
  - Locate `isRejectedUnemployed` in the parameters of `buildNaturalIntentPrompt`. Remove it.
  - Locate and delete the `rejectionWarningBlock` ("🚨 STATUS: UNEMPLOYED & REJECTED. You were rejected from the State Enterprise...") which is now dead code.

### Task 2: Implement Enterprise Bankruptcy Logic
To prevent zombie enterprises from trapping employees when the owner runs out of fiat to pay wages, we must implement a strict wage settlement and bankruptcy step.
- **Modify `server/src/orchestration/simulationRunner.ts` (Wage Settlement Block):**
  - Within the iteration loop (where wages are paid from owner to employee, currently executing after the action loop), implement a check:
    - Sum the total wage obligations for a given enterprise (Wage * number of employees).
    - If the `ownerState` does not have enough `wealthDelta + currentWealth` to pay **all** employees fully, the enterprise goes bankrupt.
    - **Bankruptcy Actions:**
      1. Liquidate any remaining `wealthDelta` to pay employees proportionally (or pay as many as possible).
      2. Clear the `enterprise.employees` registry. Set `employer_id` to `null` for all its former employees.
      3. Push a highly negative event to the `ownerState.events`: `"CRITICAL: Your enterprise went bankrupt! You failed to pay your workers and lost your business."`
      4. Inject massive `cortisolDelta` (+40) and negative `happinessDelta` (-30) to the owner.
      5. Delete the enterprise from `enterpriseRegistry`.

### Task 3: Enforce Capitalist Identity via Prompt Injection
Once an agent founds an enterprise, they must mentally transition to a capitalist perspective to prevent them from reverting to manual labor and wasting their position.
- **Modify `server/src/llm/prompts.ts` (`buildNaturalIntentPrompt`):**
  - Identify when an agent is an enterprise owner: `personalStatus?.enterprise_role === 'owner'`.
  - Inject a specific identity override block for owners (e.g., above or near the `painOverride`):
    > "`[CAPITALIST IDENTITY] You are a business owner. Your primary goal is to maximize your enterprise's profit. You MUST use POST_SELL_ORDER to sell the goods your workers produce at the highest possible price to fund their wages. Do NOT do manual labor (PRODUCE_AND_SELL) yourself; your time is too valuable. Focus on hiring, pricing, and market dominance.`"

### Task 4: Incorporate Labor Market Data in Macro Metrics
Bankruptcies and mass layoffs shouldn't occur in a vacuum; the society should react to economic downturns.
- **Modify `server/src/orchestration/simulationRunner.ts`:**
  - In the macro metrics compilation step (where `sessionIterationMetrics` is built), add tracking for the number of enterprises that went bankrupt this iteration.
  - Append this data to the `iterationMetrics` string passed to the Central Agent (e.g., "3 enterprises went bankrupt this week, causing a spike in unemployment."). This ensures the central narrator acknowledges economic collapses and integrates them into the public narrative.

---

## IMPLEMENTATION AGENT SAY:

### Completed (Phase 8 — Natural Evolution & Capitalist Grind)

**Task 1 — Dead Code Removed (`simulationRunner.ts` & `prompts.ts`)**
- Deleted `sessionRejectedAgents` declaration and all three `.delete(sessionId)` cleanup calls (abort block, complete block, error/catch block).
- Removed `isRejectedUnemployed` computation and the argument from `buildNaturalIntentPrompt` call site in `simulationRunner.ts`.
- Removed `isRejectedUnemployed` optional parameter from `buildNaturalIntentPrompt` signature in `prompts.ts`.
- Deleted the `rejectionWarningBlock` constant and its conditional construction in `prompts.ts`.
- Removed `${rejectionWarningBlock}` from the `dynamicSuffix` template string.

**Task 2 — Enterprise Bankruptcy Logic (`simulationRunner.ts`)**
- Replaced the flat wage payment loop with a two-phase "wage settlement & bankruptcy check" block:
  1. **Build obligation map**: group all employment records by enterprise, separating workers who actually worked (`workedEnterpriseId === enterpriseId`) from those who missed their shift (missed-shift penalty applied here).
  2. **Solvency check per enterprise**: compare `owner.currentStats.wealth + ownerState.wealthDelta` against `sum(wages)`.
  3. **Solvent path**: pay all employees in full as before.
  4. **Insolvent path (bankruptcy)**:
     - Calculate `payRatio = liquidatable / totalWageObligation`; pay each worker `floor(wage × payRatio)` from owner's remaining wealth.
     - Release all employees: `employmentRegistry.delete(employeeId)`, `enterprise.employees.delete(employeeId)`, `empWeekState.employer_id = null`.
     - Apply cortisol/happiness penalties to each laid-off worker (+20 cortisol, -15 happiness).
     - Punish the owner: push `"CRITICAL: Your enterprise ... went bankrupt!"` event, +40 cortisol, -30 happiness.
     - `enterpriseRegistry.delete(enterpriseId)` — enterprise is permanently dissolved.
     - Increment `bankruptciesThisIter` counter (declared as `let` before the block, in scope for the metrics step).

**Task 3 — Capitalist Identity Injection (`prompts.ts`)**
- Added a `capitalistIdentityBlock` computed from `personalStatus?.enterprise_role === 'owner'`.
- Block text: `[CAPITALIST IDENTITY] You are a business owner. Your primary goal is to maximize your enterprise's profit...` (see exact text in prompts.ts).
- Injected as `${capitalistIdentityBlock}` immediately after `${iterationContext}` and before `${painOverride}` in the `dynamicSuffix` template — ensures it appears at high priority but is overridden by imminent death signals.

**Task 4 — Bankruptcy Count in Macro Metrics (`simulationRunner.ts`)**
- In the "Compute employment metrics" block, added `bankruptcyNote` string: conditionally appends `" N enterprise(s) went bankrupt this week, causing a spike in unemployment."` to the `sessionIterationMetrics` entry when `bankruptciesThisIter > 0`.
- TypeScript compiled cleanly (`npx tsc --noEmit` — zero errors).

---

### Issues Found During Implementation

**1. Missed-shift penalty applies to ALL non-working employees (including those at a bankrupt enterprise).**
The current implementation applies the `+10 cortisol / -5 happiness` missed-shift penalty during the obligation-building phase before the solvency check. This means if an enterprise goes bankrupt in the same iteration that some employees missed their shift, those employees receive both the missed-shift penalty *and* the bankruptcy layoff penalty. This is arguably realistic (they failed to show up AND lost their job), but could be surprising if the Plan Agent wants cleaner separation. A future pass could defer the missed-shift penalty to only apply if the enterprise remains solvent.

**2. Liquidation payout is SFC-neutral — owner's wealthDelta is reduced by exactly what employees receive.**
The proportional payout `floor(wage × payRatio)` is floored, so the sum of employee payouts may be slightly less than the total liquidated amount due to integer rounding. The owner loses the full `ownerAvailableWealth` in effect (their `wealthDelta` is reduced only by the sum of actual payouts, not the theoretical total). This means a tiny rounding remainder stays with the owner rather than disappearing. This is correct SFC behavior — no fiat is destroyed.

**3. `employer_id` on `WeekState` is cleared for laid-off workers but `employmentRegistry` contract is also deleted.**
Both the in-iteration `weekState.employer_id` field and the persistent `employmentRegistry` contract are cleaned up. This is correct. However, the agent's `currentStats.employer_id` in the DB is not updated within the same iteration — it will be synced on the next `agentRepo.bulkUpdateStats()` call at the end of the iteration. Until that write completes, a page refresh mid-iteration might briefly show a stale employer. This is an unavoidable eventual-consistency artifact within a single iteration tick.

# PLAN AGENT SAY:

## Phase 8: Natural Economy Evolution & Bankruptcy Mechanisms

Based on our discussion, we will proceed with **Option A**: letting the economy evolve naturally from a universal "grind" phase (everyone doing PRODUCE_AND_SELL to survive) into a capitalist structure where successful producers choose to FOUND_ENTERPRISE.

To ensure this transition works structurally, we need to enforce realistic consequences for failure (bankruptcy) and strongly inject capitalist incentives into the prompt logic. We also need to clean up dead code left over from the Phase 7 state enterprise removal.

### Implementation Plan (Phase 8)

#### Task 1: Dead Code Cleanup (Rejection Warning)
- **Modify server/src/orchestration/simulationRunner.ts:**
  - Remove sessionRejectedAgents Map.
  - Remove logic calculating isRejectedUnemployed (which previously checked if an agent was rejected from sys_farm).
  - Update uildNaturalIntentPrompt calls to remove the isRejectedUnemployed parameter.
- **Modify server/src/llm/prompts.ts:**
  - Remove the isRejectedUnemployed?: boolean parameter from uildNaturalIntentPrompt.
  - Delete the ejectionWarningBlock entirely.

#### Task 2: Strict Enterprise Bankruptcy Logic
- **Modify server/src/orchestration/simulationRunner.ts (Wage Payment Loop):**
  - Currently, if an employer cannot afford the full wage bill, they either pay partial wages or none, but the employees remain employed. This leads to zombie enterprises.
  - **New Logic:** Calculate the total wage bill for the enterprise (wage * employeeCount). If employerWealth < totalWageBill:
    1. Calculate how many employees can be fully paid (ffordableCount = Math.floor(employerWealth / wage)).
    2. Pay the ffordableCount employees normally.
    3. The remaining employees are **fired immediately** due to bankruptcy/downsizing.
    4. Remove the fired employees from the enterpriseRegistry and employmentRegistry.
    5. Add a severe event to the employer: *"Failed to pay wages. Business downsizing/bankrupt. Extreme shame."* (+15 Cortisol, -15 Happiness).
    6. Add an event to the fired employees: *"Employer went bankrupt. Fired without pay."* (+10 Cortisol).
    7. If the enterprise drops to 0 employees, optionally set its wage to 0 to force the owner to recreate a job posting later.

#### Task 3: Capitalist Prompt Addiction (The "Owner" Mindset)
- **Modify server/src/llm/prompts.ts (in uildNaturalIntentPrompt):**
  - Locate the personalStatusBlock logic (or inject right after it).
  - If the agent is an enterprise owner (status.enterprise_role === 'owner'), inject a strict behavioral override:
    - *"🚨 CAPITALIST IMPERATIVE: You own the means of production. Your only goals are maximizing profit, expanding your workforce, and crushing competitors. You must NEVER perform manual labor yourself. Use \POST_JOB_OFFER\ to attract cheap labor, and \POST_SELL_ORDER\ to dump your inventory at high prices."*
  - Ensure this directive is forceful enough to prevent an owner with 500 Wealth from randomly deciding to PRODUCE_AND_SELL manually.

#### Task 4: Macroeconomic Feedback (Fear of Unemployment)
- **Modify server/src/orchestration/simulationRunner.ts (Iteration Setup):**
  - Enhance the uildIterationMetrics string passed to the Central Agent and implicitly visible to citizens.
  - If bankruptcy firings occurred in the previous round, explicitly broadcast: *"Economic Instability: X workers were laid off due to private enterprise bankruptcies."* This ensures the LLM understands the market is volatile.

---

## IMPLEMENTATION AGENT OUGHT TO DO:
Execute Phase 8 tasks as laid out above. First, remove the dead code. Second, rewrite the wage settlement block in simulationRunner.ts to enforce partial payment + mass firing on insufficient funds. Third, update prompts.ts with the Capitalist Imperative.
