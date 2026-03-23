# Architecture

**Analysis Date:** 2024-03-24

## Pattern Overview

**Overall:** Layered Monolith with Real-time Streaming.

The codebase follows a clear layered architecture where concerns are separated into distinct modules: routing, orchestration, cognition, mechanics, and external integrations (LLM/DB). It uses a "Simulation Loop" pattern for its core functionality, driving agent behavior through iterative cycles of reasoning, action, and resolution.

**Key Characteristics:**
- **Iterative Simulation Loop**: The core logic revolves around a multi-step loop (Intent -> Resolution -> Physics -> Persistence).
- **Streaming Real-time Updates**: Uses Server-Sent Events (SSE) to push simulation progress to the frontend without polling.
- **LLM-Driven Cognition**: Higher-order agent behaviors (planning, memory) are handled by LLM calls, while low-level effects (health, wealth) are handled by a deterministic physics engine.

## Layers

**API / Routes:**
- Purpose: Handles incoming HTTP requests and maintains SSE connections.
- Location: `server/src/routes/`
- Contains: Express routers and request handlers.
- Depends on: `orchestration`, `db/repos`
- Used by: Frontend via `web/src/api/`

**Orchestration:**
- Purpose: Coordinates the complex simulation loop and manages in-memory session state.
- Location: `server/src/orchestration/`
- Contains: `simulationRunner.ts` (the loop), `simulationManager.ts` (session state), `governanceManager.ts`.
- Depends on: `cognition`, `mechanics`, `llm`, `db/repos`, `parsers`
- Used by: `routes`

**Cognition:**
- Purpose: Implements agent-level reasoning, memory, and planning.
- Location: `server/src/cognition/`
- Contains: `cognitiveEngine.ts`, `memoryStream.ts`, `recursivePlanner.ts`.
- Depends on: `llm`, `shared`
- Used by: `orchestration/simulationRunner.ts`

**Mechanics (The "Physics Engine"):**
- Purpose: Deterministic simulation of economy, physiology, and environment rules.
- Location: `server/src/mechanics/`
- Contains: `physicsEngine.ts`, `allostaticEngine.ts`, `automatedMarketMaker.ts`, `orderBook.ts`.
- Depends on: `shared`
- Used by: `orchestration/simulationRunner.ts`

**LLM / AI Layer:**
- Purpose: Provides a unified interface to multiple AI providers (OpenAI, Anthropic, Gemini).
- Location: `server/src/llm/`
- Contains: `gateway.ts`, provider-specific clients, and `prompts.ts`.
- Depends on: External SDKs
- Used by: `orchestration`, `cognition`

**Data / Persistence:**
- Purpose: Schema definition and database access abstractions.
- Location: `server/src/db/`
- Contains: `schema.ts`, `migrate.ts`, and `repos/` for entity-specific logic.
- Depends on: `drizzle-orm`, `better-sqlite3`
- Used by: All server layers

## Data Flow

**Simulation Iteration Flow:**

1.  **Cognitive Pre-processing**: `simulationRunner.ts` calls `cognitiveEngine.ts` to update agent memories and plans.
2.  **Intent Collection**: LLMs generate agent intents based on current state and plans (`llm/prompts.ts`).
3.  **Real-time Broadcast**: Intents are streamed to the UI via `simulationManager.ts` (SSE).
4.  **Action Resolution**: A "Central Agent" (LLM) resolves overlapping agent actions into a narrative summary.
5.  **Physics/Economy Execution**: `physicsEngine.ts` and `automatedMarketMaker.ts` calculate deterministic stat changes (wealth, health).
6.  **Persistence**: Final iteration state is committed to SQLite via `db/repos`.
7.  **Final Broadcast**: The resolved narrative and updated stats are sent to the UI.

**State Management:**
- **Backend**: Hybrid. Persistent state in SQLite; volatile session state (SSE clients, abort flags) in `simulationManager.ts` (singleton).
- **Frontend**: `zustand` stores (`web/src/stores/`) manage UI state and cache API responses.

## Key Abstractions

**AgentRepository:**
- Purpose: Abstracts CRUD operations for agents.
- Examples: `server/src/db/repos/agentRepo.ts`
- Pattern: Repository Pattern.

**LLM Gateway:**
- Purpose: Switches between different AI models and providers transparently.
- Examples: `server/src/llm/gateway.ts`
- Pattern: Gateway / Strategy Pattern.

**Simulation Manager:**
- Purpose: Manages the lifecycle and SSE broadcasting for active simulation sessions.
- Examples: `server/src/orchestration/simulationManager.ts`
- Pattern: Singleton / Manager.

## Entry Points

**Server Entry:**
- Location: `server/src/index.ts`
- Triggers: `npm run dev` (via root package.json)
- Responsibilities: Express app setup, mounting routes, database migrations.

**Client Entry:**
- Location: `web/src/main.tsx`
- Triggers: Browser page load.
- Responsibilities: React root mounting, global CSS, App component initialization.

## Error Handling

**Strategy:** Multi-layer validation and healing.

**Patterns:**
- **Retry with Healing**: LLM parsing errors are handled by re-prompting with the error message (`server/src/llm/retryWithHealing.ts`).
- **Graceful Simulation Pause**: Critical failures (like context overflow) pause the simulation instead of crashing (`SimulationPausedError`).

## Cross-Cutting Concerns

**Logging:** Custom async flusher for high-volume simulation logs (`server/src/db/asyncLogFlusher.ts`).
**Validation:** Zod-like patterns in parsers (`server/src/parsers/`) for LLM output.
**Authentication:** Not implemented (Local development focus).

---

*Architecture analysis: 2024-03-24*
