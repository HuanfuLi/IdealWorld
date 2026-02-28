# Ideal World — Implementation Plan

Reference: [USER_FLOW.md](./USER_FLOW.md) · [PROJECT_DESIGN.md](./PROJECT_DESIGN.md) · [UI_DESIGNS.md](./UI_DESIGNS.md)

---

## 1. Project Structure

**Current state:** Vite + React 19 frontend prototype at root. All 10 pages exist as UI mockups with hardcoded data. No backend, no shared types, no state management.

Additions marked with `+`:

```
ideal-world/
├── src/                          # Frontend (exists)
│   ├── App.tsx                   #   Router + sidebar layout
│   ├── main.tsx                  #   Entry point
│   ├── pages/                    #   10 page components (mocked)
│   ├── api/               +     #   C7: API client + SSE handler
│   ├── stores/             +     #   C8: Zustand domain stores
│   └── components/         +     #   C9: Reusable UI (chat, charts, etc.)
├── server/                 +     # Backend (Express + TypeScript)
│   ├── index.ts                  #   Server entry
│   ├── db/                       #   C1: SQLite + Drizzle ORM
│   ├── llm/                      #   C2: LLM Gateway
│   ├── prompts/                  #   C3: Prompt builders
│   ├── orchestration/            #   C4: Workflow coordination
│   ├── routes/                   #   C5: Express routes + SSE
│   └── parsers/                  #   C6: LLM response parsers
├── shared/                 +     # Shared types & validators
│   ├── types.ts
│   └── validators.ts
├── package.json                  # (add backend deps + scripts)
├── vite.config.ts                # (add /api proxy to backend)
└── Documents/
```

---

## 2. Components

```
┌──────────── shared/ ────────────┐
│  Types · Validators · Constants │
└───────────┬──────────┬──────────┘
     server/▼          ▼src/
┌───────────────┐  ┌──────────────┐
│ C1 DB ──┐     │  │  C7 API Client│
│ C2 LLM ─┤    │  │       │       │
│ C3 Prompt┼→C4 │  │  C8 Stores   │
│ C6 Parser┘ │  │  │    ┌──┴──┐   │
│        C5 API─┼──┼→ C9 UI C10  │
│        + SSE  │  │  Shared Pages │
└───────────────┘  └──────────────┘
```

| ID | Location | Status | Responsibility |
|----|----------|--------|----------------|
| C1 | `server/db/` | New | SQLite schema, Drizzle ORM, repos for CRUD |
| C2 | `server/llm/` | New | Provider-agnostic LLM calls, rate limiting, concurrency |
| C3 | `server/prompts/` | New | Pure functions building prompts per stage |
| C4 | `server/orchestration/` | New | Coordinates design gen, simulation loop, reflection |
| C5 | `server/routes/` | New | Express routes + SSE endpoints |
| C6 | `server/parsers/` | New | Extract structured data from LLM JSON responses |
| C7 | `src/api/` | New | Fetch wrapper + SSE client |
| C8 | `src/stores/` | New | Zustand stores calling API client |
| C9 | `src/components/` | New | Reusable chat, markdown, chart, grid components |
| C10 | `src/pages/` | **Exists (mocked)** | 10 pages — need real data wiring |

**Build order:** shared → C1, C2, C3, C6 (parallel) → C4 → C5 → C7 → C8 → C9 → C10 (rewire)

---

## 3. Phases

```
Phase 1: Foundation     → DB + LLM + Settings + Sessions (Home + Settings live)
Phase 2: Design Flow    → Stages 0–1B (Idea → Brainstorm → Design live)
Phase 3: Simulation     → Stage 2 (simulation loop live, ≤20 agents)
Phase 4: Reflect+Review → Stages 3–4 (full lifecycle, MVP complete)
Phase 5: Polish         → Stage 1C, artifacts, two-pass reflections, lifecycle
Phase 6: Scale          → Map-reduce >50 agents, comparison, export
```

