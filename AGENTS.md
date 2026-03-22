# Repository Guidelines

## Project Structure & Module Organization
This repository is a TypeScript workspace with three packages:

- `web/`: Vite + React frontend. Pages live in `web/src/pages`, shared UI in `web/src/components`, API clients in `web/src/api`, and Zustand stores in `web/src/stores`.
- `server/`: Express backend. HTTP routes are in `server/src/routes`, orchestration and simulation logic in `server/src/orchestration`, deterministic mechanics in `server/src/mechanics`, and SQLite/Drizzle code in `server/src/db`.
- `shared/`: Cross-package domain types exported from `shared/src`.

Reference material and historical design notes are under `Documents/`. Generated simulation examples live in `SimulationResult/`.

## Build, Test, and Development Commands
- `npm install`: install workspace dependencies.
- `npm run dev`: start server and web app together.
- `npm run dev:server`: run only the backend on `http://127.0.0.1:3001`.
- `npm run dev:web`: run only the frontend on `http://localhost:5173`.
- `npm run build`: build `shared`, then `server`, then `web`.
- `npm run lint -w web`: run the configured ESLint checks for the frontend.

There is no single root test command yet. Current integration scripts are run directly, for example:

- `npx tsx server/src/llm/__tests__/phase2.test.ts`
- `npx tsx server/src/cognition/__tests__/phase3.test.ts`
- `npx tsx server/src/mechanics/__tests__/physics_sandbox.ts --json`

## Coding Style & Naming Conventions
Use TypeScript throughout and match the surrounding file style before editing. Follow existing naming patterns:

- React components and page files: `PascalCase` (`HomePage.tsx`, `TelemetryPanel.tsx`)
- Stores, APIs, and utilities: `camelCase` file names (`simulationStore.ts`, `settings.ts`)
- Shared types and interfaces: `PascalCase`

Prefer small, focused modules. Keep route handlers thin and move simulation or provider logic into `orchestration/`, `mechanics/`, or `llm/`. Frontend linting is defined in `web/eslint.config.js`.

## Testing Guidelines
Add tests next to the server subsystem they cover under `__tests__/`. Use `*.test.ts` for assertion-driven scripts and keep sandbox-style runners descriptive. For simulation changes, validate both deterministic mechanics and any affected route or orchestration path.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Fixed bugs.` and `Add GUI physics config & sandbox test`. Prefer clear, specific summaries like `Add reflection retry guard`.

Pull requests should include:

- a concise description of behavior changes
- linked issues or design notes when relevant
- screenshots or API examples for UI/contract changes
- the exact commands run for build, lint, and tests

## Security & Configuration Tips
This project is local-first and stores data in a local SQLite database (`~/.idealworld/idealworld.db`). Do not commit API keys, provider secrets, or local database artifacts.
