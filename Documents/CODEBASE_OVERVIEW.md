# Ideal World - Comprehensive Codebase Overview

This document provides a highly detailed architectural and mechanical overview of the **Ideal World** platform. It covers the project's goals, structural design, workflows, algorithm mechanisms (Neuro-Symbolic Engine), and technical optimizations. This document acts as the definitive source of truth for AI agents and human developers to rapidly understand the entire project and contribute immediately.

---

## 1. Project Goal and Architecture
**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies of 20 to 150+ "Citizen Agents" interacting in turn-based iterations, guided by an omniscient "Central Agent". 
The core philosophy revolves around a **Neuro-Symbolic Engine**, removing pure LLM math hallucinations and replacing them with deterministic economics and physics calculations (e.g., cortisol, dopamine, hunger).

### Technical Stack
- **Workspaces**: Monorepo using npm workspaces (`web`, `server`, `shared`).
- **Backend**: Node.js (Express), TypeScript, SQLite (Drizzle ORM), multi-provider LLM SDKs (Anthropic, OpenAI, local Ollama).
- **Frontend**: React 19, TypeScript, Zustand (State Management), Tailwind CSS, Vite.
- **Data Storage**: Local SQLite database stored in `~/.idealworld/idealworld.db` featuring asynchronous queued writes.
- **Communication**: Polling-free Server-Sent Events (SSE) for real-time frontend updates.

---

## 2. Platform Workflow
The application runs on a structured 7-stage lifecycle:
**1. Idea Input -> 2. Brainstorming -> 3. Design -> 4. Refine -> 5. Simulate -> 6. Reflect -> 7. Review.**

*Code Evidence (`server/src/db/schema.ts`):*
```typescript
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('name').notNull(),
  idea: text('seed_idea').notNull(),
  stage: text('stage').notNull().default('idea-input'), // Tracks the 7-stage position
  config: text('config'),
  // ...
});
```

---

## 3. The Central Loop & Map-Reduce Architecture

During the **Simulate** stage, the simulation enters an "Intent-Resolution" cycle. Because querying 150 LLM agents iteratively would exceed context limits and rate limits, Ideal World implements a **Map-Reduce (HMAS) Clustering Architecture**.

### The Map-Reduce Algorithm
1. **Map**: Collect intents asynchronously from every citizen agent concurrently.
2. **Reduce (Cluster)**: Form "local groups" of citizens by role/topology.
3. **Draft Summaries**: Send local group data to smaller, cheaper LLMs to draft local resolutions.
4. **Merge**: Send unified local drafts to the massive Central Agent model to craft the final iteration's global narrative.

*Code Evidence (`server/src/orchestration/simulationRunner.ts`):*
```typescript
      if (aliveAgents.length > MAPREDUCE_THRESHOLD) {
        // ── Map-Reduce path for large sessions (role-based clustering) ──
        const groups = clusterByRole(aliveAgents, BATCH_SIZE);
        const groupTasks = groups.map((group, gi) => async () => {
          const msgs = buildGroupResolutionMessages(session, group, groupIntents, allIntentsBrief, iterNum, previousSummary);
          // Use citizenAgentModel for group coordinators (cheaper); merge step keeps centralAgentModel
          return retryWithHealing({ provider: citizenProv, ... });
        });

        const groupResults = await runWithConcurrency(groupTasks, settings.maxConcurrency);

        // Merge step: synthesise group summaries into a society-wide narrative
        const groupSummaries = groupResults.map(r => r.groupSummary);
        const mergeMessages = buildMergeResolutionMessages(session, groupSummaries, iterNum, previousSummary);
        
        resolution = await retryWithHealing({ provider, messages: mergeMessages, ... });
      }
```

---

## 4. The Neuro-Symbolic Engine

The pinnacle algorithm of Ideal World is the **Neuro-Symbolic Engine**, ensuring agents adhere strictly to fundamental realities like resource limits and mortality.

### 4.1 "Neuro" (Cognitive prompts & NLP generation)
The LLM generates agent intents securely based on physical and psychological contexts. The prompt dynamically shifts tone when an agent is starving or under extreme stress (cortisol).

*Code Evidence (`server/src/llm/prompts.ts`):*
```typescript
  let painOverride = '';
  const health = agent.currentStats.health;
  if (health < 40 || cortisol > 70) {
    if (health < 20) {
      painOverride = '\n\n[CRITICAL PHYSICAL STATE] You are on the verge of death. Your body is shutting down from starvation. You CANNOT think about anything else. Every thought is consumed by the need to survive...';
    } 
  // ...
```

