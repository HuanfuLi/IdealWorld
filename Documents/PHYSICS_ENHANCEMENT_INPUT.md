# Ideal World - Neuro-Symbolic Physics Engine & Simulation Workflow (AI Enhancement Protocol)

**Target Audience:** Autonomous AI Programming Agents, Technical Architects, Brainstorming Sub-Agents
**Document Purpose:** This is an exhaustive, code-dense technical specification detailing the current implementation of the Neuro-Symbolic Engine, the deterministic physics mechanics, and the central simulation loop in the Ideal World application. 
**Goal:** Serve as the definitive foundational context for AI agents tasked with brainstorming, planning, and executing enhancements to the economic, physiological, and social mechanisms of the simulation.

---

## 1. Architectural Paradigm: Neuro-Symbolic Design
The core challenge in LLM-driven multi-agent simulations is the tendency for large language models to hallucinate resources, resolve conflicts cleanly due to RLHF safety alignment (the "Saint disease"), and fail at zero-sum game mechanics. 
To counteract this, the system enforces a strict **Neuro-Symbolic Architecture**:
*   **Neural Layer (LLMs / Pre-trained Weights):** Responsible strictly for generating human-readable narrative, reasoning trajectories, and extracting standardized intent tokens (`ActionCode`).
*   **Symbolic Layer (TypeScript Deterministic Code):** Responsible for executing arithmetic state mutations (resource allocation, physiological stat adjustments, survival calculations). LLMs cannot directly mutate agent stats; they only propose actions which the symbolic layer adjudicates.

---

## 2. Core Simulation Loop & Workflow (`simulationRunner.ts`)
The central nervous system of the simulation runs in iterations. Each iteration processes intents for all living citizen agents.

**Source File Context:** `server/src/orchestration/simulationRunner.ts`

### 2.1 Intent Collection (Parallel Mapping)
For every living agent, the system builds a prompt injecting their current state and prompts them for their next action.

```typescript
// Excerpt: Intent Collection in simulationRunner.ts
const intentTasks = aliveAgents.map(agent => async (): Promise<AgentIntent> => {
  const messages = buildIntentPrompt(agent, session, previousSummary, iterNum);
  const fallbackIntent: AgentIntent = {
    agentId: agent.id, agentName: agent.name,
    intent: `${agent.name} continues their routine.`, reasoning: '',
    actionCode: 'NONE', actionTarget: null,
  };
  const parsed = await retryWithHealing({
    provider: citizenProv, // Leverages configured provider (supports hybrid routing)
    messages,
    options: { model: settings.citizenAgentModel },
    parse: (raw) => {
      const p = parseAgentIntentStrict(raw);
      return {
        agentId: agent.id, agentName: agent.name,
        intent: p.intent, reasoning: p.reasoning,
        actionCode: p.actionCode, actionTarget: p.actionTarget,
      } as AgentIntent;
    },
    fallback: fallbackIntent,
    label: `intent:${agent.name}`,
  });
  return parsed;
});

const intents = await runWithConcurrency(intentTasks, settings.maxConcurrency);
```

**Enhancement Vectors:**
*   Currently, context window injections (`previousSummary`) are global macro-summaries. Future AI could implement localized memory graphs or agent-to-agent proximity networks so an agent only knows about events in their "neighborhood/social graph" rather than the global state.

### 2.2 Map-Reduce Resolution Pipeline
When the population exceeds the `MAPREDUCE_THRESHOLD` (currently hardcoded to 30), O(N^2) conflict resolution in a single prompt fails. The system groups agents by role.

```typescript
// Excerpt: Map-Reduce Resolution in simulationRunner.ts
if (aliveAgents.length > MAPREDUCE_THRESHOLD) {
  const allIntentsBrief = intents.map(i => `- ${i.agentName}: ${i.intent.slice(0, 80)}`).join('\n');
  const groups = clusterByRole(aliveAgents, BATCH_SIZE);
  
  // Phase 1: MAP - Local Coordinators
  const groupTasks = groups.map((group, gi) => async () => {
    const groupIntents = intents.filter(i => group.some(a => a.id === i.agentId));
    const msgs = buildGroupResolutionMessages(session, group, groupIntents, allIntentsBrief, iterNum, previousSummary);
    return retryWithHealing({
      provider: citizenProv,
      messages: msgs,
      options: { model: settings.citizenAgentModel },
      parse: parseGroupResolutionStrict,
      fallback: { groupSummary: '...', agentOutcomes: [], lifecycleEvents: [] },
      label: `groupResolution:${gi}`,
    });
  });
  const groupResults = await runWithConcurrency(groupTasks, settings.maxConcurrency);

  // Phase 2: REDUCE - Central Synthesizer
  const groupSummaries = groupResults.map(r => r.groupSummary);
  const mergeMessages = buildMergeResolutionMessages(session, groupSummaries, iterNum, previousSummary);
  const mergeResult = await retryWithHealing({
    provider,
    messages: mergeMessages,
    options: { model: settings.centralAgentModel },
    parse: parseMergeResolutionStrict,
    fallback: { narrativeSummary: '...', lifecycleEvents: [] },
    label: 'mergeResolution',
  });
  
  resolution = {
    narrativeSummary: mergeResult.narrativeSummary,
    agentOutcomes: groupResults.flatMap(r => r.agentOutcomes),
    lifecycleEvents: [...groupResults.flatMap(r => r.lifecycleEvents), ...mergeResult.lifecycleEvents],
  };
}
```

