# Ideal World - Mechanism Enhancement Plan

## Overview
This document outlines a phased implementation plan to upgrade the **Ideal World** multi-agent society simulation platform. Based on the deep research report, the system is facing bottlenecks in both engineering scale (when exceeding 150+ agents) and scientific credibility (due to LLM biases and lack of objective economic grounding).

This enhancement plan breaks down the complex architectural and scientific upgrades into actionable, independent phases designed to be executed by AI programming agents across multiple development sessions.

---

## Phase 1: Storage and Persistence Optimization
**Goal:** Eliminate SQLite I/O bottlenecks and `SQLITE_BUSY` errors during high-frequency simulation iterations.
**Context:** Current individual `INSERT` statements per agent action cause severe lock contention.

### Actionable Steps
1. **Enable WAL Mode & PRAGMA Tuning:**
   - Modify the SQLite connection initialization in `server/src/db/index.ts`.
   - Enable Write-Ahead Logging: `PRAGMA journal_mode = WAL;`.
   - Tune synchronous settings: `PRAGMA synchronous = NORMAL;`.
   - Increase cache size and set a busy timeout: `PRAGMA cache_size = -20000; PRAGMA busy_timeout = 5000;`.
2. **Implement Batch Operations:**
   - Refactor `applyStatChanges` and `applyLifecycleEvents` inside `server/src/orchestration/simulationRunner.ts` (or the respective DB Repos).
   - Use Drizzle ORM's transaction or explicit batching (`db.batch()`) to aggregate all 150+ agent state updates and intention logs into a single physical write per iteration.
3. **Application-Level Memory Queue for Logs:**
   - Introduce an in-memory queue for non-critical logs (e.g., chat histories and raw intent strings).
   - Create an asynchronous flusher in a new file `server/src/db/asyncLogFlusher.ts` that consumes the queue based on a time window (e.g., every 500ms) or bulk threshold to flush data without blocking the main simulation loop.

---

## Phase 2: React 19 UI & SSE Rendering Optimization
**Goal:** Resolve severe frontend rendering blocks caused by high-frequency SSE updates from the backend state stream.
**Context:** State cascades trigger massive DOM diffs, freezing the browser.

### Actionable Steps
1. **Double-Buffering & rAF Debouncing:**
   - Refactor the SSE listener in `web/src/api/client.ts` or the central Zustand store (`simulationStore.ts`).
   - Instead of updating Zustand state immediately upon receiving an SSE event, push the event payload into a mutable `useRef` array (the buffer).
   - Implement a `requestAnimationFrame` (rAF) loop that flushes this buffer periodically (e.g., matching the 60Hz display refresh rate) and performs a single bulk `set` operation on the Zustand store.
2. **Zustand Selective Rendering (Shallow Subscriptions):**
   - Audit `simulationStore.ts`. Ensure components use `useShallow` when subscribing to specific attributes (e.g., a single agent's health vs. the entire agent list).
3. **Virtual Lists for Logs & Agent Grids:**
   - Install `@tanstack/react-virtual`.
   - Refactor the Live Feed component and the Agent Grid component in `web/src/pages/SimulationPage.tsx` to use virtualized scrolling. Only render the ~20 DOM nodes currently visible in the viewport.

---

## Phase 3: Architecting the Neuro-Symbolic Engine
**Goal:** Shift from pure LLM-dictated outcomes to a hybrid system where hard math governs economics, and LLMs govern psychology.
**Context:** Currently, the Central Agent determines wealth/health arbitrarily.

### Actionable Steps
1. **Build the Symbolic Economic Engine:**
   - Create `server/src/mechanics/physicsEngine.ts`.
   - Define strict, deterministic formulas for resource consumption per iteration (e.g., baseline calorie/health drain), standard wages based on roles, and basic trade math.
2. **De-couple LLM from Stat Calculation:**
   - Modify `simulationRunner.ts`. The Central Agent LLM no longer arbitrarily outputs `wealthDelta` or `healthDelta`.
   - Instead, the LLM outputs a *decision action* (e.g., "Trade 5 apples for 10 coins", or "Strike").
   - Feed this decision into `physicsEngine.ts` to calculate the exact numeric changes mathematically.
3. **Neurobiological Variables (Stress & Joy):**
   - Add hidden neurobiological attributes (`cortisol`/stress, `dopamine`/satisfaction) to the `AgentStats` schema.
   - When the `physicsEngine` registers wealth drops below a survival line, aggressively increment `cortisol`.
   - Pass these hidden variables into the LLM system prompt. E.g., if `cortisol` > 80%, the prompt injects: *"You are under extreme biological stress and survival panic. You are highly prone to aggression, rule-breaking, or uprising."*

---

## Phase 4: HMAS Map-Reduce & Cost Optimization
**Goal:** Handle 150+ agents without blowing up the context window or API budget.
**Context:** Passing 150 agent intents directly to the Central Agent via one prompt causes context collapse and extreme token cost.

### Actionable Steps
1. **Dynamic Clustering (Social Distance Algorithm):**
   - Implement an algorithm in `server/src/orchestration/clustering.ts` that performs agglomerative hierarchical clustering on the agent roster. Group the 150 agents into ~10 "districts" based on roles or interaction history (max 15 agents per cluster).
2. **Map Stage: Local Coordinators:**
   - Create a `CoordinatorAgent` logic layer.
   - For each iteration, dispatch the 10 clusters in parallel to a cheaper LLM model (e.g., Claude 3.5 Haiku or a Local Llama-3 8B).
   - The Coordinator's task is strictly local conflict resolution and summarizing the 15 agent intents into a condensed regional synopsis.
3. **Reduce Stage: Central Orchestrator:**
   - The Central Agent (using GPT-4o or Claude 3.5 Sonnet) now only receives 10 condensed regional synopses instead of 150 raw intents. It processes macro-trends, global law enforcement, and inter-district conflicts.
4. **Prompt Caching Implementation:**
   - Structure all agent LLM prompts in `server/src/llm/prompts.ts` strictly following the Prompt Caching rule:
     - **Static Prefix:** World rules, laws, JSON schemas.
     - **Dynamic Suffix:** Current round history, agent specific status.

---

## Phase 5: RAG Injection & Resilience Layer
**Goal:** Counteract RLHF bias (the tendency of LLMs to refuse conflict) and prevent JSON parsing crashes.

### Actionable Steps
1. **RAG for Historical Subconscious (Counteracting RLHF Bias):**
   - Create a basic retrieval system. Store historical snippets (e.g., conditions of the French Revolution, 1929 Great Depression survival tactics) in local JSON arrays or a simple vector store (`sqlite-vec` or `fuse.js`).
   - When an agent's `cortisol` hits high levels, retrieve a relevant historical mindset and append it as a "Subconscious Drive" in their prompt, forcing the LLM out of its polite, safe alignment to simulate raw survival instincts.
2. **Autonomous Try-Heal-Retry Loop:**
   - Refactor `parseAgentIntent` and `parseResolution` in `server/src/parsers/simulation.ts`.
   - Wrap LLM calls in a retry block. If Zod validation throws an error (e.g., broken JSON or hallucinated formatting), catch it, append the exact parser error to the prompt, and ask the LLM to rewrite the output.
   - Apply a max retry of 2. If it fails completely, fallback to a hardcoded safe state (e.g., `{ intent: "Agent rests.", wealthDelta: 0 }`).

---
*(End of Plan - Ready for AI agent execution in future sessions)*
