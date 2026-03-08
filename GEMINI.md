# GEMINI.md - Ideal World Project Context

## Project Overview
**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies of 20 to 150+ "Citizen Agents" interacting in turn-based iterations, guided by an omniscient "Central Agent". The project uses a **Neuro-Symbolic Engine**, combining LLM-driven intentions with a deterministic physics/economic engine to ensure resource constraints and psychological realism (e.g., *cortisol*, *dopamine* modeling).

### Key Technologies
- **Architecture**: Monorepo using npm workspaces (`web`, `server`, `shared`).
- **Backend**: Node.js (Express), TypeScript, SQLite (Drizzle ORM), multi-provider LLM SDKs (Anthropic, OpenAI, Google Gemini/Vertex, local Ollama).
- **Frontend**: React 19, TypeScript, Zustand (State Management), Tailwind CSS, Vite.
- **Data Storage**: Local SQLite database stored in `~/.idealworld/idealworld.db`.
- **Communication**: Server-Sent Events (SSE) for real-time simulation updates.
- **Optimization**: Linear Tick Engine with asynchronous task queuing and rAF-based UI debouncing.

---

## Project Structure
- `web/`: React frontend.
  - `src/stores/`: Zustand stores for state management and API/SSE orchestration.
  - `src/pages/`: Main view components.
- `server/`: Express backend.
  - `src/orchestration/`: Core tick-based simulation logic (`simulationRunner.ts`) and `TickStateStore`.
  - `src/llm/`: LLM Gateway with per-agent model selection and prompt templates.
  - `src/mechanics/`: Deterministic physics engine, metabolism, and action codes.
  - `src/db/`: Database schema, repositories, and async log flushing.
- `shared/`: Shared TypeScript types for ticks, needs, and tasks.

---

## Building and Running

### Prerequisites
- Node.js (LTS version recommended)
- npm

### Installation
```bash
npm install
```

### Development
Starts the backend (Express) and frontend (Vite) concurrently:
```bash
npm run dev
```

### Build
Builds all packages:
```bash
npm run build
```

---

## Development Conventions

### Simulation Workflow
The simulation follows a 7-stage lifecycle:
1. **Idea Input** -> 2. **Brainstorming** -> 3. **Design** -> 4. **Refine** -> 5. **Simulate** -> 6. **Reflect** -> 7. **Review**.

### Neuro-Symbolic Logic
- **Neuro (Intent Phase)**: Agents use LLMs to generate intents and `ActionCodes`. Citizens and Central Agents can use different models.
- **Bridge (Pacing)**: Asynchronous batches prompt agents while the engine continues to tick.
- **Symbolic (Resolution Phase)**: The `physicsEngine.ts` resolves metabolism (satiety, energy, cortisol) every tick and updates health/wealth upon task completion.

### Coding Style & Standards
- **Tick-Based**: All simulation logic should be designed for a linear tick engine.
- **In-Memory State**: Use `TickStateStore` for high-frequency updates to avoid SQLITE_BUSY.
- **Type Safety**: Definitive types for `ActiveTask` and `TickAgentState` in `@idealworld/shared`.
- **Aesthetics**: Maintain the premium, vibrant UI design (Inter font, glassmorphism, smooth animations).

---

## Key Files for Reference
- `server/src/llm/prompts.ts`: The source of truth for all AI behaviors.
- `server/src/mechanics/physicsEngine.ts`: The deterministic rules of the world.
- `server/src/db/schema.ts`: Database structure.
- `web/src/stores/simulationStore.ts`: Frontend simulation state, double-buffered SSE ingestion, and animation frame debouncing.
- `Documents/CODEBASE_OVERVIEW.md`: Comprehensive codebase overview, architecture, and logic walkthrough.
