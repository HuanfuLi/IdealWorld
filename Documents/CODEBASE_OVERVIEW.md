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

### 4.2 "Bridge" (Multi-Action Queue Parsing)
The LLM generates raw natural language + an `actionQueue` (array of `actionCode`). This allows agents to perform sequential behaviors (e.g., `["WORK", "POST_BUY_ORDER", "REST"]`) in a single tick.

### 4.3 "Symbolic" (Physics, Metabolism & Economy Engine)

#### 4.3.1 Physiological Metabolism (MET System)
Computes per-tick Satiety depletion using **Metabolic Equivalent of Task (MET)**.
- **Formula**: $\Delta_{\text{Satiety}} = (\text{weightKg} \cdot \text{MET} \cdot \text{AgeModifier}) / \text{SatietyKcalPerPoint}$
- Intensities range from `SLEEP` (0.95) to `WORK_HEAVY_MANUAL` (7.25).
- Physical labor over age 60 incurs up to 25% biomechanical inefficiency.

#### 4.3.2 Allostatic Load Pipeline (EMAL)
Translates transient **Cortisol** into permanent structural health damage via a 3-step differential pipeline:
1. **Reversible Strain ($S_t$)**: A leaky integrator where $S_t = 0.85 \cdot S_{t-1} + \text{Cortisol}$.
2. **Irreversible Load ($L_t$)**: Accumulates when Strain exceeds the elasticity limit (80): $L_t += (S_t - 80) \cdot 0.05$.
3. **Structural Health Decay ($H_t$)**: Begins when Load crosses the disease threshold (500): $H -= (L_t - 500) \cdot 0.02$.

#### 4.3.3 Constant Product AMM ($x \cdot y = k$)
Replaces peer-to-peer bartering with an algorithmic liquidity pool.
- **Invariant**: $k = \text{FiatReserve} \cdot \text{FoodReserve}$.
- Spot price is determined by the reserve ratio. Buying food when reserves are low causes exponential price spikes, rationing scarce resources.

---

## 5. Technical Performance Innovations

### 5.1 Backend: HMAS Map-Reduce & Asynchronous SQLite Queuing
To handle 150+ agents, the simulation uses **HMAS Clustering**:
1. **Map**: Concurrent async intent collection.
2. **Reduce**: Role-based clustering to form local group narratives.
3. **Merge**: Central Agent synthesis into a global narrative.

Log data is enqueued in the `asyncLogFlusher` to prevent `SQLITE_BUSY` deadlocks during high-concurrency writes.

### 5.2 Frontend: React SSE Debouncing & Virtual Buffers
To achieve 60 FPS, Zustand intercepts the `EventSource` stream, mutating a background array queue, and dumping it to React only via `requestAnimationFrame` (rAF) to avoid per-event re-renders.

## Conclusion
 Ideal World heavily interleaves traditional high-performance concurrent scheduling, deterministic physics-like number crunching, and Generative Artificial Intelligence semantic intelligence. Developers should strictly preserve this **Neuro-Symbolic** barrier: AI defines **What/Why**, and the Hardcoded Physics dictates **How Much**.
