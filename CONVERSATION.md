# Enhancement Plan: Neuro-Symbolic Governance & Political Cycles

## 1. Objective
Introduce a formal "Governance Phase" every 5 iterations to allow agents to dynamically alter the laws, taxes, and redistribution models of their society. This transforms the simulation from a static economy into a dynamic political evolution testbed.

## 2. Architectural Changes

### Phase A: Policy Persistence (The "Live Law")
**Goal:** Move economic constants from code into a mutable database state.
- **Action:** Utilize the `law` and `config` fields in the `sessions` table.
- **Initial Policies:**
    - `tax_rate`: (Default 0.02) The wealth tax/demurrage.
    - `ubi_allocation`: (Default 1.0) Percentage of tax revenue redistributed as UBI.
    - `enforcement_level`: (Default 1.0) Multiplier for theft penalties and security.
- **Physics Integration:** Update `simulationRunner.ts` to read these values from the session state during the tax and UBI calculation steps.

### Phase B: The Governance Orchestrator (`governanceManager.ts`)
**Goal:** Implement the 3-step political process in a new orchestration layer.
- **Action:** Create `server/src/orchestration/governanceManager.ts`.
- **Step 1: Selection:** Central Agent selects "Decision Makers" (Politicians) based on the `society_overview` (Democracy vs. Dictatorship).
- **Step 2: Proposals:** Each Politician reflects on their `MemoryStream` and proposes ONE change (e.g., "Lower tax because I am a merchant" or "Raise UBI because I am starving").
- **Step 3: Synthesis:** Central Agent de-duplicates proposals into a "Legislative Ballot."
- **Step 4: Voting:** Decision Makers vote `YES/NO` on each ballot item.
- **Step 5: Ratification:** If passed (majority or autocratic decree), the `session.law` is updated.

### Phase C: Political Prompts (`prompts.ts`)
**Goal:** Give agents the "voice" to act as political entities.
- **`buildProposalPrompt`:** Asks an agent to act as a legislator, considering their personal wealth, role, and memories of hardship.
- **`buildBallotPrompt`:** Asks the Central Agent to act as a "Speaker of the House," synthesizing raw complaints into formal policy changes (e.g., `tax_rate: 0.05`).
- **`buildVotePrompt`:** Asks agents to vote based on self-interest vs. social stability.

### Phase D: Simulation Loop Integration
**Goal:** Trigger the political cycle without breaking the iteration flow.
- **Action:** Update `simulationRunner.ts`.
- **Logic:** `if (iteration % 5 === 0) { await runGovernanceCycle(sessionId) }`.
- **Broadcast:** Use `simulationManager.broadcast` to inform the frontend of "New Laws Passed" so the user sees the political change in real-time.

## 3. Implementation Steps for Next Agent
1. **Infrastructure:** Create the `governanceManager.ts` and wire it into the `simulationRunner` loop.
2. **Prompts:** Implement the three new political prompts in `prompts.ts`.
3. **Selection Logic:** Ensure the "Politician Selection" logic respects the `societyOverview` (e.g., if "Dictatorship" is mentioned, only 1 agent is picked).
4. **Physics Hook:** Ensure the `resolveActionQueue` uses `session.law.tax_rate` instead of the hardcoded `0.02`.

## 4. Success Criteria
- **Emergent Politics:** Agents in a famine (low health) should successfully vote to increase UBI or lower food taxes.
- **Ideological Alignment:** A "Socialist" design results in higher taxes and UBI; a "Laissez-faire" design results in the committee voting to abolish them.
- **Transparency:** Users can see the current "Active Laws" in the UI and observe how they change over time.
