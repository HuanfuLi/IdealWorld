# GEMINI.md - Ideal World Project Context

## Project Overview
**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies of 20 to 150+ "Citizen Agents" interacting in high-resolution turn-based iterations, guided by an omniscient "Central Agent". The project uses a **Neuro-Symbolic Engine**, combining LLM-driven intentions with a deterministic physics/economic engine to ensure resource constraints and psychological realism (e.g., *MET Metabolism*, *Allostatic Load*).

### Key Technologies
- **Architecture**: Monorepo using npm workspaces (`web`, `server`, `shared`).
- **Backend**: Node.js (Express), TypeScript, SQLite (Drizzle ORM), multi-provider LLM gateway (Anthropic, OpenAI, Gemini, Vertex).
- **Frontend**: React 19, TypeScript, Zustand (State Management), Tailwind CSS, Vite.
- **Data Storage**: Local SQLite database stored in `~/.idealworld/idealworld.db` with async batch flushing.
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
  - `src/mechanics/`: Deterministic physics engine, MET metabolism, Allostatic Load, and AMM.
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
- **Intent Phase**: Citizen Agents output intentions and standard `ActionCodes` as a **Multi-Action Queue** (up to 3 actions per turn).
- **Resolution Phase**: The **Physics Engine** calculates exact numerical changes. This includes:
  - **MET Metabolism**: Caloric burn based on task intensity and age/weight modifiers.
  - **Allostatic Load**: Psychosomatic decay where chronic stress (Cortisol) leads to permanent health damage.
  - **Constant Product AMM ($x \cdot y = k$)**: Algorithmic market maker for commodity trading (Food, Raw Materials, Luxury).
  - **Demurrage & UBI**: 2% wealth tax redistributed to prevent liquidity traps.

### Coding Style & Standards
- **Local-First**: All data stays on the user's machine. Configuration is stored in `~/.idealworld/config.json`.
- **Type Safety**: Use `@idealworld/shared` for all data structures shared between frontend and backend.
- **Prompt Engineering**: Centralized in `server/src/llm/prompts.ts`. Use structured JSON outputs for all LLM calls.
- **State Management**: Frontend uses specialized Zustand stores (slices) to minimize re-renders. High-frequency SSE updates are debounced via `requestAnimationFrame`.
- **Performance**: High-concurrency operations should use the HMAS Map-Reduce strategies and concurrency pool.

---

## Key Files for Reference
- `server/src/llm/prompts.ts`: The source of truth for all AI behaviors.
- `server/src/mechanics/allostaticEngine.ts`: Physiological and psychosomatic logic.
- `server/src/mechanics/automatedMarketMaker.ts`: Algorithmic economy and UBI.
- `server/src/orchestration/simulationRunner.ts`: The core simulation loop and Map-Reduce logic.
- `server/src/db/schema.ts`: Database structure.
- `web/src/stores/simulationStore.ts`: Frontend simulation state and SSE handling.
- `Documents/CODEBASE_OVERVIEW.md`: Comprehensive architectural overview.
