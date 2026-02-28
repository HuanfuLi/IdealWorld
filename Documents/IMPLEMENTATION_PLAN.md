# Ideal World — Implementation Plan

This document defines the modular component architecture and phased implementation strategy for Ideal World. The goal is to build an MVP first with a small number of components, then incrementally add features while keeping the codebase simple and each piece independently testable.

Reference documents: [USER_FLOW.md](./USER_FLOW.md) · [PROJECT_DESIGN.md](./PROJECT_DESIGN.md) · [UI_DESIGNS.md](./UI_DESIGNS.md)

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Component Map](#2-component-map)
3. [Component Details](#3-component-details)
4. [Dependency Graph](#4-dependency-graph)
5. [Implementation Phases](#5-implementation-phases)
6. [MVP Scope](#6-mvp-scope)
7. [Phase Details](#7-phase-details)

---

## 1. Project Structure

A flat monorepo with three packages. No Turborepo or complex build tooling — just npm workspaces.

```
ideal-world/
├── package.json                    # Root workspace config
├── packages/
│   ├── shared/                     # Shared types, validators, constants
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/              # All TypeScript interfaces
│   │       │   ├── session.ts
│   │       │   ├── agent.ts
│   │       │   ├── iteration.ts
│   │       │   ├── conversation.ts
│   │       │   ├── artifact.ts
│   │       │   └── index.ts
│   │       ├── validators/         # Zod schemas matching each type
│   │       │   ├── session.ts
│   │       │   ├── agent.ts
│   │       │   ├── iteration.ts
│   │       │   └── index.ts
│   │       ├── constants.ts        # Stage names, stat bounds, defaults
│   │       └── index.ts
│   │
│   ├── backend/                    # Express server + all backend logic
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Server entry point
│   │       ├── db/                 # C1: Database Layer
│   │       │   ├── schema.ts       # Drizzle table definitions
│   │       │   ├── migrate.ts      # Migration runner
│   │       │   ├── connection.ts   # SQLite connection setup
│   │       │   └── repos/          # One repo per domain
│   │       │       ├── session.repo.ts
│   │       │       ├── agent.repo.ts
│   │       │       ├── iteration.repo.ts
│   │       │       ├── conversation.repo.ts
│   │       │       ├── artifact.repo.ts
│   │       │       └── index.ts
│   │       ├── llm/                # C2: LLM Gateway
│   │       │   ├── gateway.ts      # Provider-agnostic interface
│   │       │   ├── providers/
│   │       │   │   ├── openai-compatible.ts  # LM Studio, Ollama, OpenAI
│   │       │   │   └── anthropic.ts          # Claude API via SDK
│   │       │   ├── rate-limiter.ts
│   │       │   ├── concurrency-pool.ts
│   │       │   └── index.ts
│   │       ├── prompts/            # C3: Prompt Builder
│   │       │   ├── brainstorm.ts   # Stage 1A prompts
│   │       │   ├── design.ts       # Stage 1B prompts
│   │       │   ├── refinement.ts   # Stage 1C prompts
│   │       │   ├── citizen-intent.ts   # Stage 2 agent intent prompt
│   │       │   ├── resolution.ts   # Stage 2 Central Agent resolution
│   │       │   ├── reflection.ts   # Stage 3 prompts (both passes)
│   │       │   ├── evaluation.ts   # Stage 3 Society Evaluation
│   │       │   ├── review.ts       # Stage 4 agent Q&A prompt
│   │       │   ├── comparison.ts   # Cross-session comparison
│   │       │   ├── final-report.ts # End of Stage 2
│   │       │   └── index.ts
│   │       ├── orchestration/      # C4: Orchestration Engine
│   │       │   ├── engine.ts       # Main orchestration class
│   │       │   ├── simulation-runner.ts   # Iteration loop
│   │       │   ├── intent-collector.ts    # Parallel agent intent gathering
│   │       │   ├── resolver.ts            # Central Agent resolution
│   │       │   ├── map-reduce.ts          # Hierarchical resolution for >50 agents
│   │       │   ├── lifecycle.ts           # Death, birth, role change logic
│   │       │   ├── statistics.ts          # Aggregate stat computation
│   │       │   └── index.ts
│   │       ├── routes/             # C5: API Server
│   │       │   ├── sessions.ts     # CRUD + stage transitions
│   │       │   ├── brainstorm.ts   # Stage 1A chat endpoint
│   │       │   ├── design.ts       # Stage 1B generation trigger
│   │       │   ├── refinement.ts   # Stage 1C chat endpoint
│   │       │   ├── simulation.ts   # Start/pause/resume + SSE stream
│   │       │   ├── reflection.ts   # Trigger reflection generation
│   │       │   ├── review.ts       # Stage 4 agent Q&A
│   │       │   ├── comparison.ts   # Cross-session comparison
│   │       │   ├── artifacts.ts    # Artifact listing and retrieval
│   │       │   ├── settings.ts     # LLM provider config
│   │       │   └── index.ts        # Router aggregation
│   │       ├── parsers/            # C6: Response Parsers
│   │       │   ├── agent-intent.ts
│   │       │   ├── resolution.ts
│   │       │   ├── design.ts
│   │       │   ├── reflection.ts
│   │       │   └── index.ts
│   │       └── config.ts           # Settings file I/O
│   │
│   └── frontend/                   # React SPA
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── tailwind.config.ts
│       └── src/
│           ├── main.tsx            # React entry point
│           ├── App.tsx             # Router setup
│           ├── api/                # C7: API Client
│           │   ├── client.ts       # Fetch wrapper
│           │   ├── sse.ts          # SSE connection handler
│           │   ├── sessions.ts     # Session API calls
│           │   ├── simulation.ts   # Simulation API calls
│           │   └── index.ts
│           ├── stores/             # C8: State Management
│           │   ├── session.store.ts
│           │   ├── brainstorm.store.ts
│           │   ├── simulation.store.ts
│           │   ├── review.store.ts
│           │   ├── comparison.store.ts
│           │   ├── settings.store.ts
│           │   └── index.ts
│           ├── components/         # C9: Shared UI Components
│           │   ├── layout/
│           │   │   ├── AppShell.tsx
│           │   │   ├── Sidebar.tsx
│           │   │   └── Breadcrumb.tsx
│           │   ├── chat/
│           │   │   ├── ChatMessageList.tsx
│           │   │   ├── ChatBubble.tsx
│           │   │   ├── ChatInput.tsx
│           │   │   └── index.ts
│           │   ├── markdown/
│           │   │   └── MarkdownViewer.tsx
│           │   ├── charts/
│           │   │   ├── StatChart.tsx
│           │   │   └── DistributionChart.tsx
│           │   └── common/
│           │       ├── ProgressBar.tsx
│           │       ├── StatBadge.tsx
│           │       ├── ConfirmDialog.tsx
│           │       └── LoadingSpinner.tsx
│           └── pages/              # C10: Page Components
│               ├── HomePage.tsx
│               ├── IdeaInputPage.tsx
│               ├── BrainstormPage.tsx
│               ├── DesignReviewPage.tsx
│               ├── RefinementPage.tsx
│               ├── SimulationPage.tsx
│               ├── ReflectionPage.tsx
│               ├── ReviewPage.tsx
│               ├── ArtifactsPage.tsx
│               ├── ComparisonPage.tsx
│               └── SettingsPage.tsx
```

---

## 2. Component Map

The system is split into **10 components** across 3 packages. Each component has a single responsibility and clear boundaries.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SHARED PACKAGE                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Types · Validators · Constants                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────────┘
                    used by both ▼ backend and frontend
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND                                                                │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ C1: DB   │  │ C2: LLM  │  │ C3:Prompt│  │C6:Parser │              │
│  │ Layer    │  │ Gateway  │  │ Builder  │  │          │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │              │                     │
│       └──────────────┴──────┬───────┴──────────────┘                    │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │ C4: Orchestration│                                  │
│                    │ Engine           │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │ C5: API Server  │                                  │
│                    │ (Routes + SSE)  │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │ HTTP / SSE
┌─────────────────────────────┼───────────────────────────────────────────┐
│  FRONTEND                   │                                           │
│                    ┌────────▼────────┐                                  │
│                    │ C7: API Client  │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │ C8: Zustand     │                                  │
│                    │ Stores          │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│              ┌──────────────┼──────────────┐                            │
│              │              │              │                             │
│     ┌────────▼────┐  ┌─────▼──────┐                                   │
│     │ C9: Shared  │  │ C10: Page  │                                   │
│     │ UI Comps    │  │ Components │                                   │
│     └─────────────┘  └────────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Details

### C1: Database Layer

**Location:** `packages/backend/src/db/`

**Responsibility:** All SQLite interactions. Schema definition, migrations, and repository classes for CRUD operations on each table.

**Key files:**
| File | Purpose |
|---|---|
| `schema.ts` | Drizzle ORM table definitions matching PROJECT_DESIGN.md Section 10.2 |
| `connection.ts` | Create/open SQLite database, run migrations on startup |
| `repos/session.repo.ts` | Session CRUD, stage transitions, metadata queries |
| `repos/agent.repo.ts` | Agent CRUD, bulk insert, stat updates, lifecycle status |
| `repos/iteration.repo.ts` | Iteration records, intent/resolved action storage |
| `repos/conversation.repo.ts` | Chat message storage per context |
| `repos/artifact.repo.ts` | Artifact storage and retrieval |

**Dependencies:** `@ideal-world/shared` (types)

**Test strategy:** Unit tests with in-memory SQLite. Test each repo method independently.

---

### C2: LLM Gateway

**Location:** `packages/backend/src/llm/`

**Responsibility:** Provider-agnostic LLM communication. Handles API calls, streaming, rate limiting, retries, and concurrency pooling.

**Key files:**
| File | Purpose |
|---|---|
| `gateway.ts` | `LLMGateway` class: wraps the active provider, adds retry/error handling |
| `providers/openai-compatible.ts` | LM Studio, Ollama, OpenAI — all use the same chat completions API |
| `providers/anthropic.ts` | Claude API via `@anthropic-ai/sdk` |
| `rate-limiter.ts` | Token-per-minute tracking, backoff on 429s |
| `concurrency-pool.ts` | Configurable parallel request limit, priority queue |

**Dependencies:** `@anthropic-ai/sdk`, `openai` (npm package)

**Test strategy:** Unit tests with mock HTTP responses. Integration test with a real local LLM (manual).

---

### C3: Prompt Builder

**Location:** `packages/backend/src/prompts/`

**Responsibility:** Constructs the system prompts and user messages for every LLM call in the application. Pure functions — no side effects, no I/O.

**Key files:**
| File | Purpose |
|---|---|
| `brainstorm.ts` | Stage 1A: Central Agent brainstorming prompt with checklist extraction |
| `design.ts` | Stage 1B: Multi-step society design prompts (overview, law, roster, backgrounds, stats) |
| `refinement.ts` | Stage 1C: Central Agent refinement prompt with current design as context |
| `citizen-intent.ts` | Stage 2: Citizen Agent intent prompt with background, stats, law, previous summary |
| `resolution.ts` | Stage 2: Central Agent resolution prompt with all intents |
| `final-report.ts` | Stage 2 end: Final State Report prompt |
| `reflection.ts` | Stage 3: Pass 1 (personal) and Pass 2 (post-briefing) prompts |
| `evaluation.ts` | Stage 3: Society Evaluation prompt |
| `review.ts` | Stage 4: Agent Q&A prompt with full context |
| `comparison.ts` | Cross-session comparison prompt |

**Dependencies:** `@ideal-world/shared` (types, constants)

**Test strategy:** Unit tests — verify prompt structure, token estimation, context truncation logic. Snapshot tests for prompt templates.

---

### C4: Orchestration Engine

**Location:** `packages/backend/src/orchestration/`

**Responsibility:** Coordinates the multi-step workflows: design generation, simulation iteration loop, reflection pipeline. Connects prompts, LLM, parsing, and database.

**Key files:**
| File | Purpose |
|---|---|
| `engine.ts` | Top-level `OrchestrationEngine` class — entry point for all workflows |
| `simulation-runner.ts` | Iteration loop: for each iteration, gather intents → resolve → save |
| `intent-collector.ts` | Parallel agent intent gathering via concurrency pool |
| `resolver.ts` | Central Agent resolution (direct mode for ≤50 agents) |
| `map-reduce.ts` | Hierarchical resolution for >50 agents (post-MVP) |
| `lifecycle.ts` | Death/birth/role-change logic applied after resolution (post-MVP) |
| `statistics.ts` | Compute iteration statistics: averages, min/max, distributions, Gini |

**Dependencies:** C1 (DB), C2 (LLM), C3 (Prompts), C6 (Parsers)

**Test strategy:** Integration tests with mocked LLM. Run a 5-agent, 3-iteration simulation end-to-end and verify DB state.

---

### C5: API Server

**Location:** `packages/backend/src/routes/`

**Responsibility:** Express HTTP routes and SSE endpoints. Thin layer — validates requests, delegates to orchestration engine, returns responses.

**Key files:**
| File | Purpose |
|---|---|
| `sessions.ts` | `POST/GET/DELETE /api/sessions` — CRUD |
| `brainstorm.ts` | `POST /api/sessions/:id/brainstorm` — send message, return streamed response |
| `design.ts` | `POST /api/sessions/:id/design` — trigger design generation |
| `refinement.ts` | `POST /api/sessions/:id/refine` — send refinement request |
| `simulation.ts` | `POST /api/sessions/:id/simulate`, `pause`, `GET stream` — simulation control + SSE |
| `reflection.ts` | `POST /api/sessions/:id/reflect` — trigger reflection |
| `review.ts` | `POST /api/sessions/:id/review/:agentId` — Q&A message |
| `comparison.ts` | `POST /api/compare` — cross-session comparison |
| `artifacts.ts` | `GET /api/sessions/:id/artifacts` — list and get artifacts |
| `settings.ts` | `GET/PUT /api/settings`, `POST /api/settings/test` — LLM config |

**Dependencies:** C4 (Orchestration), C1 (DB for direct queries)

**Test strategy:** Integration tests with supertest. Mock orchestration engine.

---

### C6: Response Parsers

**Location:** `packages/backend/src/parsers/`

**Responsibility:** Parse and validate LLM responses. Extract structured data from JSON responses. Handle malformed output with fallback strategies.

**Key files:**
| File | Purpose |
|---|---|
| `agent-intent.ts` | Parse Citizen Agent intent JSON, validate schema, extract fields |
| `resolution.ts` | Parse Central Agent resolution: per-agent stats, lifecycle events, narrative |
| `design.ts` | Parse design outputs: overview, law doc, agent roster with stats |
| `reflection.ts` | Parse reflection responses (both passes) |

**Dependencies:** `@ideal-world/shared` (validators/zod schemas)

**Test strategy:** Unit tests with sample LLM outputs (valid, malformed, edge cases).

---

### C7: API Client

**Location:** `packages/frontend/src/api/`

**Responsibility:** Frontend HTTP client. Wraps fetch calls to the backend API. Handles SSE connections for real-time simulation updates.

**Key files:**
| File | Purpose |
|---|---|
| `client.ts` | Base fetch wrapper with error handling, JSON parsing |
| `sse.ts` | SSE connection manager: connect, reconnect, event dispatch |
| `sessions.ts` | Session CRUD calls |
| `simulation.ts` | Simulation control calls (start, pause, resume) |

**Dependencies:** None (plain fetch)

**Test strategy:** Unit tests with msw (Mock Service Worker).

---

### C8: State Management (Zustand Stores)

**Location:** `packages/frontend/src/stores/`

**Responsibility:** Client-side state management. Six independent Zustand stores, one per domain. Each store calls the API client and manages its own slice of state.

**Stores:** `session`, `brainstorm`, `simulation`, `review`, `comparison`, `settings`

**Dependencies:** C7 (API Client), `@ideal-world/shared` (types)

**Test strategy:** Unit tests — call store actions with mocked API, verify state transitions.

---

### C9: Shared UI Components

**Location:** `packages/frontend/src/components/`

**Responsibility:** Reusable UI building blocks used across multiple pages. Not page-specific.

**Groups:**
| Group | Components |
|---|---|
| `layout/` | `AppShell`, `Sidebar`, `Breadcrumb` |
| `chat/` | `ChatMessageList`, `ChatBubble`, `ChatInput` — reused in Stages 1A, 1C, 4, and Comparison |
| `markdown/` | `MarkdownViewer` — renders markdown content for artifacts, law docs, reports |
| `charts/` | `StatChart` (line chart for stat trends), `DistributionChart` (histogram) |
| `common/` | `ProgressBar`, `StatBadge`, `ConfirmDialog`, `LoadingSpinner` |

**Dependencies:** Tailwind CSS, Recharts (for charts), react-markdown

**Test strategy:** Component tests with React Testing Library. Visual snapshot tests.

---

### C10: Page Components

**Location:** `packages/frontend/src/pages/`

**Responsibility:** One component per route. Composes shared components (C9) and connects to stores (C8). Contains page-specific layout logic.

**Pages:**
| Page | Route | Key composition |
|---|---|---|
| `HomePage` | `/` | SessionList + NewSessionButton + CompareButton |
| `IdeaInputPage` | `/session/new` | Textarea + ExamplePrompts + validation |
| `BrainstormPage` | `/session/:id/brainstorm` | Chat components + StartDesignButton + checklist bar |
| `DesignReviewPage` | `/session/:id/design` | Tabbed panels (Overview, Roster, Law) + progress indicator |
| `RefinementPage` | `/session/:id/refine` | Design panels + Chat + IterationInput + StartButton |
| `SimulationPage` | `/session/:id/simulate` | ProgressBar + LiveFeed + Charts + AgentGrid + Controls |
| `ReflectionPage` | `/session/:id/reflect` | EvaluationReport + AgentReflectionList + Stats |
| `ReviewPage` | `/session/:id/review` | AgentSelector + Chat per agent + EndSessionButton |
| `ArtifactsPage` | `/session/:id/artifacts` | DocumentTree + MarkdownViewer + Search + Export |
| `ComparisonPage` | `/compare` | SessionSelector + ComparisonReport + Chat |
| `SettingsPage` | `/settings` | ProviderSelector + ModelConfig + TestConnection |

**Dependencies:** C8 (Stores), C9 (Shared Components)

**Test strategy:** E2E tests with Playwright for critical paths.

---

## 4. Dependency Graph

```
                     @ideal-world/shared
                    (types, validators, constants)
                         │           │
                ┌────────┘           └────────┐
                ▼                              ▼
         BACKEND                          FRONTEND

  C6 Parsers ◄──── shared/validators     C7 API Client
       │                                       │
  C3 Prompts ◄──── shared/types          C8 Stores ◄── C7
       │                                       │
  C2 LLM Gateway                         C9 Shared UI
       │                                       │
  C1 DB Layer                             C10 Pages ◄── C8 + C9
       │
       └───────┐  ┌── C2
               │  │  ┌── C3
               ▼  ▼  ▼
         C4 Orchestration ◄── C6
               │
               ▼
         C5 API Server
```

**Build order** (components with no internal dependencies first):
1. `@ideal-world/shared`
2. C1 (DB), C2 (LLM), C3 (Prompts), C6 (Parsers), C7 (API Client), C9 (Shared UI) — all independent
3. C4 (Orchestration) — depends on C1, C2, C3, C6
4. C5 (API Server) — depends on C4, C1
5. C8 (Stores) — depends on C7
6. C10 (Pages) — depends on C8, C9

---

## 5. Implementation Phases

Six phases, MVP-first. Each phase produces a working, testable increment.

```
Phase 1: Foundation          → Project runs, DB works, LLM connects, settings page
Phase 2: Design Flow         → User can brainstorm and generate a society (Stages 0-1B)
Phase 3: Simulation Core     → Basic simulation loop works (Stage 2, ≤20 agents)
Phase 4: Reflection + Review → Stages 3-4 work, full session lifecycle
Phase 5: Refinement + Polish → Stage 1C, artifacts page, two-pass reflections, lifecycle
Phase 6: Scale + Extras      → Map-reduce, >50 agents, cross-session comparison, export
```

### What's in the MVP (Phases 1–4)

| Feature | MVP | Post-MVP |
|---|---|---|
| Stage 0: Idea Input | Yes | |
| Stage 1A: Brainstorming | Yes | |
| Stage 1B: Design Generation | Yes | |
| Stage 1C: Design Refinement | | Phase 5 |
| Stage 2: Simulation (≤20 agents) | Yes | |
| Stage 2: Simulation (>50 agents, map-reduce) | | Phase 6 |
| Stage 2: Agent lifecycle (death/birth/role) | | Phase 5 |
| Stage 3: Reflection (single pass only) | Yes | Two-pass in Phase 5 |
| Stage 3: Society Evaluation | Yes | |
| Stage 4: Agent Q&A | Yes | |
| Home Page + Session CRUD | Yes | |
| Settings Page | Yes | |
| Artifacts Page | | Phase 5 |
| Cross-Session Comparison | | Phase 6 |
| Session Export/Import | | Phase 6 |
| Pause/Resume Simulation | Yes (basic) | Robust in Phase 5 |

---

## 6. MVP Scope

The MVP lets a user complete the full journey: describe a society, brainstorm with the Central Agent, generate a design, run a simulation with up to 20 agents for up to 20 iterations, see reflections and an evaluation report, and ask agents questions. It covers the core value proposition end-to-end.

**Simplifications in MVP:**
- No design refinement (Stage 1C) — user accepts or restarts.
- Max ~20 agents — avoids map-reduce complexity.
- Single-pass reflections — agents reflect with the Final State Report included (no two-pass).
- No agent lifecycle events — no death, birth, or role changes. Static population.
- No artifacts page — documents are visible in their respective stage pages.
- No cross-session comparison.
- No session export/import.
- No Gini coefficient or distribution histograms — just averages and min/max.

---

## 7. Phase Details

### Phase 1: Foundation

**Goal:** Project scaffold is running. Database works. LLM connects. Settings page functional.

**Components built:**
- `@ideal-world/shared`: All types, validators, constants
- C1: Database Layer (full schema, all repos)
- C2: LLM Gateway (both providers, rate limiter, concurrency pool)
- C5: API Server (skeleton — sessions CRUD + settings endpoints only)
- C7: API Client (base client + sessions + settings)
- C8: `session.store.ts`, `settings.store.ts`
- C9: `layout/` (AppShell, Sidebar, Breadcrumb), `common/` (ProgressBar, ConfirmDialog, LoadingSpinner)
- C10: `HomePage.tsx` (session list, create, delete), `SettingsPage.tsx`

**Deliverables:**
- [ ] npm workspace setup with `shared`, `backend`, `frontend`
- [ ] Shared types and Zod validators for all data models
- [ ] SQLite schema + Drizzle ORM setup + migration runner
- [ ] All repository classes with CRUD methods
- [ ] LLM Gateway with OpenAI-compatible and Anthropic providers
- [ ] Rate limiter + concurrency pool
- [ ] Express server skeleton with session CRUD routes
- [ ] Settings routes (GET/PUT/test-connection)
- [ ] Frontend: Vite + React + Tailwind + React Router setup
- [ ] AppShell layout component (collapsible sidebar, breadcrumb)
- [ ] Home Page: session list (cards), new session button, delete with confirmation
- [ ] Settings Page: provider selector, model config, API key input, test connection
- [ ] Zustand stores for session management and settings
- [ ] API client wrapper with error handling

**Definition of done:** User can open the app, configure LLM settings, test the connection, create an empty session, see it on the home page, and delete it.

---

### Phase 2: Design Flow (Stages 0, 1A, 1B)

**Goal:** User can describe a society, brainstorm with the Central Agent, and generate a full society design.

**Components built:**
- C3: `brainstorm.ts`, `design.ts` (prompt builders)
- C6: `design.ts` (response parser)
- C4: Design generation workflow in `engine.ts`
- C5: Brainstorm route, design route
- C7: Brainstorm and design API calls
- C8: `brainstorm.store.ts`
- C9: `chat/` (ChatMessageList, ChatBubble, ChatInput), `markdown/MarkdownViewer`
- C10: `IdeaInputPage.tsx`, `BrainstormPage.tsx`, `DesignReviewPage.tsx`

**Deliverables:**
- [ ] Stage 0 page: textarea, example prompts, validation, session creation
- [ ] Central Agent brainstorming prompt with completeness checklist
- [ ] Chat interface components (reusable)
- [ ] Brainstorm route: streaming response, conversation persistence
- [ ] Completeness checklist extraction and display
- [ ] "Start Design" button with premature-click warning
- [ ] Design generation: multi-step prompt chain (overview → law → roster → backgrounds → stats)
- [ ] Design response parsing: extract overview, law doc, agent list with stats
- [ ] Agent roster validation (unique names, stats in range)
- [ ] Design Review page: tabbed panels (Overview, Agent Roster, Law Document)
- [ ] Markdown viewer for overview and law document
- [ ] Agent roster table with name, role, background, stats
- [ ] Progress indicator during design generation
- [ ] Session stage advancement from idea-input → brainstorming → designing → design-review

**Definition of done:** User can type a society idea, have a multi-turn brainstorm, click Start Design, see the generated overview/law/agents, and browse them in tabbed panels.

---

### Phase 3: Simulation Core (Stage 2, ≤20 agents)

**Goal:** Basic simulation loop works. User watches agents act and sees summaries.

**Components built:**
- C3: `citizen-intent.ts`, `resolution.ts`, `final-report.ts`
- C6: `agent-intent.ts`, `resolution.ts`
- C4: `simulation-runner.ts`, `intent-collector.ts`, `resolver.ts`, `statistics.ts`
- C5: Simulation routes + SSE stream
- C7: Simulation API calls + SSE handler
- C8: `simulation.store.ts`
- C9: `charts/StatChart`
- C10: `SimulationPage.tsx`

**Deliverables:**
- [ ] Citizen Agent intent prompt builder
- [ ] Agent intent JSON parser with validation and retry
- [ ] Central Agent resolution prompt builder (direct mode, ≤20 agents)
- [ ] Resolution response parser: extract per-agent stats, narrative summary
- [ ] Simulation runner: iteration loop with intent → resolve → save
- [ ] Parallel intent collection via concurrency pool
- [ ] Stat clamping (0-100) after each resolution
- [ ] Statistics computation: averages, min/max
- [ ] Iteration count input + confirmation checkbox + Start Simulation button
- [ ] SSE endpoint streaming iteration events
- [ ] Simulation dashboard: progress bar, iteration summary feed, stat line charts
- [ ] Agent grid with color-coded stat indicators
- [ ] Click-to-expand agent detail (intent + resolved outcome per iteration)
- [ ] Pause and abort simulation controls
- [ ] Final State Report generation
- [ ] Resume simulation from last completed iteration after page reload

**Definition of done:** User can set iteration count, start a simulation with ≤20 agents, watch the dashboard update live as iterations complete, see stat charts, click agents for details, pause/abort, and see the Final State Report.

---

### Phase 4: Reflection + Review (Stages 3, 4)

**Goal:** Full session lifecycle works end-to-end. User can complete a session and re-enter for Q&A.

**Components built:**
- C3: `reflection.ts` (single-pass only for MVP), `evaluation.ts`, `review.ts`
- C6: `reflection.ts`
- C4: Reflection pipeline + evaluation generation in `engine.ts`
- C5: Reflection route, review route
- C7: Reflection + review API calls
- C8: `review.store.ts`
- C10: `ReflectionPage.tsx`, `ReviewPage.tsx`

**Deliverables:**
- [ ] Agent reflection prompt builder (MVP: single pass with Final State Report)
- [ ] Reflection response parser
- [ ] Parallel reflection collection for all agents
- [ ] Society Evaluation prompt builder (Central Agent synthesizes all reflections)
- [ ] Reflection page: Society Evaluation report, agent reflection list (accordion), final stats
- [ ] Agent Q&A prompt builder (background + history + reflection + context)
- [ ] Review page: agent selector sidebar (Central Agent at top), per-agent chat
- [ ] Streaming Q&A responses
- [ ] "End Session" button — marks session as completed
- [ ] Session re-entry: completed sessions open directly to review page
- [ ] Home page: resume button routes to correct stage

**Definition of done:** After simulation, user sees reflections and evaluation. Can chat with any agent in character. Can end session and re-enter later for more Q&A. The full Stage 0 → 4 → completed lifecycle works.

---

### Phase 5: Refinement + Polish

**Goal:** Design refinement, artifacts browsing, two-pass reflections, agent lifecycle, and UI polish.

**Components built:**
- C3: `refinement.ts` (new), update `reflection.ts` for two-pass
- C4: `lifecycle.ts` (new), update reflection pipeline for two passes
- C5: Refinement route
- C10: `RefinementPage.tsx`, `ArtifactsPage.tsx`

**Deliverables:**
- [ ] **Stage 1C — Design Refinement:**
  - Refinement prompt builder (current design as context + user change request)
  - Refinement chat page: design panels on left, chat on right
  - Atomic artifact updates (only regenerate affected parts)
  - Refinement transcript saved as artifact
- [ ] **Two-Pass Reflections:**
  - Pass 1: personal-only reflection (no Final State Report)
  - Pass 2: post-briefing addendum (with Final State Report)
  - Reflection page updated to show both passes per agent
  - Society Evaluation updated to include perspective shift analysis
- [ ] **Agent Lifecycle:**
  - Death detection: health=0 for 2+ consecutive iterations
  - Central Agent can introduce new agents (birth/immigration)
  - Central Agent can change agent roles
  - Lifecycle events shown in simulation dashboard
  - Dead agents grayed in grid, still accessible in Q&A
  - Population chart added to statistics panel
- [ ] **Artifacts Page:**
  - File explorer layout: document tree (grouped by stage) + markdown viewer
  - All 12 artifact types listed
  - Copy and export buttons (Markdown)
  - Full-text search across artifacts
- [ ] **Polish:**
  - Robust pause/resume with transaction-safe state
  - Distribution histograms in statistics
  - Gini coefficient calculation and display
  - Loading states and error messages for all API calls
  - Empty states for all list views

---

### Phase 6: Scale + Extras

**Goal:** Support large simulations (>50 agents), cross-session comparison, and data portability.

**Components built:**
- C4: `map-reduce.ts` (new)
- C3: `comparison.ts`
- C5: Comparison route, export/import routes
- C8: `comparison.store.ts`
- C10: `ComparisonPage.tsx`

**Deliverables:**
- [ ] **Hierarchical Map-Reduce:**
  - Agent grouping by role clusters
  - Sub-resolution → merge pipeline for iteration resolution
  - Arc summarization for Final State Report (>20 iterations)
  - Batched reflection evaluation (>50 agents)
- [ ] **Cross-Session Comparison:**
  - Comparison page: session selector, side-by-side stats, analysis report
  - Central Agent comparison prompt builder
  - Follow-up chat with Central Agent about the comparison
  - Comparison report saved as artifact on each involved session
- [ ] **Session Export/Import:**
  - Export: multi-table JOIN → JSON file download
  - Import: JSON file upload → validate → insert into DB
  - Version compatibility check
- [ ] **Scale Testing:**
  - Test with 100 agents, 50 iterations
  - Performance profiling and optimization
  - Virtualized lists for large agent grids and iteration feeds
