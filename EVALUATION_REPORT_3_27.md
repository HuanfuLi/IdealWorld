# Evaluation Report 3/27

## Scope
This review covered the TypeScript workspace across `web/`, `server/`, and `shared/` with a focus on:

- dead code or orphaned paths
- logic and state-management errors
- maintainability debt
- overall structural health

## Validation Notes
- `shared` TypeScript build passed.
- `server` TypeScript build passed.
- `web` TypeScript project build passed up to the Vite/esbuild spawn step; the final Vite build could not complete in this sandbox because of `spawn EPERM`, not because of a TypeScript error.
- `npm run lint -w web` failed with 44 problems (27 errors, 17 warnings). Several of the findings below are confirmed by that lint run.
- `npm test -w server` could not complete in this sandbox because Vitest also hit `spawn EPERM` while bundling config.

## Confirmed Logic Errors
### 1. Review page forces premature session completion
- File: [web/src/pages/AgentReview.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/AgentReview.tsx#L40)
- When the review page loads, it immediately patches the session stage to `completed` unless it is already `completed` or `reviewing`.
- This collapses the distinction between “currently in review” and “finished review,” and can hide in-progress state from other screens and future workflow checks.

### 2. Hook callback ordering creates unstable runtime behavior
- File: [web/src/pages/AgentReview.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/AgentReview.tsx#L53)
- The effect at lines 53-62 calls `loadChatHistory` before that `const` function is declared at lines 64-77.
- File: [web/src/pages/Reflection.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/Reflection.tsx#L56)
- The effect at lines 56-63 calls `loadSocietyStats` before that `const` function is declared at lines 65-73.
- React lint correctly flags both. These patterns are brittle and can fail depending on render timing and closure semantics.

### 3. Session stage updates are completely unvalidated server-side
- File: [server/src/routes/sessions.ts](/C:/Users/16079/Code/IdealWorld/server/src/routes/sessions.ts#L265)
- `PATCH /api/sessions/:id/stage` accepts any truthy string and writes it directly to the database.
- This allows impossible or misspelled stages, breaks workflow integrity, and makes the UI dependent on well-behaved clients rather than server invariants.

### 4. Settings page renders duplicate local endpoint controls
- File: [web/src/pages/SettingsPage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/SettingsPage.tsx#L255)
- File: [web/src/pages/SettingsPage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/SettingsPage.tsx#L321)
- For `provider === 'local'`, the endpoint field is rendered once inside the provider-specific branch and then again in a separate conditional block.
- This is user-visible duplication and a signal that rendering logic has drifted.

### 5. Home page export flow mutates global location directly
- File: [web/src/pages/HomePage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/HomePage.tsx#L61)
- `window.location.href = ...` is flagged by the current React lint rules and bypasses the app’s normal data-flow/navigation patterns.
- It is likely to remain functional, but it is an avoidable imperative escape hatch in a React surface.

## Dead Code And Orphaned Paths
### 1. Unused variables and parameters are accumulating in production code
- File: [web/src/pages/AgentReview.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/AgentReview.tsx#L32)
- File: [web/src/stores/reflectionStore.ts](/C:/Users/16079/Code/IdealWorld/web/src/stores/reflectionStore.ts#L53)
- File: [web/src/pages/SettingsPage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/SettingsPage.tsx#L217)
- File: [web/src/pages/SettingsPage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/SettingsPage.tsx#L431)
- Lint reports unused values such as `session`, `get`, `needsApiKey`, and a `savedKeysMap` instance in the citizen provider block.
- These are small individually, but together they indicate stale branches and partially removed implementations.

### 2. Telemetry charting duplicates a second chart implementation
- File: [web/src/components/LineChart.tsx](/C:/Users/16079/Code/IdealWorld/web/src/components/LineChart.tsx)
- File: [web/src/components/TelemetryPanel.tsx](/C:/Users/16079/Code/IdealWorld/web/src/components/TelemetryPanel.tsx#L30)
- The repo maintains both a generic `LineChart` component and a separate in-file `SVGLineChart` implementation.
- This is not dead code in the strict sense, but it is duplicated UI infrastructure with overlapping responsibility.

### 3. Home page intentionally hides `idea-input` sessions
- File: [web/src/pages/HomePage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/HomePage.tsx#L131)
- Sessions in the earliest stage are filtered out of the dashboard entirely.
- If the product intends drafts to remain resumable, those sessions become effectively orphaned from the main UI.

## Tech Debt
### 1. Widespread hook dependency suppression and stale-closure risk
- Files affected include:
  - [web/src/pages/Brainstorming.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/Brainstorming.tsx)
  - [web/src/pages/DesignReview.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/DesignReview.tsx)
  - [web/src/pages/Reflection.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/Reflection.tsx)
  - [web/src/pages/Simulation.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/Simulation.tsx)
  - [web/src/pages/HomePage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/HomePage.tsx)
- The lint run shows many missing dependency warnings in effects and callbacks.
- This is a structural reliability debt: behavior becomes dependent on incidental render order rather than explicit state transitions.

### 2. Type safety is being bypassed in several UI surfaces
- Files affected include:
  - [web/src/api/sessions.ts](/C:/Users/16079/Code/IdealWorld/web/src/api/sessions.ts#L4)
  - [web/src/stores/compareStore.ts](/C:/Users/16079/Code/IdealWorld/web/src/stores/compareStore.ts)
  - [web/src/pages/SettingsPage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/SettingsPage.tsx#L183)
  - [web/src/pages/Simulation.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/Simulation.tsx)
- `any` is still present in API/store/page code even though the project already has a substantial shared type layer.
- This weakens the value of the `shared/` package and increases regression risk during workflow changes.

### 3. State transitions are spread across pages, stores, and routes
- Files affected include:
  - [web/src/App.tsx](/C:/Users/16079/Code/IdealWorld/web/src/App.tsx)
  - [web/src/pages/HomePage.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/HomePage.tsx)
  - [web/src/pages/Reflection.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/Reflection.tsx)
  - [web/src/pages/AgentReview.tsx](/C:/Users/16079/Code/IdealWorld/web/src/pages/AgentReview.tsx)
  - [server/src/routes/sessions.ts](/C:/Users/16079/Code/IdealWorld/server/src/routes/sessions.ts#L265)
- Stage logic currently exists in multiple places: UI routing maps, page-level effects, server mutation endpoints, and orchestration code.
- The result is high coupling around workflow state and a higher chance of contradictory behavior.

### 4. Store responsibilities are broad and page-driven
- File: [web/src/stores/sessionDetailStore.ts](/C:/Users/16079/Code/IdealWorld/web/src/stores/sessionDetailStore.ts)
- The store mixes session loading, brainstorm chat, refinement chat, design SSE handling, simulation kickoff, forking, and config mutation.
- It works, but it concentrates unrelated responsibilities in one large mutable surface.

### 5. Server startup sequencing is optimistic
- File: [server/src/index.ts](/C:/Users/16079/Code/IdealWorld/server/src/index.ts#L35)
- Migrations are invoked directly before `listen`, but there is no startup guard, no failure boundary, and no explicit boot sequence.
- Today this is low risk because the migration path is synchronous, but the startup contract is fragile if DB initialization grows more complex.

## Code Structure Evaluation
### Current structure
- The top-level package split is sensible:
  - `web/` handles UI, pages, stores, and API clients.
  - `server/` separates routes, orchestration, mechanics, cognition, LLM, and DB code.
  - `shared/` centralizes domain types.
- The backend folder layout is especially understandable at a high level and gives the project room to grow.

### Structural concerns
- Workflow state is too distributed across page components, Zustand stores, and ad hoc route mutations.
- Some frontend pages are doing both orchestration and rendering, which makes behavior harder to reason about.
- There is visible duplication in charting/UI utility code and repeated provider/settings form logic.
- The shared type layer is good, but it is not enforced consistently enough in the web package.

### Maintainability assessment
- The codebase is still maintainable, but it is trending toward coordination complexity rather than local complexity.
- The main risk is not raw size yet; it is that important behavior depends on conventions spread across many files instead of a smaller number of explicit state boundaries.