**MVP = Phases 1–4**

| Feature | MVP | Post-MVP |
|---------|-----|----------|
| Stages 0, 1A, 1B | ✓ | |
| Stage 1C (refinement) | | Phase 5 |
| Stage 2 ≤20 agents | ✓ | |
| Stage 2 >50 agents (map-reduce) | | Phase 6 |
| Agent lifecycle (death/birth) | | Phase 5 |
| Stage 3 single-pass reflection | ✓ | Two-pass: Phase 5 |
| Stage 3 evaluation | ✓ | |
| Stage 4 agent Q&A | ✓ | |
| Home + Settings | ✓ | |
| Artifacts page | | Phase 5 |
| Cross-session comparison | | Phase 6 |

---

## 4. Phase Details

### Phase 1: Foundation

**Build:** shared types → C1 (DB) → C2 (LLM) → C5 (sessions + settings routes) → C7 (client) → C8 (session + settings stores) → rewire HomePage + SettingsPage

**New deps:** `express`, `better-sqlite3`, `drizzle-orm`, `zod`, `zustand`, `openai`, `@anthropic-ai/sdk`, `tsx`, `concurrently`

**Done when:** User opens app, configures LLM, tests connection, creates/deletes sessions.

### Phase 2: Design Flow (Stages 0, 1A, 1B)

**Build:** C3 (brainstorm + design prompts) → C6 (design parser) → C4 (design workflow) → C5 (brainstorm + design routes) → C7 (SSE handler) → C8 (brainstorm store) → C9 (ChatInterface, MarkdownViewer) → rewire IdeaInput + Brainstorming + DesignReview

**Done when:** User types idea, brainstorms with Central Agent, generates and reviews society design (overview, roster, law).

### Phase 3: Simulation Core (Stage 2)

**Build:** C3 (intent + resolution prompts) → C6 (intent + resolution parsers) → C4 (simulation runner, intent collector, resolver, statistics) → C5 (simulation routes + SSE stream) → C7 (SSE handler) → C8 (simulation store) → C9 (StatChart, AgentGrid) → rewire Simulation

**Done when:** User starts simulation, watches live SSE-driven progress, sees stats and agent actions.

### Phase 4: Reflection + Review (Stages 3, 4)

**Build:** C3 (reflection + evaluation + review prompts) → C6 (reflection parser) → C4 (reflection pipeline) → C5 (reflection + review routes) → C8 (review store) → rewire Reflection + AgentReview

**Done when:** Full Stage 0 → completed lifecycle. Re-entry for Q&A works.

### Phase 5: Refinement + Polish

Stage 1C design refinement, artifacts page, two-pass reflections, agent lifecycle (death/birth/role change), distribution histograms, Gini coefficient.

### Phase 6: Scale + Extras

Map-reduce for >50 agents, cross-session comparison page, session export/import, virtualized lists.

---

## 5. Interface Specifications

### 5.1 Core Data Types (`shared/types.ts`)

```typescript
type Stage = 'idea-input' | 'brainstorming' | 'designing' | 'design-review'
  | 'simulating' | 'reflecting' | 'review' | 'completed';

interface Session {
  id: string;
  title: string;
  idea: string;
  stage: Stage;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  background: string;
  wealth: number;       // 0–100
  health: number;       // 0–100
  happiness: number;    // 0–100
  isAlive: boolean;
  isCentralAgent?: boolean;
}

interface Iteration {
  id: string;
  sessionId: string;
  number: number;       // 1-based
  narrativeSummary: string;
  timestamp: string;
}

interface AgentAction {
  id: string;
  iterationId: string;
  agentId: string;
  intent: string;
  resolvedOutcome: string;
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
}

type ChatContext = 'brainstorm' | 'refinement' | `review:${string}`;

interface ChatMessage {
  id: string;
  sessionId: string;
  context: ChatContext;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SocietyDesign {
  overview: string;       // Markdown
  lawDocument: string;    // Markdown
  agents: Agent[];
  timeScale: string;
}

interface AgentReflection {
  agentId: string;
  sessionId: string;
  pass1: string;
  pass2?: string;         // Phase 5
}

interface SocietyEvaluation {
  sessionId: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  analysis: string;       // Markdown
}

interface IterationStats {
  iterationNumber: number;
  avgWealth: number;   avgHealth: number;   avgHappiness: number;
  minWealth: number;   maxWealth: number;
  minHealth: number;   maxHealth: number;
  minHappiness: number; maxHappiness: number;
  aliveCount: number;  totalCount: number;
}

interface AppSettings {
  provider: 'openai-compatible' | 'anthropic';
  apiKey?: string;
  baseUrl?: string;
  centralAgentModel: string;
  citizenAgentModel: string;
  maxConcurrentRequests: number;
}
```

