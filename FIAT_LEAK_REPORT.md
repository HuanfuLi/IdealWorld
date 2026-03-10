# FIAT LEAK AUDIT REPORT: IDEAL WORLD ARCHITECTURE

**Audit Status:** READ-ONLY COMPLETED  
**Objective:** Trace the flow of fiat currency (Wealth and AMM `fiatReserve`) to identify points of destruction or creation.

---

## 🔍 INVESTIGATION POINT 1: The "Auto-Buy / Eat to Full" Metabolism Loop
**Status:** **NO LEAK FOUND (IN AUTO-BUY)** | **LEAK FOUND (IN CALCULATION)**

*   **Finding:** The "Auto-Buy" loop described in the suspicion does not actually exist in the current `applyMETMetabolism` implementation. Agents simply starve if they lack food.
*   **The Actual Leak:** However, in the `POST_BUY_ORDER` resolution (which is where agents buy food), there is a significant rounding leak.
*   **Code Snippet:**
    ```typescript
    // server/src/orchestration/simulationRunner.ts (Line 806)
    const foodReceived = Math.floor('foodOut' in receipt.quote ? receipt.quote.foodOut : 0);
    economyDelta.wealthDelta -= affordableFiat;
    state.inventory.food.quantity += foodReceived;
    ```
*   **Diagnostic:** The engine deducts the **full floating-point `affordableFiat`** from the agent's wealth, but the agent only receives a **floored integer `foodReceived`**. The fractional food (and the fiat that paid for it) vanishes. Since the AMM reserve is updated with the full `fiatAmount`, the fiat is "trapped" in the AMM reserve, but the agent's purchasing power is destroyed without equivalent utility.

---

## 🔍 INVESTIGATION POINT 2: SFC UBI and Demurrage Tax Math
**Status:** **CRITICAL LEAK IDENTIFIED**

*   **Finding:** The UBI redistribution logic is leaking fiat due to inconsistent rounding between collection and distribution.
*   **Code Snippet:**
    ```typescript
    // server/src/mechanics/automatedMarketMaker.ts (Line 427)
    const tax = Math.min(agent.wealth, agent.wealth * DEMURRAGE_TAX_RATE);
    taxPoolCollected += tax;
    
    // server/src/orchestration/simulationRunner.ts (Line 1662)
    let newWealth = clampWealth(agent.currentStats.wealth + weekState.wealthDelta);
    
    // Line 363
    function clampWealth(value: number): number {
      return Math.max(0, Math.round(value));
    }
    ```
*   **Diagnostic:** `computeDemurrageCycle` uses raw floating-point numbers for the `netDeltas`. However, at the end of every iteration, the `SimulationRunner` calls `clampWealth`, which executes `Math.round()`. 
*   **Math Failure:** If the sum of rounded `netDeltas` across 30+ agents does not equal zero (which it won't, due to rounding remainders), fiat is created or destroyed every single week.

---

## 🔍 INVESTIGATION POINT 3: Action Resolution & "Ghost Deductions"
**Status:** **MAJOR LEAK IDENTIFIED**

*   **Finding:** Several actions deduct wealth without a corresponding "sink" or "receiver," and some deduct wealth before failure is fully resolved.
*   **Code Snippet 1 (Founding):**
    ```typescript
    // server/src/orchestration/simulationRunner.ts (Lines 660-664)
    economyDelta.wealthDelta -= FOUNDING_COST;
    state.events.push(`Founded enterprise ${enterpriseId} in ${industry} (spent ${FOUNDING_COST} Wealth)`);
    ```
*   **Diagnostic:** This 40 Wealth is deducted from the agent and... **disappears**. It is not added to the AMM reserve, the State Treasury (which doesn't exist), or redistributed. It is a permanent deletion of fiat from the global economy.
*   **Code Snippet 2 (Taxation):**
    ```typescript
    // server/src/orchestration/simulationRunner.ts (Lines 1452-1460)
    const taxCollected = TAX_PER_AGENT * taxableAgents.length * taxActions.length;
    if (taxerState) taxerState.wealthDelta += taxCollected;
    for (const taxed of taxableAgents) {
       taxedState.wealthDelta -= TAX_PER_AGENT * taxActions.length;
    }
    ```
*   **Diagnostic:** This logic **creates money**. The `taxerState` receives a fixed amount based on the *number* of agents, but there is no check if the `taxed` agents actually have the money to pay. If a taxed agent has 0 Wealth, `taxedState.wealthDelta` becomes negative, but `clampWealth` will later floor them at 0. The Taxer still gets the full amount, essentially minting fiat out of thin air.

---

## 🔍 INVESTIGATION POINT 4: AMM Constant Product Formula Implementation
**Status:** **DRIFT DETECTED | INVARIANT BREACH**

*   **Finding 1 (Precision Drift):** The AMM's `executeBuy` and `executeSell` methods recalculate the entire reserve from $k$ on every trade to "prevent" drift, but this actually *causes* precision loss.
*   **Code Snippet:**
    ```typescript
    // server/src/mechanics/automatedMarketMaker.ts (Line 257)
    this.fiatReserve += fiatAmount;
    this.foodReserve = this.k / this.fiatReserve;
    ```
*   **Diagnostic:** By forcing the `foodReserve` to be the result of a division every time, the engine introduces a small floating-point error in the *other* reserve.
*   **Finding 2 (SFC Breach):** The `injectGoodsReserve` method violates Stock-Flow Consistency.
*   **Code Snippet:**
    ```typescript
    // server/src/mechanics/automatedMarketMaker.ts (Line 307-311)
    export function injectGoodsReserve(amount: number): void {
      this.foodReserve += amount;
      this.k = this.fiatReserve * this.foodReserve;
    }
    ```
*   **Diagnostic:** When the system farm "injects" food, it arbitrarily increases $k$. This dilutes the value of all existing fiat in the AMM reserve without adding any fiat to back it. While not a "leak" of fiat units, it is a leak of **economic value** and breaks the Constant Product invariant.

---

## 🛑 FINAL SUMMARY OF FIAT LEAKS
1.  **Destruction:** `FOUND_ENTERPRISE` deletes 40 Wealth per use.
2.  **Destruction:** Rounding in `POST_BUY_ORDER` destroys fractional fiat during `Math.floor(foodOut)`.
3.  **Creation:** `ADJUST_TAX` and `SYSTEM` wages (Lines 1440-1445) create fiat because they are not deducted from a central bank or reserve.
4.  **Destruction/Creation:** `Math.round` in `clampWealth` destroys or creates up to 0.5 fiat per agent, per iteration during UBI redistribution.
