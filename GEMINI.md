# GEMINI.md - Ideal World Project Context

## Project Overview
**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies of 20 to 150+ "Citizen Agents" interacting in turn-based iterations, guided by an omniscient "Central Agent". The project uses a **Neuro-Symbolic Engine**, combining LLM-driven intentions with a deterministic physics/economic engine to ensure resource constraints and psychological realism (e.g., *cortisol*, *dopamine* modeling).

### Key Technologies
- **Architecture**: Monorepo using npm workspaces (`web`, `server`, `shared`).
- **Backend**: Node.js (Express), TypeScript, SQLite (Drizzle ORM), OpenAI/Anthropic SDKs.
- **Frontend**: React 19, TypeScript, Zustand (State Management), Tailwind CSS, Vite.
- **Data Storage**: Local SQLite database stored in `~/.idealworld/idealworld.db`.
- **Communication**: Server-Sent Events (SSE) for real-time simulation updates.
- **Optimization**: HMAS Map-Reduce architecture for high agent counts, Prompt Caching (Anthropic), and rAF-based UI debouncing.

---

## Project Structure
- `web/`: React frontend.
  - `src/stores/`: Zustand stores for state management and API/SSE orchestration.
  - `src/pages/`: Main view components (Simulation, Reflection, etc.).
- `server/`: Express backend.
  - `src/orchestration/`: Core simulation logic, Map-Reduce, and agent runners.
  - `src/llm/`: LLM Gateway, provider abstractions, and centralized prompt templates (`prompts.ts`).
  - `src/mechanics/`: Deterministic physics engine and action codes.
  - `src/db/`: Database schema, repository pattern, and async log flushing.
- `shared/`: Shared TypeScript types and constants used by both frontend and backend.
- `Documents/`: Detailed architectural designs, codebase explanations, and UI specifications.

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
Starts both the backend (Express) and frontend (Vite) concurrently:
```bash
npm run dev
```

Run specific workspaces:
- `npm run dev -w server`
- `npm run dev -w web`

### Build
Builds all packages in the correct dependency order:
```bash
npm run build
```

---

## Development Conventions

### Simulation Workflow
The simulation follows a structured 7-stage lifecycle:
1. **Idea Input** -> 2. **Brainstorming** -> 3. **Design** -> 4. **Refine** -> 5. **Simulate** -> 6. **Reflect** -> 7. **Review**.

### Neuro-Symbolic Logic
- **Intent Phase**: Citizen Agents output intentions and standard `ActionCodes` (e.g., `WORK`, `STEAL`).
- **Resolution Phase**: The Central Agent adjudicates conflicts, and the `physicsEngine.ts` calculates exact numerical changes to wealth, health, and happiness based on the action codes.

### Coding Style & Standards
- **Local-First**: All data stays on the user's machine. Configuration is stored in `~/.idealworld/config.json`.
- **Type Safety**: Use `@idealworld/shared` for all data structures shared between frontend and backend.
- **Prompt Engineering**: Centralized in `server/src/llm/prompts.ts`. Use structured JSON outputs for all LLM calls.
- **State Management**: Frontend uses specialized Zustand stores (slices) to minimize re-renders. High-frequency SSE updates are debounced via `requestAnimationFrame`.
- **Performance**: High-concurrency operations (like fetching 100 agent intents) should use the concurrency pool and Map-Reduce strategies defined in the orchestration layer.

---

## Key Files for Reference
- `server/src/llm/prompts.ts`: The source of truth for all AI behaviors.
- `server/src/mechanics/physicsEngine.ts`: The deterministic rules of the world.
- `server/src/db/schema.ts`: Database structure.
- `web/src/stores/simulationStore.ts`: Frontend simulation state and SSE handling.
- `Documents/CODEBASE_EXPLAIN.md`: Detailed logic walkthrough.