### 4.2 "Bridge" (Action Codes Parsing)
The LLM generates raw natural language + an `actionCode`. This standardizes fuzzy strings into concrete enums that the engine understands (e.g., `WORK`, `REST`, `STEAL`, `SABOTAGE`, `EMBEZZLE`).

*Code Evidence (`server/src/llm/prompts.ts`):*
```typescript
// The explicit constraint placed on the generative LLM
You MUST respond with ONLY valid JSON — no markdown, no preamble, no code fences:
{
  "internal_monologue": "Your private, raw, in-character thoughts — 2-3 sentences",
  "public_action_narrative": "What you are visibly doing this period — 1-2 sentences",
  "actionCode": "EXACTLY_ONE_OF_YOUR_ALLOWED_CODES",
  "actionTarget": "AgentName or null"
}
```

### 4.3 "Symbolic" (Physics & Economy Engine)
After the LLM defines the `actionCode`, the `physicsEngine.ts` guarantees exact numeric resolution of Health, Wealth, Happiness, Cortisol, and Dopamine. This enforces severe psychological mechanics like hedonic adaptation and metabolism.

*Code Evidence (`server/src/mechanics/physicsEngine.ts`):*
```typescript
export function resolveAction(input: PhysicsInput): PhysicsOutput {
  const { agent, actionCode, actionTarget, allAgents, skills, inventory } = input;
  let w = 0, h = 0, hap = 0, cor = 0, dop = 0;

  switch (actionCode) {
    case 'WORK':
      w = Math.round(roleIncome(agent.role) * productionMult);
      h = -2; hap = -1; cor = -3; dop = 2;
      break;
    case 'EMBEZZLE': // Elite privlege
      w = 20; hap = 2; cor = 20; dop = 8;
      break;
    // ...
  }
  
  // Health baseline: -2/iter (metabolism). 
  h -= 2;

  // Cortisol auto-escalation for low resources
  const stats = agent.currentStats;
  if (stats.wealth < 20) cor += 10;
  if (stats.health < 30) cor += 8;

  // Dopamine decay: hedonic adaptation
  dop -= 3;

  return {
    wealthDelta: clampDelta(w),
    healthDelta: clampDelta(h), ...
  };
}
```

---

## 5. Technical Performance Innovations

### 5.1 Backend: Asynchronous SQLite Queuing
To fix database `SQLITE_BUSY` transaction deadlocks (caused by 10,000+ tiny row inserts per iteration on high agent counts), the simulation runner deposits log data into an `asyncLogFlusher` queue rather than blocking the map-reduce event loop. 

*Code Evidence (`server/src/orchestration/simulationRunner.ts`):*
```typescript
      // Enqueue intent rows for async batch flush (non-blocking)
      const intentCols = ['id', 'session_id', 'agent_id', 'iteration_id', 'intent', 'reasoning', 'action_code', 'action_target', 'created_at'];
      for (const intent of intents) {
        asyncLogFlusher.enqueue('agent_intents', intentCols, [
          uuidv4(), sessionId, intent.agentId, iterationId,
          intent.intent, intent.reasoning ?? '',
          intent.actionCode ?? 'NONE', intent.actionTarget ?? null,
          now,
        ]);
      }
```

### 5.2 Frontend: React SSE Debouncing & Virtual Buffers
Directly tying `setState()` to a Server-Sent Events stream destroys React performance via continuous re-rendering triggers. To achieve 60 FPS, Zustand intercepts the `EventSource` stream, mutating a background array queue, and dumping it to React only via `requestAnimationFrame`.

*Code Evidence (`web/src/stores/simulationStore.ts`):*
```typescript
    // ── Double-buffering: push events into a mutable buffer and flush
    // via requestAnimationFrame to avoid per-event React re-renders. ────
    const buffer: SSEEvent[] = [];
    let rafId: number | null = null;

    const flushBuffer = () => {
      rafId = null;
      if (buffer.length === 0) return;

      const batch = buffer.splice(0);
      set(state => {
        // Safe batch ingestion logic here
        // ...
      });
    };

    const scheduleFlush = () => {
      if (rafId === null) rafId = requestAnimationFrame(flushBuffer);
    };

    es.onmessage = (e) => {
        const event = JSON.parse(e.data) as SSEEvent;
        buffer.push(event);
        scheduleFlush(); // Debounced render
    };
```

## Conclusion
 Ideal World heavily interleaves traditional high-performance concurrent scheduling, deterministic physics-like number crunching, and Generative Artificial Intelligence semantic intelligence. Developers should strictly preserve this **Neuro-Symbolic** barrier: AI defines **What/Why**, and the Hardcoded Physics dictates **How Much**.