**Enhancement Vectors:**
*   Clustering is currently purely role-based (`clusterByRole`). Enhancements could involve clustering by geographic nodes, class stratification structures, or dynamic network factions parsed from the previous interactions.

---

## 3. The Deterministic Physics Engine & Action Space
The `ActionCode` is the translation layer between Neural reasoning and Symbolic state mutation.

### 3.1 Lexical Space
**Source File:** `server/src/mechanics/actionCodes.ts`
```typescript
export type ActionCode =
  | 'WORK' | 'TRADE' | 'REST' | 'STRIKE' | 'STEAL' | 'HELP' | 'INVEST' | 'CONSUME' | 'NONE';

export function normalizeActionCode(raw: string): ActionCode {
  // ... maps LLM output to valid enum.
}
```

### 3.2 Numeric Resolution
State changes are tightly bound and deterministically calculated.
**Source File:** `server/src/mechanics/physicsEngine.ts`

```typescript
export interface PhysicsInput {
  agent: Agent;
  actionCode: ActionCode;
  actionTarget?: string;    // target agentId for interpersonal actions
  allAgents: Agent[];
}

export interface PhysicsOutput {
  wealthDelta: number; healthDelta: number; happinessDelta: number;
  cortisolDelta: number; dopamineDelta: number;
}

function roleIncome(role: string): number {
  const upper = role.toUpperCase();
  if (/LEADER|GOVERNOR|MERCHANT|CHIEF|KING|QUEEN|MAYOR|MINISTER/.test(upper)) return 8;
  if (/ARTISAN|WORKER|FARMER|BUILDER|MINER|SMITH|CARPENTER/.test(upper)) return 5;
  if (/SCHOLAR|HEALER|PRIEST|TEACHER|MONK|DOCTOR|SAGE/.test(upper)) return 4;
  return 3;
}

export function resolveAction(input: PhysicsInput): PhysicsOutput {
  const { agent, actionCode, actionTarget, allAgents } = input;
  let w = 0, h = 0, hap = 0, cor = 0, dop = 0;

  switch (actionCode) {
    case 'WORK':
      w = roleIncome(agent.role);
      h = -2; hap = -1; cor = -3; dop = 2; // Health strain, stress relief via routine
      break;
    case 'REST':
      w = 0; h = 5; hap = 2; cor = -5; dop = 1;
      break;
    case 'STEAL':
      w = stealCalc(agent, allAgents, actionTarget); // Capped at min(15, target.wealth * 0.15)
      h = -5; hap = -3; cor = 10; dop = 5; // High health risk, massive cortisol spike
      break;
    // ... STRIKE, TRADE, HELP, INVEST, CONSUME
  }
  return { wealthDelta: w, healthDelta: h, happinessDelta: hap, cortisolDelta: cor, dopamineDelta: dop };
}
```
*Note: In `simulationRunner.ts`, if `newHealth <= 0`, the agent is marked `died: true` and removed from active loop.*

**Enhancement Vectors:**
*   **Variable Economic Systems**: `roleIncome` is globally static. An upgraded version could implement a dynamic macroeconomic layer (e.g., inflation, taxation logic, supply/demand multipliers for certain roles based on current society state).
*   **Combat/Conquest Mechanics**: Add variables for physical strength or organizational power to handle lethal combat actions beyond arbitrary -5 health penalties.
*   **Property/Inventory**: Currently only `wealth` is tracked. A massive upgrade would allow tracking tangible property units (food, land, tools) with specific decay rates.

---

## 4. Subconscious Drive Injection (Historical RAG)
To force RLHF-aligned LLMs to mimic desperate human behavioral limits (like initiating violence, theft, or uprisings during starvation), the system actively modifies prompts under extreme conditions.

**Source File Context:** `server/src/mechanics/historicalRAG.ts`
```typescript
const HISTORICAL_SNIPPETS: HistoricalSnippet[] = [
  {
    category: 'famine',
    era: 'Irish Famine, 1845–1852',
    mindset: 'You remember stories of families who ate grass and bark to survive. ... You must secure food and resources by any means necessary — hesitation is death.',
    triggers: { lowWealth: true, highCortisol: true },
  },
  {
    category: 'revolution',
    era: 'French Revolution, 1789–1799',
    mindset: 'The aristocrats feasted while children starved. When the dam broke, rage was righteous... Those who benefit from injustice will never voluntarily surrender their privilege.',
    triggers: { highCortisol: true, lowWealth: true }, // Cortisol>60 & Wealth<20
  }
];

export function getSubconsciousDrive(cortisol: number, wealth: number, health: number): string | null {
  if (cortisol <= 60) return null; // Safe guard. Only intervenes under neuro-stress.

  const lowWealth = wealth < 20;
  const lowHealth = health < 30;
  const highCortisol = cortisol > 60;

  // Pattern matching logic selects highest scoring snippet and appends to prompt block.
  // ...
  return `[Subconscious Drive — echoes of ${chosen.era}]\n${chosen.mindset}`;
}
```

**Enhancement Vectors:**
*   **Systemic Radicalization Modeling:** Extend RAG to support contagious ideologies. If Cortisol is high *and* society inequality (Gini index) is high, agents might receive prompts aligning them to specific systemic revolts rather than just individual desperation.
*   **Generational Trauma/Inheritance:** Inject custom snippets derived from agent family lines rather than hardcoded global history snippets, establishing continuity of grievances.

---
**END OF SPECIFICATION**
