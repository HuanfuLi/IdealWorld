# Ideal World

Ideal World is a local-first TypeScript workspace for designing, simulating, reflecting on, and comparing LLM-driven micro-societies. It combines LLM-based intent generation with deterministic mechanics for stats, markets, physiology, and telemetry.

## What It Does

The application supports a full session lifecycle:

1. Idea input
2. Brainstorming
3. Design generation and refinement
4. Simulation
5. Reflection
6. Review / comparison

In simulation, citizen agents produce intents through LLM prompts, the central agent resolves society-level outcomes, and deterministic mechanics apply the actual economic and physiological effects.

## Workspace Layout

- `web/`: Vite + React frontend
- `server/`: Express API, orchestration, mechanics, persistence
- `shared/`: shared domain types and economy primitives
- `Documents/`: architecture notes, changelogs, design analysis
- `SimulationResult/`: exported sample result files

## Current Core Systems

- Multi-provider LLM gateway for Anthropic, OpenAI, Gemini, Vertex, and local-compatible endpoints
- Session-based workflow with persisted stage transitions
- Deterministic simulation loop with SSE updates to the frontend
- Physics and action-resolution engine
- MET-based metabolism and allostatic load persistence
- Closed-loop economy with order books, AMM state snapshots, and per-agent economy state
- Reflection, review, comparison, artifact browsing, and import/export flows
- Local SQLite persistence with Drizzle schema plus direct `better-sqlite3` hot paths where needed

## Tech Stack

- Frontend: React 19, Vite, Zustand, React Router, lucide-react
- Backend: Express, TypeScript, Drizzle ORM, `better-sqlite3`
- Shared: TypeScript package with session, agent, iteration, and economy types
- Realtime transport: Server-Sent Events

## Development

Install dependencies:

```bash
npm install
```

Run the full app:

```bash
npm run dev
```

Run backend only:

```bash
npm run dev:server
```

Run frontend only:

```bash
npm run dev:web
```

Build all packages:

```bash
npm run build
```

Lint the frontend:

```bash
npm run lint -w web
```

## Testing

There is no single root test command yet. Existing executable test and sandbox scripts include:

```bash
npx tsx server/src/llm/__tests__/phase2.test.ts
npx tsx server/src/cognition/__tests__/phase3.test.ts
npx tsx server/src/mechanics/__tests__/physics_sandbox.ts --json
```

## Data and Persistence

- Primary database: `~/.idealworld/idealworld.db`
- Sessions, agents, iterations, reflections, messages, and economy state are stored locally
- Simulation telemetry is embedded into iteration statistics and exposed through export and telemetry endpoints
- AMM and physiological state are persisted so pause/resume and restart flows can recover state

## Main User Surfaces

The current frontend includes pages for:

- Home / session listing
- Idea input
- Brainstorming
- Design review
- Simulation
- Reflection
- Agent review
- Compare sessions
- Artifacts
- Physics laboratory
- Settings

## Notes

- This repository is local-first and intentionally stores no cloud-side project state.
- Do not commit API keys, local database files, or provider secrets.
- Historical notes in `Documents/Legacy/` may not reflect the latest implementation.

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