### 5.2 REST API Contract

All endpoints prefixed with `/api`. Bodies are JSON.

**Sessions**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/sessions` | `{ title, idea }` | `Session` |
| GET | `/api/sessions` | — | `Session[]` |
| GET | `/api/sessions/:id` | — | `Session & { design?, stats? }` |
| DELETE | `/api/sessions/:id` | — | `{}` |
| PATCH | `/api/sessions/:id/stage` | `{ stage }` | `Session` |

**Brainstorm (Stage 1A)** — streaming

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/sessions/:id/brainstorm` | `{ message }` | SSE: `chunk`, `checklist`, `done` |
| GET | `/api/sessions/:id/messages?context=brainstorm` | — | `ChatMessage[]` |

**Design (Stage 1B)** — streaming

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/sessions/:id/design` | — | SSE: `progress`, `design(SocietyDesign)`, `done` |

**Simulation (Stage 2)**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/sessions/:id/simulate` | `{ iterations }` | `{ ok }` |
| POST | `/api/sessions/:id/simulate/pause` | — | `{ ok }` |
| POST | `/api/sessions/:id/simulate/abort` | — | `{ ok }` |
| GET | `/api/sessions/:id/simulate/stream` | — | SSE (long-lived, see §5.3) |
| GET | `/api/sessions/:id/iterations` | — | `Iteration[]` |
| GET | `/api/sessions/:id/iterations/:num` | — | `Iteration & { actions[] }` |

**Reflection (Stage 3)** — streaming

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/sessions/:id/reflect` | — | SSE: `agent-reflection`, `evaluation`, `done` |

**Review (Stage 4)** — streaming

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/sessions/:id/review/:agentId` | `{ message }` | SSE: `chunk`, `done` |
| GET | `/api/sessions/:id/messages?context=review:<agentId>` | — | `ChatMessage[]` |

**Settings**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/settings` | — | `AppSettings` |
| PUT | `/api/settings` | `AppSettings` | `AppSettings` |
| POST | `/api/settings/test` | — | `{ ok, model, latencyMs }` |

### 5.3 SSE Event Contract

**Simulation stream** (`GET /api/sessions/:id/simulate/stream`):

| Event | Data | When |
|-------|------|------|
| `iteration-start` | `{ iteration, total }` | Iteration begins |
| `agent-intent` | `{ agentId, agentName, intent }` | Each agent's intent collected |
| `resolution` | `{ iteration, narrativeSummary, actions[] }` | Central Agent resolves |
| `iteration-complete` | `{ iteration, stats: IterationStats }` | Iteration saved |
| `simulation-complete` | `{ finalReport }` | All iterations done |
| `paused` | `{ iteration }` | User paused |
| `error` | `{ message }` | Failure |

**General streaming** (brainstorm, review, reflection):

| Event | Data |
|-------|------|
| `chunk` | `{ text }` |
| `done` | `{}` |

### 5.4 LLM Gateway Interface (`server/llm/gateway.ts`)

```typescript
interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMGateway {
  chat(messages: LLMMessage[], opts?: LLMOptions): Promise<string>;
  chatStream(messages: LLMMessage[], opts?: LLMOptions): AsyncIterable<string>;
  testConnection(): Promise<{ ok: boolean; model: string; latencyMs: number }>;
}
```

Both `openai-compatible` and `anthropic` providers implement this. The orchestration engine only depends on `LLMGateway`, never a specific provider.

### 5.5 Database Repo Interface (`server/db/repos/`)

```typescript
// Base pattern — each repo extends with domain methods
interface SessionRepo {
  create(data: { title: string; idea: string }): Session;
  getById(id: string): Session | null;
  list(): Session[];
  updateStage(id: string, stage: Stage): Session;
  delete(id: string): void;
}

