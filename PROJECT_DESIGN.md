# Ideal World — Project Design

This document defines the complete technical architecture, data models, component design, and implementation strategy for Ideal World, a multi-agent society simulation platform. It is the engineering counterpart to [USER_FLOW.md](./USER_FLOW.md), which describes the user-facing experience.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Data Models](#4-data-models)
5. [Central Agent Design](#5-central-agent-design)
6. [Citizen Agent Design](#6-citizen-agent-design)
7. [Stage-by-Stage Implementation](#7-stage-by-stage-implementation)
8. [Prompt Engineering](#8-prompt-engineering)
9. [Concurrency & Orchestration](#9-concurrency--orchestration)
10. [Data Persistence Layer](#10-data-persistence-layer)
11. [Frontend Architecture](#11-frontend-architecture)
12. [API Design](#12-api-design)
13. [Error Handling & Resilience](#13-error-handling--resilience)
14. [Cost Management](#14-cost-management)
15. [Security Considerations](#15-security-considerations)
16. [Testing Strategy](#16-testing-strategy)
17. [Development Phases & Milestones](#17-development-phases--milestones)

---

## 1. System Overview

Ideal World is a web application that allows users to design hypothetical societies and simulate them using LLM-powered agents. The system has two types of agents:

- **Central Agent:** A meta-agent that facilitates brainstorming, designs the society, summarizes simulation iterations, and generates evaluation reports. There is exactly one Central Agent per session.
- **Citizen Agents:** Individual agents that each represent a person in the simulated society. Each has a unique background, personality, and starting conditions. A session can have 20–150 Citizen Agents.

The simulation runs for a user-specified number of iterations (1–100). In each iteration, every Citizen Agent makes decisions based on their personal state and the society's shared state, then the Central Agent summarizes the collective outcome.

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (SPA)                          │
│  React + TypeScript                                          │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Home Page│ │Chat View │ │Simulation │ │ Artifacts     │  │
│  │          │ │(Stage 0, │ │Dashboard  │ │ Page          │  │
│  │          │ │ 1, 4)    │ │(Stage 2)  │ │               │  │
│  └──────────┘ └──────────┘ └───────────┘ └───────────────┘  │
│                          │                                    │
│              ┌───────────▼───────────┐                        │
│              │  State Management     │                        │
│              │  (Zustand / Context)  │                        │
│              └───────────┬───────────┘                        │
│                          │                                    │
│              ┌───────────▼───────────┐                        │
│              │  Persistence Layer    │                        │
│              │  (LocalStorage /      │                        │
│              │   IndexedDB)          │                        │
│              └───────────────────────┘                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                     BACKEND SERVER                            │
│  Node.js + Express (or Python + FastAPI)                      │
│  ┌───────────────────────────────────┐                        │
│  │         Orchestration Engine       │                        │
│  │  ┌─────────┐  ┌────────────────┐  │                        │
│  │  │ Session  │  │  Agent Runner  │  │                        │
│  │  │ Manager  │  │  (Concurrent)  │  │                        │
│  │  └─────────┘  └────────────────┘  │                        │
│  └───────────────┬───────────────────┘                        │
│                  │                                             │
│  ┌───────────────▼───────────────────┐                        │
│  │       LLM Gateway                 │                        │
│  │  Rate limiting, retries,          │                        │
│  │  prompt construction, response    │                        │
│  │  parsing                          │                        │
│  └───────────────┬───────────────────┘                        │
└──────────────────┼──────────────────────────────────────────┘
                   │ API Calls
┌──────────────────▼──────────────────────────────────────────┐
│                   LLM PROVIDER(S)                            │
│  Claude API (primary) / OpenAI API (optional fallback)       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Alternative: Client-Only Architecture

For simplicity and to avoid server costs, an alternative architecture runs everything client-side:

- The frontend calls the LLM API directly from the browser (user provides their own API key).
- All orchestration logic runs in the browser using Web Workers for parallelism.
- Data persists entirely in IndexedDB.
- Trade-off: Exposes the API key to the browser; no server-side processing; limited concurrency.

### 2.3 Chosen Approach

The project supports **both modes**:
- **Self-hosted mode:** User runs a backend server (provides API key via environment variable).
- **Client-only mode:** User provides API key in the browser settings; all processing happens client-side.

The Orchestration Engine and LLM Gateway are implemented as a shared library that can run in either Node.js or the browser.

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18+ with TypeScript | Component-based UI, strong ecosystem, TypeScript for type safety. |
| **Styling** | Tailwind CSS | Rapid UI development, utility-first approach. |
| **State Management** | Zustand | Lightweight, minimal boilerplate, good for complex nested state. |
| **Client Persistence** | IndexedDB (via Dexie.js) | Handles large data volumes (agent logs, documents) beyond localStorage limits. |
| **Backend (optional)** | Node.js + Express | JavaScript/TypeScript throughout the stack for code sharing. |
| **LLM Integration** | Anthropic SDK (Claude API) | Primary LLM provider. Supports streaming, structured output. |
| **Real-time Updates** | Server-Sent Events (SSE) | One-way streaming from server to client during simulation. Simpler than WebSocket for this use case. |
| **Build Tool** | Vite | Fast development server, optimized production builds. |
| **Testing** | Vitest + React Testing Library + Playwright | Unit, component, and E2E testing. |
| **Charting** | Recharts | React-native charting for simulation statistics. |

---

## 4. Data Models

### 4.1 Session

```typescript
interface Session {
  id: string;                          // UUID v4
  name: string;                        // User-provided or auto-generated
  seedIdea: string;                    // Original user input from Stage 0
  stage: SessionStage;                 // Current stage
  config: SimulationConfig;            // Simulation parameters
  agents: AgentDefinition[];           // All agent definitions
  law: string;                         // Virtual Law Document (markdown)
  societyOverview: string;             // Society Overview Document (markdown)
  iterations: IterationRecord[];       // Completed iteration records
  reflections: AgentReflection[];      // Agent reflections (Stage 3)
  societyEvaluation: string;           // Society Evaluation Report (markdown)
  conversations: ConversationMap;      // All conversation histories
  artifacts: Artifact[];               // Generated document references
  createdAt: string;                   // ISO 8601 timestamp
  updatedAt: string;                   // ISO 8601 timestamp
  completedAt: string | null;          // ISO 8601 timestamp or null
}

type SessionStage =
  | 'idea-input'          // Stage 0
  | 'brainstorming'       // Stage 1A
  | 'designing'           // Stage 1B (in progress)
  | 'design-review'       // Stage 1B (complete, awaiting user confirmation)
  | 'simulating'          // Stage 2 (in progress)
  | 'simulation-paused'   // Stage 2 (paused by user)
  | 'reflecting'          // Stage 3 (in progress)
  | 'reflection-complete' // Stage 3 (complete)
  | 'reviewing'           // Stage 4
  | 'completed';          // Session finalized

interface SimulationConfig {
  totalIterations: number;             // User-specified (1-100)
  completedIterations: number;         // Progress tracker
  agentCount: number;                  // Number of Citizen Agents
}
```

### 4.2 Agent

```typescript
interface AgentDefinition {
  id: string;                          // UUID v4
  name: string;                        // Agent's in-world name
  role: string;                        // Their societal role
  background: string;                  // Full system prompt / backstory
  initialStats: AgentStats;            // Starting values
  currentStats: AgentStats;            // Current values (updated each iteration)
  type: 'central' | 'citizen';        // Agent type
}

interface AgentStats {
  wealth: number;                      // 0-100
  health: number;                      // 0-100
  happiness: number;                   // 0-100
}

interface AgentAction {
  agentId: string;
  iterationNumber: number;
  actions: string;                     // Narrative of actions taken
  interactions: string;                // Who they interacted with
  internalThoughts: string;            // Private thoughts
  updatedStats: AgentStats;            // New stats after this iteration
  reasoning: string;                   // Justification for stat changes
}

interface AgentReflection {
  agentId: string;
  content: string;                     // Full reflection text
  personalAssessment: string;          // How they fared
  behaviorJustification: string;       // Why they behaved as they did
  societyCritique: string;             // Their view on the society
  suggestions: string;                 // What they'd change
}
```

### 4.3 Iteration

```typescript
interface IterationRecord {
  iterationNumber: number;             // 1-indexed
  agentActions: AgentAction[];         // All agent actions for this iteration
  stateSummary: string;                // Central Agent's narrative summary
  statistics: IterationStatistics;     // Aggregate stats
  timestamp: string;                   // ISO 8601
}

interface IterationStatistics {
  avgWealth: number;
  avgHealth: number;
  avgHappiness: number;
  minWealth: number;
  maxWealth: number;
  minHealth: number;
  maxHealth: number;
  minHappiness: number;
  maxHappiness: number;
  wealthDistribution: number[];        // Histogram buckets
  healthDistribution: number[];
  happinessDistribution: number[];
}
```

### 4.4 Conversations

```typescript
type ConversationMap = {
  brainstorming: ChatMessage[];                    // Stage 1A
  review: Record<string, ChatMessage[]>;           // Stage 4: agentId -> messages
  comparison: ChatMessage[];                       // Cross-session comparison
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  agentId?: string;                    // Which agent sent this (for Stage 4)
}
```

### 4.5 Artifacts

```typescript
interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;                     // Markdown content
  generatedAt: SessionStage;           // Which stage produced it
  timestamp: string;
  relatedAgentId?: string;             // For agent-specific artifacts
  iterationNumber?: number;            // For iteration-specific artifacts
}

type ArtifactType =
  | 'brainstorming-transcript'
  | 'society-overview'
  | 'agent-roster'
  | 'virtual-law'
  | 'iteration-summary'
  | 'final-state-report'
  | 'agent-reflection'
  | 'society-evaluation'
  | 'qa-transcript'
  | 'cross-session-comparison';
```

---

## 5. Central Agent Design

The Central Agent is the orchestrator of the simulation. It has multiple responsibilities across different stages, each requiring a distinct system prompt and instruction set.

### 5.1 Responsibilities by Stage

| Stage | Responsibility | Input | Output |
|---|---|---|---|
| 1A | Brainstorm with user | User's seed idea + conversation history | Clarifying questions, suggestions, completeness assessment |
| 1B | Design the society | Full brainstorming transcript | Agent roster, Virtual Law Document, Society Overview |
| 2 | Summarize iterations | All agent actions for one iteration | Iteration State Summary + statistics |
| 2 (end) | Final State Report | All iteration summaries | Comprehensive trajectory report |
| 3 | Society Evaluation | All agent reflections + Final State Report | Pros/cons synthesis report |
| 4 | Answer user questions | All generated documents + Q&A history | In-character responses about the simulation |
| Cross | Compare sessions | Final reports from multiple sessions | Comparison analysis |

### 5.2 System Prompt Structure

The Central Agent's system prompt is recomposed for each stage. The base structure:

```
You are the Central Agent of Ideal World, a society simulation platform.
Your role is to [STAGE-SPECIFIC ROLE].

## Context
[SESSION-SPECIFIC CONTEXT: society description, current state, etc.]

## Instructions
[STAGE-SPECIFIC INSTRUCTIONS]

## Output Format
[STAGE-SPECIFIC FORMAT REQUIREMENTS]
```

### 5.3 Brainstorming Completeness Checklist

During Stage 1A, the Central Agent internally tracks whether the following topics have been sufficiently discussed:

```typescript
interface BrainstormingChecklist {
  governanceModel: boolean;       // Who governs, how decisions are made
  economicSystem: boolean;        // Production, distribution, trade
  socialStructure: boolean;       // Classes, roles, mobility
  legalFramework: boolean;        // Laws, enforcement, penalties
  culturalNorms: boolean;         // Values, taboos, traditions
  environment: boolean;           // Resources, geography, technology level
  conflictResolution: boolean;    // How disputes are handled
  externalFactors: boolean;       // Isolation, neighbors, natural events
}
```

The Central Agent is prompted to assess completeness after each user message. When all (or most) topics are covered, it suggests the user proceed.

### 5.4 Design Generation Strategy

During Stage 1B, the Central Agent generates the society design in multiple sequential LLM calls to manage context and quality:

1. **Call 1 — Society Overview:** Generate the high-level society description.
2. **Call 2 — Virtual Law Document:** Generate the law document, referencing the overview.
3. **Call 3 — Agent Roster (roles and count):** Determine how many agents and what roles are needed.
4. **Calls 4–N — Agent Backgrounds:** Generate detailed backgrounds in batches of 10–20 agents per call, ensuring diversity and internal consistency.
5. **Call N+1 — Initial Stats:** Assign initial wealth, health, and happiness to each agent based on their role and background.

Each call includes the outputs of previous calls to maintain coherence.

---

## 6. Citizen Agent Design

### 6.1 Agent Identity

Each Citizen Agent is an LLM call with a carefully constructed prompt. The agent has no persistent memory beyond what is provided in the prompt — all "memory" comes from the context window.

### 6.2 System Prompt Template

```
You are {agent.name}, a {agent.role} in a simulated society.

## Your Background
{agent.background}

## Your Current State
- Wealth: {agent.currentStats.wealth}/100
- Health: {agent.currentStats.health}/100
- Happiness: {agent.currentStats.happiness}/100

## The Law of This Society
{session.law}

## Current State of Society
{previousIterationSummary OR "This is the first day of this society."}

## Instructions
You are living in this society. Based on your background, personality, and
current circumstances, describe what you do during this period. Consider:
- How do you earn or spend resources?
- Who do you interact with and why?
- Do you follow or break any laws? Why?
- What are your goals and how do you pursue them?
- How do your actions affect your wealth, health, and happiness?

## Output Format
Respond with a JSON object:
{
  "actions": "Description of what you did...",
  "interactions": "Who you interacted with and how...",
  "internalThoughts": "Your private thoughts and feelings...",
  "updatedStats": {
    "wealth": <number 0-100>,
    "health": <number 0-100>,
    "happiness": <number 0-100>
  },
  "reasoning": "Why your stats changed..."
}
```

### 6.3 Agent Consistency

To ensure agents behave consistently with their defined personality:
- The background/system prompt is always included in full — it is never summarized or truncated.
- The agent's own action history from previous iterations is included (summarized if the context window is too long).
- Agents do NOT see other agents' internal thoughts — only the Central Agent's public summary.

### 6.4 Stat Boundaries

- Stats are clamped to 0–100 after each iteration.
- If an agent's health reaches 0, they are marked as "incapacitated" — they still exist but their actions are limited and their system prompt includes this constraint.
- The Central Agent may note extreme stat changes (>20 points in one iteration) and provide narrative justification.

---

## 7. Stage-by-Stage Implementation

### 7.1 Stage 0 — Idea Input

**Frontend:**
- Simple form with a textarea and submit button.
- Example prompts as clickable chips.
- On submit: create a new `Session` object, save to IndexedDB, navigate to Stage 1A.

**Backend:** None — purely client-side.

### 7.2 Stage 1A — Brainstorming

**Frontend:**
- Chat interface (message list + input box).
- "Start Design" button appears when the Central Agent suggests it.
- Override warning modal if user clicks "Start Design" prematurely.

**Backend / Orchestration:**
- Each user message triggers an LLM call with the Central Agent's brainstorming prompt.
- The completeness checklist is evaluated in each response (the LLM is instructed to include a hidden JSON block with checklist status).
- Conversation history is appended to the prompt for each call.
- Streaming is used for real-time response display.

### 7.3 Stage 1B — Society Design

**Frontend:**
- Progress indicator with steps: "Creating Overview..." → "Drafting Laws..." → "Designing Agents..." → "Complete."
- Rendered documents (markdown viewer).
- Iteration count input + "Start Simulation" button.

**Backend / Orchestration:**
- Sequential LLM calls as described in Section 5.4.
- Each generated document is parsed, validated, and stored.
- Agent roster is validated for: unique names, valid roles, stats within range.

### 7.4 Stage 2 — Simulation

**Frontend:**
- Simulation dashboard with progress bar, live feed, statistics panel, agent grid.
- Pause/abort controls.
- Agent detail modal (click on agent to see their history).

**Backend / Orchestration:**
- For each iteration:
  1. Construct prompts for all Citizen Agents.
  2. Send all agent prompts **concurrently** (with rate limiting).
  3. Collect and parse all responses.
  4. Validate stat changes (clamp to 0–100, flag anomalies).
  5. Send all agent responses to the Central Agent for summarization.
  6. Parse and store the iteration summary.
  7. Update agent `currentStats`.
  8. Save iteration record.
  9. Push update to frontend via SSE.
- Repeat for all iterations.

### 7.5 Stage 3 — Reflection

**Backend / Orchestration:**
1. Construct reflection prompts for all Citizen Agents (includes their action history + Final State Report).
2. Send all reflection prompts **concurrently**.
3. Collect and store all reflections.
4. Send all reflections to the Central Agent for the Society Evaluation.
5. Store the Society Evaluation.

**Frontend:**
- Summary page with Society Evaluation, agent reflection list, and charts.

### 7.6 Stage 4 — Agent Review

**Frontend:**
- Agent selection panel (sidebar or dropdown).
- Chat interface per agent.
- "End Session" button.

**Backend / Orchestration:**
- Each user message to an agent triggers an LLM call with:
  - The agent's system prompt + background.
  - Their complete action history and reflection.
  - The Final State Report (for context).
  - The Q&A conversation history.
- Streaming responses.

---

## 8. Prompt Engineering

### 8.1 Prompt Design Principles

1. **Structured output:** All agent responses use JSON format with defined schemas. This enables reliable parsing.
2. **Role consistency:** System prompts are detailed and specific. Agents are repeatedly reminded of their identity and constraints.
3. **Context management:** Only relevant context is included in each prompt. Irrelevant history is summarized or omitted.
4. **Bounded creativity:** Agents are instructed to be creative within the bounds of their character and the society's rules.
5. **Stat justification:** Agents must explain why their stats changed, preventing arbitrary number manipulation.

### 8.2 Prompt Size Management

With 100+ agents and 50+ iterations, context windows will be large. Strategies:

| Scenario | Strategy |
|---|---|
| Agent action (early iterations) | Full context — background + law + previous summary. Fits easily. |
| Agent action (later iterations) | Background + law + last 3 iteration summaries + condensed earlier history. |
| Central Agent iteration summary | All agent actions for the current iteration. May require batching if > context limit. |
| Central Agent final report | Summaries of all iterations. May need hierarchical summarization (summarize groups of 10 iterations, then summarize the summaries). |
| Agent reflection | Background + condensed action history + Final State Report. |
| Central Agent evaluation | All reflections. May need batching. |

### 8.3 Output Parsing

- Agent action responses are expected in JSON format.
- A JSON schema validator checks each response.
- If parsing fails, the response is retried once with an explicit correction prompt.
- If retry fails, the raw text is stored and the Central Agent is instructed to work with it as-is.

---

## 9. Concurrency & Orchestration

### 9.1 Parallel Agent Execution

During each simulation iteration, all Citizen Agents can act independently (they don't see each other's current-iteration actions). This enables full parallelism.

```
Iteration i:
  ├── Agent 1 ─────────→ Response 1 ──┐
  ├── Agent 2 ─────────→ Response 2 ──┤
  ├── Agent 3 ─────────→ Response 3 ──┤
  │   ...                              ├──→ Central Agent Summary
  └── Agent N ─────────→ Response N ──┘
```

### 9.2 Rate Limiting

LLM APIs have rate limits (requests per minute, tokens per minute). The orchestration engine implements:

- **Concurrency pool:** Maximum concurrent requests (configurable, default: 10).
- **Token budget:** Track tokens per minute and throttle when approaching limits.
- **Backoff:** Exponential backoff on 429 (rate limit) responses.
- **Queue:** A priority queue ensures the Central Agent's requests are processed before Citizen Agent requests when contention exists.

### 9.3 Orchestration Engine

```typescript
class OrchestrationEngine {
  private llmGateway: LLMGateway;
  private concurrencyPool: ConcurrencyPool;

  async runIteration(
    session: Session,
    iterationNumber: number
  ): Promise<IterationRecord> {
    // 1. Build prompts for all agents
    const prompts = this.buildAgentPrompts(session, iterationNumber);

    // 2. Execute all agent prompts concurrently (with rate limiting)
    const actions = await this.concurrencyPool.executeAll(
      prompts.map(p => () => this.llmGateway.complete(p))
    );

    // 3. Parse and validate responses
    const parsedActions = actions.map(a => this.parseAgentAction(a));

    // 4. Build Central Agent summary prompt
    const summaryPrompt = this.buildSummaryPrompt(session, parsedActions);

    // 5. Generate summary
    const summary = await this.llmGateway.complete(summaryPrompt);

    // 6. Compute statistics
    const stats = this.computeStatistics(parsedActions);

    // 7. Build and return iteration record
    return { iterationNumber, agentActions: parsedActions, stateSummary: summary, statistics: stats };
  }
}
```

---

## 10. Data Persistence Layer

### 10.1 Storage Architecture

```
┌──────────────────────────────────────────┐
│             Persistence API               │
│  save(session) / load(id) / list() /      │
│  delete(id) / export(id) / import(data)   │
└──────────────┬──────────────┬────────────┘
               │              │
    ┌──────────▼───┐  ┌──────▼──────────┐
    │  IndexedDB    │  │  File System     │
    │  (Browser)    │  │  (Node.js/CLI)   │
    └──────────────┘  └─────────────────┘
```

### 10.2 IndexedDB Schema (via Dexie.js)

```typescript
const db = new Dexie('IdealWorldDB');

db.version(1).stores({
  sessions: 'id, name, stage, createdAt, updatedAt',
  agents: 'id, sessionId, name, role, type',
  iterations: '[sessionId+iterationNumber], sessionId',
  artifacts: 'id, sessionId, type, timestamp',
  conversations: '[sessionId+context], sessionId',
});
```

### 10.3 Data Access Patterns

| Operation | Frequency | Notes |
|---|---|---|
| Save session metadata | After each stage transition | Small payload (<1KB). |
| Save iteration record | After each iteration | Medium payload (10–100KB depending on agent count). |
| Load full session | On session resume | Large payload — lazy-load iteration details on demand. |
| List all sessions | On Home Page load | Metadata only — no iteration/agent details. |
| Export session | On user request | Full JSON serialization, offered as file download. |

### 10.4 Lazy Loading

To avoid loading entire sessions into memory:
- Session list shows only metadata (name, stage, dates, agent count).
- Agent roster is loaded when the user enters Stage 1B review or Stage 4.
- Iteration records are loaded on demand (when the user scrolls to that iteration or clicks on it).
- Conversations are loaded per-agent when the user opens a Q&A chat.

---

## 11. Frontend Architecture

### 11.1 Page / Route Structure

```
/                           → Home Page (session list)
/session/new                → Stage 0 (Idea Input)
/session/:id/brainstorm     → Stage 1A (Brainstorming Chat)
/session/:id/design         → Stage 1B (Design Review)
/session/:id/simulate       → Stage 2 (Simulation Dashboard)
/session/:id/reflect        → Stage 3 (Reflection Summary)
/session/:id/review         → Stage 4 (Agent Q&A)
/session/:id/artifacts      → Artifacts Page
/compare                    → Cross-Session Comparison
```

### 11.2 Component Hierarchy

```
App
├── HomePage
│   ├── SessionList
│   │   └── SessionCard (×N)
│   ├── NewSessionButton
│   └── CompareButton
├── IdeaInputPage
│   ├── IdeaTextArea
│   └── ExamplePrompts
├── BrainstormPage
│   ├── ChatMessageList
│   │   └── ChatBubble (×N)
│   ├── ChatInput
│   └── StartDesignButton
├── DesignReviewPage
│   ├── SocietyOverviewPanel
│   ├── AgentRosterTable
│   │   └── AgentRow (×N)
│   ├── LawDocumentViewer
│   ├── IterationCountInput
│   └── StartSimulationButton
├── SimulationDashboard
│   ├── ProgressBar
│   ├── LiveFeed
│   │   └── IterationSummaryCard (×N)
│   ├── StatisticsPanel
│   │   ├── WealthChart
│   │   ├── HealthChart
│   │   └── HappinessChart
│   ├── AgentGrid
│   │   └── AgentTile (×N)
│   └── SimulationControls (Pause/Abort)
├── ReflectionPage
│   ├── SocietyEvaluationReport
│   ├── AgentReflectionList
│   │   └── AgentReflectionCard (×N)
│   └── FinalStatisticsPanel
├── ReviewPage
│   ├── AgentSelector (sidebar)
│   ├── AgentChat
│   │   ├── ChatMessageList
│   │   └── ChatInput
│   └── EndSessionButton
├── ArtifactsPage
│   ├── ArtifactList
│   │   └── ArtifactCard (×N)
│   ├── ArtifactViewer (markdown renderer)
│   └── SearchBar
└── ComparisonPage
    ├── SessionSelector (checkboxes)
    ├── ComparisonReport
    └── ComparisonChat
```

### 11.3 State Management (Zustand)

```typescript
interface AppStore {
  // Session management
  sessions: SessionMetadata[];
  currentSession: Session | null;
  loadSessions: () => Promise<void>;
  createSession: (seedIdea: string) => Promise<string>;
  loadSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Stage progression
  advanceStage: (newStage: SessionStage) => void;

  // Brainstorming
  brainstormMessages: ChatMessage[];
  sendBrainstormMessage: (content: string) => Promise<void>;

  // Simulation
  simulationProgress: number;
  isSimulating: boolean;
  startSimulation: () => Promise<void>;
  pauseSimulation: () => void;
  abortSimulation: () => void;

  // Review
  activeReviewAgent: string | null;
  reviewMessages: Record<string, ChatMessage[]>;
  sendReviewMessage: (agentId: string, content: string) => Promise<void>;

  // Comparison
  comparisonSessionIds: string[];
  comparisonReport: string | null;
  runComparison: (sessionIds: string[]) => Promise<void>;
}
```

---

## 12. API Design

### 12.1 REST Endpoints (Backend Mode)

```
POST   /api/sessions                    Create a new session
GET    /api/sessions                    List all sessions (metadata only)
GET    /api/sessions/:id                Get full session data
DELETE /api/sessions/:id                Delete a session

POST   /api/sessions/:id/brainstorm     Send a brainstorming message
POST   /api/sessions/:id/design         Trigger society design generation
POST   /api/sessions/:id/simulate       Start or resume simulation
POST   /api/sessions/:id/pause          Pause simulation
POST   /api/sessions/:id/reflect        Trigger reflection generation

POST   /api/sessions/:id/review/:agentId  Send a review question to an agent

POST   /api/compare                      Generate cross-session comparison

GET    /api/sessions/:id/artifacts       List artifacts for a session
GET    /api/sessions/:id/artifacts/:aid  Get a specific artifact

GET    /api/sessions/:id/stream          SSE endpoint for simulation updates
```

### 12.2 SSE Events (During Simulation)

```
event: iteration-start
data: { "iteration": 3, "totalIterations": 20 }

event: agent-complete
data: { "agentId": "abc-123", "agentName": "Farmer Chen", "iteration": 3 }

event: iteration-summary
data: { "iteration": 3, "summary": "...", "statistics": {...} }

event: simulation-complete
data: { "finalReport": "..." }

event: error
data: { "message": "Rate limit exceeded, retrying in 30s..." }
```

---

## 13. Error Handling & Resilience

### 13.1 LLM Call Failures

| Error Type | Handling |
|---|---|
| **Rate limit (429)** | Exponential backoff: 2s, 4s, 8s, 16s, 32s. Max 5 retries. |
| **Timeout** | Retry once with same prompt. If fails again, mark agent action as "no response" and continue. |
| **Invalid JSON response** | Retry with correction prompt: "Your previous response was not valid JSON. Please respond only with JSON matching this schema: ..." |
| **Context too long** | Truncate oldest context (keep system prompt, law, and most recent summary). Log a warning. |
| **API error (500)** | Retry up to 3 times. If persistent, pause simulation and notify user. |
| **Network error** | Retry up to 4 times with exponential backoff. Notify user if all retries fail. |

### 13.2 Data Integrity

- Sessions are saved atomically — partial writes are detected via a `saveVersion` counter.
- On load, if a session appears corrupted, the system attempts to recover from the last valid checkpoint.
- Iteration records are immutable once written — they are never modified, only appended.

### 13.3 Idempotency

- If the simulation is resumed after a crash, the engine checks `completedIterations` and resumes from the next iteration.
- Agent actions for a partially completed iteration are discarded, and the iteration is re-run from scratch.

---

## 14. Cost Management

### 14.1 Token Usage Estimates

Assumptions: 100 agents, 20 iterations, Claude 3.5 Sonnet.

| Operation | Input Tokens | Output Tokens | Calls | Total Tokens |
|---|---|---|---|---|
| Brainstorming (10 exchanges) | ~2,000/call | ~500/call | 10 | ~25,000 |
| Society Design | ~3,000/call | ~2,000/call | 15 | ~75,000 |
| Agent Actions (per iteration) | ~2,000/agent | ~500/agent | 100 | ~250,000 |
| Iteration Summary | ~50,000 | ~2,000 | 1 | ~52,000 |
| **Per Iteration Total** | | | | **~302,000** |
| **20 Iterations Total** | | | | **~6,040,000** |
| Final Report | ~100,000 | ~3,000 | 1 | ~103,000 |
| Agent Reflections | ~3,000/agent | ~800/agent | 100 | ~380,000 |
| Society Evaluation | ~80,000 | ~3,000 | 1 | ~83,000 |
| **Grand Total** | | | | **~6,706,000** |

At Claude 3.5 Sonnet pricing (~$3/M input, $15/M output), a full 100-agent, 20-iteration session costs approximately **$30–50**.

### 14.2 Cost Reduction Strategies

1. **Fewer agents:** 30 agents instead of 100 reduces costs by ~70%.
2. **Shorter outputs:** Constrain agent responses to 200 tokens.
3. **Batched summaries:** Summarize every 5 iterations instead of every iteration (configurable).
4. **Model selection:** Use a cheaper model (Haiku) for Citizen Agents, Sonnet/Opus for the Central Agent.
5. **Caching:** If multiple agents have similar backgrounds, share partial context.
6. **User controls:** Show estimated cost before starting simulation; let user adjust parameters.

---

## 15. Security Considerations

### 15.1 API Key Management

- In self-hosted mode: API key stored in server environment variables, never exposed to the client.
- In client-only mode: API key stored in browser memory (not localStorage). User enters it each session or stores it encrypted with a user-provided passphrase.

### 15.2 Prompt Injection

- User input (seed idea, brainstorming messages, review questions) is treated as untrusted.
- System prompts are clearly delineated from user input.
- Agent responses are not executed — they are displayed as text only.

### 15.3 Data Privacy

- All session data stays local (browser or user's server). No data is sent to third parties except the LLM API for inference.
- Users are informed that their session data (including their society ideas) is sent to the LLM provider per the provider's API terms.

---

## 16. Testing Strategy

### 16.1 Unit Tests

- **Prompt builders:** Verify correct prompt construction for each stage and agent type.
- **Response parsers:** Verify JSON parsing, stat clamping, error recovery.
- **Statistics computation:** Verify aggregate calculations.
- **Session state machine:** Verify valid stage transitions.

### 16.2 Integration Tests

- **Orchestration engine:** Mock the LLM API, run a full simulation with 5 agents and 3 iterations, verify all data structures are correctly populated.
- **Persistence layer:** Write and read sessions, verify data integrity.
- **SSE streaming:** Verify events are emitted in correct order.

### 16.3 End-to-End Tests (Playwright)

- **Full user flow:** Create a session, brainstorm, design, simulate (2 iterations, 5 agents), reflect, review, end session.
- **Session persistence:** Create a session, close browser, reopen, verify session is resumable.
- **Cross-session comparison:** Complete 2 sessions, run comparison.

### 16.4 LLM Output Tests

- **Schema compliance:** Run actual LLM calls with test prompts, verify output matches expected JSON schema.
- **Behavioral tests:** Verify that agent with a "greedy" background actually pursues wealth; agent with a "charitable" background shares resources.
- These tests are non-deterministic and are run manually or in a separate CI pipeline.

---

## 17. Development Phases & Milestones

### Phase 1: Foundation (Weeks 1–3)

- [ ] Project scaffolding (Vite + React + TypeScript + Tailwind).
- [ ] Data models and TypeScript interfaces.
- [ ] IndexedDB persistence layer (Dexie.js setup, CRUD operations).
- [ ] Home Page with session list (empty state, create, delete).
- [ ] Basic routing structure.
- [ ] LLM Gateway module (API key config, basic completion call, error handling).

### Phase 2: Brainstorming & Design (Weeks 4–6)

- [ ] Stage 0 — Idea Input page.
- [ ] Chat interface component (reusable for Stages 1A and 4).
- [ ] Central Agent brainstorming prompt engineering.
- [ ] Brainstorming completeness checklist logic.
- [ ] "Start Design" button and override flow.
- [ ] Central Agent design generation (multi-step prompt chain).
- [ ] Design Review page (society overview, agent roster table, law viewer).
- [ ] Iteration count input and validation.

### Phase 3: Simulation Engine (Weeks 7–10)

- [ ] Orchestration engine (concurrent agent execution, rate limiting).
- [ ] Citizen Agent prompt construction and response parsing.
- [ ] Central Agent iteration summary prompt.
- [ ] Simulation Dashboard UI (progress bar, live feed, charts, agent grid).
- [ ] SSE streaming or client-side event emitter.
- [ ] Pause/resume/abort simulation.
- [ ] Iteration data persistence and auto-save.
- [ ] Final State Report generation.
- [ ] Statistics computation and charting.

### Phase 4: Reflection & Review (Weeks 11–13)

- [ ] Agent reflection prompt engineering and execution.
- [ ] Society Evaluation Report generation.
- [ ] Reflection Page UI.
- [ ] Agent Review (Stage 4) — agent selector, per-agent chat.
- [ ] Review agent prompt construction (includes action history, reflection, context).
- [ ] "End Session" flow and session completion.

### Phase 5: Artifacts & Comparison (Weeks 14–15)

- [ ] Artifacts Page — document list, markdown viewer, search, export.
- [ ] Cross-session comparison — session selector, Central Agent comparison prompt.
- [ ] Comparison Page UI.
- [ ] Session export/import (JSON file).

### Phase 6: Polish & Testing (Weeks 16–18)

- [ ] End-to-end testing (Playwright).
- [ ] Unit and integration tests.
- [ ] Performance optimization (lazy loading, virtualized lists for large agent counts).
- [ ] Responsive design and mobile support.
- [ ] Error states and edge case handling.
- [ ] Cost estimation display before simulation start.
- [ ] Documentation and README update.
