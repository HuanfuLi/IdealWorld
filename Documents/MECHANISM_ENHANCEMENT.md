# Ideal World - Mechanism Enhancement Plan

## Overview
This document outlines a phased implementation plan to upgrade the **Ideal World** multi-agent society simulation platform. Based on the deep research report, the system is facing bottlenecks in both engineering scale (when exceeding 150+ agents) and scientific credibility (due to LLM biases and lack of objective economic grounding).

This enhancement plan breaks down the complex architectural and scientific upgrades into actionable, independent phases designed to be executed by AI programming agents across multiple development sessions.

---

## Phase 1: Storage and Persistence Optimization ✅ DONE
**Goal:** Eliminate SQLite I/O bottlenecks and `SQLITE_BUSY` errors during high-frequency simulation iterations.
**Context:** Current individual `INSERT` statements per agent action cause severe lock contention.

### Implementation Summary
1. **WAL Mode & PRAGMA Tuning** (`server/src/db/index.ts`):
   - `PRAGMA synchronous = NORMAL` — reduces fsync calls while WAL provides durability.
   - `PRAGMA cache_size = -20000` — 20 MB page cache for faster reads.
   - `PRAGMA busy_timeout = 5000` — waits up to 5 s on lock contention.
2. **Batch Operations** (`server/src/db/repos/agentRepo.ts`, `server/src/orchestration/simulationRunner.ts`):
   - Added `agentRepo.bulkUpdateStats()` and `agentRepo.bulkMarkDead()` — prepared-statement transactions for N agents.
   - Refactored `simulationRunner.ts` to execute all stat updates + deaths in a single `sqlite.transaction()`.
3. **Async Log Flusher** (`server/src/db/asyncLogFlusher.ts`):
   - In-memory queue for non-critical inserts (agent intents, resolved actions).
   - Groups queued rows by table, reuses prepared statements, flushes every 500 ms or at 200-row threshold.
   - Drains synchronously on simulation end/abort.

---

## Phase 2: React 19 UI & SSE Rendering Optimization ✅ DONE
**Goal:** Resolve severe frontend rendering blocks caused by high-frequency SSE updates from the backend state stream.
**Context:** State cascades trigger massive DOM diffs, freezing the browser.

### Implementation Summary
1. **Double-Buffering & rAF Debouncing** (`web/src/stores/simulationStore.ts`):
   - SSE events pushed into a mutable buffer array instead of per-event `set()`.
   - `requestAnimationFrame` loop flushes all accumulated events in a single Zustand `set()` call (~60fps).
2. **Zustand Selective Rendering** (`web/src/pages/Simulation.tsx`):
   - Added `useShallow` from `zustand/react/shallow` for shallow-equality store subscription.
3. **Virtual Lists** (`web/src/pages/Simulation.tsx`):
   - Installed `@tanstack/react-virtual`.
   - Live Feed and Lifecycle Events lists use `useVirtualizer` with dynamic row measurement and overscan.

---

## Phase 3: Architecting the Neuro-Symbolic Engine ✅ DONE
**Goal:** Shift from pure LLM-dictated outcomes to a hybrid system where hard math governs economics, and LLMs govern psychology.
**Context:** Previously, the Central Agent determined wealth/health arbitrarily via LLM output.

### Implementation Summary
1. **Symbolic Economic Engine** (`server/src/mechanics/physicsEngine.ts`):
   - 9 action codes: `WORK | TRADE | REST | STRIKE | STEAL | HELP | INVEST | CONSUME | NONE`
   - `server/src/mechanics/actionCodes.ts` — type + `normalizeActionCode()` validator
   - Deterministic `resolveAction()` computes exact deltas for wealth, health, happiness, cortisol, dopamine
   - Role-based income: Leader/Governor/Merchant → +8, Artisan/Worker → +5, Scholar/Healer → +4, other → +3
   - Trade/steal calculations factor in partner's wealth
   - All deltas clamped to [-30, +30], final stats clamped to [0, 100]
2. **De-coupled LLM from Stat Calculation:**
   - `simulationRunner.ts` refactored: LLM outputs action codes (via intent prompts); physics engine computes all numeric deltas
   - `buildResolutionPrompt()` and `buildGroupResolutionMessages()` no longer ask LLM for `wealthDelta`/`healthDelta`/`happinessDelta`
   - `parseResolution()` and `parseGroupResolution()` set delta fields to 0 (physics engine provides actuals)
   - `parseAgentIntent()` now extracts `actionCode` and `actionTarget` from LLM output
3. **Neurobiological Variables (Stress & Joy):**
   - `AgentStats` extended with `cortisol: number` (0-100) and `dopamine: number` (0-100)
   - No DB migration needed — stats are JSON blobs; `parseStats()` adds defaults (cortisol: 20, dopamine: 50)
   - `agentRepo.updateStats()` and `bulkUpdateStats()` accept cortisol/dopamine
   - Automatic adjustments per iteration: health baseline -2, cortisol auto-escalation when wealth < 20 or health < 30, dopamine decay -3
   - Stress modifiers injected into intent prompts: cortisol > 80 → "extreme biological stress"; cortisol > 60 → "significant pressure"

---

## Phase 4: HMAS Map-Reduce & Cost Optimization ✅ DONE
**Goal:** Handle 150+ agents without blowing up the context window or API budget.
**Context:** Passing 150 agent intents directly to the Central Agent via one prompt causes context collapse and extreme token cost.

### Implementation Summary
1. **Role-Based Clustering** (`server/src/orchestration/clustering.ts`):
   - `clusterByRole(agents, maxPerCluster)` groups same-role agents together (max 15 per cluster)
   - Algorithm: group by role → sort by size → greedily fill clusters → overflow into mixed clusters
   - Replaces the naive `chunk()` function in the map-reduce path
2. **Map Stage: Cheaper Model for Group Coordinators:**
   - Group resolution calls now use `citizenAgentModel` (cheaper) instead of `centralAgentModel`
   - Only the merge (reduce) step retains `centralAgentModel` for society-wide narrative synthesis
3. **Prompt Caching Implementation** (`server/src/llm/types.ts`, `server/src/llm/anthropic.ts`, `server/src/llm/openai.ts`):
   - `LLMMessage.content` extended to `string | ContentBlock[]`
   - `ContentBlock`: `{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }`
   - `buildIntentPrompt()` and `buildGroupResolutionMessages()` split into static prefix (cacheable, with `cache_control: ephemeral`) + dynamic suffix
   - Anthropic provider passes `ContentBlock[]` directly as the system parameter array with cache_control
   - OpenAI/local providers flatten `ContentBlock[]` to a single string (backward compatible)

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