interface AgentRepo {
  bulkCreate(agents: Omit<Agent, 'id'>[]): Agent[];
  listBySession(sessionId: string): Agent[];
  updateStats(id: string, w: number, h: number, ha: number): Agent;
}

interface IterationRepo {
  create(data: Omit<Iteration, 'id'>): Iteration;
  listBySession(sessionId: string): Iteration[];
  getWithActions(iterationId: string): Iteration & { actions: AgentAction[] };
}

interface ChatMessageRepo {
  append(msg: Omit<ChatMessage, 'id'>): ChatMessage;
  listByContext(sessionId: string, context: ChatContext): ChatMessage[];
}
```

### 5.6 Incremental Wiring Strategy

Each phase connects frontend pages to backend services. Pages transition from **mocked → live** by replacing hardcoded data with Zustand store hooks backed by real API calls.

**Phase 1 — Foundation wiring:**

```
vite.config.ts:  proxy { '/api': 'http://localhost:3001' }
package.json:    "dev": "concurrently \"vite\" \"tsx watch server/index.ts\""

SettingsPage ──store──→ api/client ──HTTP──→ /api/settings ──→ config file I/O
HomePage     ──store──→ api/client ──HTTP──→ /api/sessions ──→ session.repo → SQLite

Integration test: create session → appears on home → delete → gone
```

**Phase 2 — Design flow wiring:**

```
IdeaInput    ──store──→ POST /api/sessions { idea } ──→ DB
Brainstorming──store──→ POST /api/sessions/:id/brainstorm
                        → C4 engine → C3 prompts → C2 LLM (stream)
                        ← SSE chunks rendered in chat
DesignReview ──store──→ POST /api/sessions/:id/design
                        → C4 engine → C3 multi-step prompts → C2 LLM
                        ← SSE progress + SocietyDesign → rendered in tabs

Integration test: type idea → brainstorm 3 turns → generate design → see roster
```

**Phase 3 — Simulation wiring:**

```
Simulation   ──store──→ POST /api/sessions/:id/simulate { iterations: 10 }
                        GET  /api/sessions/:id/simulate/stream
                        → C4 runner: for each iteration:
                            C3 intent prompt → C2 LLM (parallel per agent)
                            C6 parse intents
                            C3 resolution prompt → C2 LLM
                            C6 parse resolution → C1 save
                        ← SSE events → store updates → charts, feed, grid

Store state: iterations[], agents[], stats[], isRunning, currentIteration

Integration test: start 5-iteration sim → watch all 5 complete → final report
```

**Phase 4 — Reflection + Review wiring:**

```
Reflection   ──store──→ POST /api/sessions/:id/reflect
                        → C4 pipeline:
                            C3 reflection prompt × N agents (parallel) → C2 LLM
                            C3 evaluation prompt → C2 LLM
                        ← SSE reflections + evaluation → render report

AgentReview  ──store──→ POST /api/sessions/:id/review/:agentId { message }
                        → C3 review prompt (full agent context) → C2 LLM (stream)
                        ← SSE chunks → chat bubbles

Session lifecycle (each transition calls PATCH /api/sessions/:id/stage):
  HomePage → IdeaInput → Brainstorming → DesignReview
           → Simulation → Reflection → AgentReview → completed

Integration test: full Stage 0 → completed lifecycle in one flow
```
