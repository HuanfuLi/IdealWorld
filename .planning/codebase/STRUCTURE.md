# Codebase Structure

**Analysis Date:** 2024-03-24

## Directory Layout

```
IdealWorld/
├── server/             # Express.js backend (Core logic)
│   ├── src/
│   │   ├── cognition/  # Agent reasoning (Memory/Planning)
│   │   ├── db/         # Drizzle/SQLite (Persistence)
│   │   ├── llm/        # AI provider integrations
│   │   ├── mechanics/  # Deterministic simulation rules
│   │   ├── orchestration/ # Simulation loop & Managers
│   │   ├── parsers/    # LLM output validation
│   │   ├── routes/     # API endpoints (REST/SSE)
│   │   └── index.ts    # Server entry point
├── web/                # React/Vite frontend
│   ├── src/
│   │   ├── api/        # Client-side API services
│   │   ├── components/ # Shared React components
│   │   ├── pages/      # Main UI views
│   │   ├── stores/     # Zustand state management
│   │   └── main.tsx    # Frontend entry point
├── shared/             # Shared TypeScript types
│   └── src/
├── Documents/          # Documentation and Design Specs
└── package.json        # Monorepo configuration
```

## Directory Purposes

**server/src/orchestration:**
- Purpose: The "Brain" of the backend. It coordinates the complex flow between AI and hardcoded rules.
- Contains: `simulationRunner.ts` (Main loop logic), `simulationManager.ts` (SSE/In-memory state), `governanceManager.ts`.
- Key files: `server/src/orchestration/simulationRunner.ts`

**server/src/mechanics:**
- Purpose: Defines the immutable "laws" of the simulated world (Physics, Economy, Physiology).
- Contains: `physicsEngine.ts` (Stat changes), `automatedMarketMaker.ts` (Economy logic), `allostaticEngine.ts` (Stress/Metabolism).
- Key files: `server/src/mechanics/physicsEngine.ts`

**server/src/cognition:**
- Purpose: Implements higher-order agent logic using Large Language Models.
- Contains: `cognitiveEngine.ts` (Agent brain), `memoryStream.ts` (Agent memory), `recursivePlanner.ts`.
- Key files: `server/src/cognition/cognitiveEngine.ts`

**server/src/llm:**
- Purpose: Multi-provider AI abstraction layer.
- Contains: `gateway.ts` (Provider switching), `prompts.ts` (Core AI prompts), `retryWithHealing.ts`.
- Key files: `server/src/llm/gateway.ts`, `server/src/llm/prompts.ts`

**web/src/pages:**
- Purpose: Main application views for monitoring and controlling simulations.
- Contains: `Simulation.tsx` (Live view), `HomePage.tsx`, `SettingsPage.tsx`.
- Key files: `web/src/pages/Simulation.tsx`

**shared/src:**
- Purpose: Single source of truth for TypeScript types used in both `web` and `server`.
- Key files: `shared/src/types.ts`

## Key File Locations

**Entry Points:**
- `server/src/index.ts`: Backend Express app entry.
- `web/src/main.tsx`: Frontend React entry.

**Configuration:**
- `server/src/settings.ts`: Server-side configuration (Model choices, concurrency).
- `server/src/db/schema.ts`: Database table definitions.
- `web/vite.config.ts`: Frontend build configuration.

**Core Logic:**
- `server/src/orchestration/simulationRunner.ts`: The main simulation loop logic.
- `server/src/llm/prompts.ts`: The primary prompts that define agent and central agent behavior.

**Testing:**
- `server/src/llm/__tests__/phase2.test.ts`: LLM integration tests.
- `server/src/mechanics/__tests__/physics_sandbox.ts`: Physics engine validation.

## Naming Conventions

**Files:**
- TypeScript: camelCase for utility/logic files (`simulationManager.ts`).
- React Components: PascalCase (`Simulation.tsx`).
- Tests: `[name].test.ts` or `[name]_sandbox.ts`.

**Directories:**
- Folders: camelCase (`src/db/repos`).

## Where to Add New Code

**New Feature (e.g., Religion System):**
- Primary code (Rules): `server/src/mechanics/religionEngine.ts`
- Primary code (Agent reasoning): `server/src/cognition/beliefSystem.ts`
- Prompting: `server/src/llm/prompts.ts`
- Persistence: `server/src/db/schema.ts`
- UI View: `web/src/pages/ReligionView.tsx`

**New Component/Module:**
- Implementation: `web/src/components/[ComponentName].tsx`

**Utilities:**
- Shared helpers: `server/src/utils/` (if added) or `shared/src/` if needed by frontend.

## Special Directories

**node_modules:**
- Purpose: External dependencies.
- Generated: Yes.
- Committed: No.

**dist:**
- Purpose: Compiled output for server and web.
- Generated: Yes.
- Committed: No.

---

*Structure analysis: 2024-03-24*
