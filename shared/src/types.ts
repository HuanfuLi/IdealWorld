// Core stage progression per spec. Implementation may include sub-stages.
export type Stage =
  | 'idea-input'
  | 'brainstorming'
  | 'designing'
  | 'design-review'
  | 'refining'
  | 'simulating'
  | 'simulation-paused'
  | 'reflecting'
  | 'reflection-complete'
  | 'reviewing'
  | 'completed';

/** @alias Stage — kept for backward compat */
export type SessionStage = Stage;

/** Chat context: 'brainstorm' during Stage 1A, 'refinement' during Stage 1C,
 *  'review:<agentId>' during Stage 4 agent Q&A. */
export type ChatContext = 'brainstorm' | 'refinement' | `review:${string}`;

export interface Session {
  id: string;
  /** Society display name (auto-generated from brainstorm or user-provided) */
  title: string;
  /** Raw user idea entered at Stage 0 */
  idea: string;
  stage: Stage;
  config: Record<string, unknown> | null;
  law: string | null;
  societyOverview: string | null;
  timeScale: string | null;
  societyEvaluation: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SessionMetadata {
  id: string;
  title: string;
  idea: string;
  stage: Stage;
  agentCount: number;
  totalIterations: number;
  completedIterations: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStats {
  wealth: number;
  health: number;
  happiness: number;
  cortisol: number;    // 0-100, hidden stress level
  dopamine: number;    // 0-100, hidden satisfaction
}

export interface Agent {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  background: string;
  /** Stats at creation (never changes after design) */
  initialStats: AgentStats;
  /** Current stats, updated each iteration */
  currentStats: AgentStats;
  /** Convenience alias: currentStats.wealth >= 0 && status === 'alive' */
  isAlive: boolean;
  /** True for the Central Agent */
  isCentralAgent?: boolean;
  /** 'alive' | 'dead' | 'new' — raw DB value */
  status: string;
  /** 'citizen' | 'central' — raw DB value */
  type: string;
  bornAtIteration: number | null;
  diedAtIteration: number | null;
}

/** @alias Agent — kept for backward compat with Phase 1/2 imports */
export type AgentDefinition = Agent;

export interface ChatMessage {
  id: string;
  sessionId: string;
  context: ChatContext | string;
  agentId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ── Phase 3 types ──────────────────────────────────────────────────────────

export interface AgentAction {
  id: string;
  iterationId: string;
  agentId: string;
  intent: string;
  resolvedOutcome: string;
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
}

export interface Iteration {
  id: string;
  sessionId: string;
  /** 1-based */
  number: number;
  narrativeSummary: string;
  timestamp: string;
}

/** @alias Iteration — implementation-side record with extra fields */
export interface IterationRecord {
  id: string;
  sessionId: string;
  iterationNumber: number;
  stateSummary: string;
  statistics: Record<string, unknown>;
  lifecycleEvents: unknown[];
  timestamp: string;
}

export interface IterationStats {
  iterationNumber: number;
  avgWealth: number;
  avgHealth: number;
  avgHappiness: number;
  minWealth: number;
  maxWealth: number;
  minHealth: number;
  maxHealth: number;
  minHappiness: number;
  maxHappiness: number;
  aliveCount: number;
  totalCount: number;
  /** Gini coefficient for wealth inequality (0=perfect equality, 1=perfect inequality) */
  giniWealth?: number;
  /** Gini coefficient for happiness inequality */
  giniHappiness?: number;
}

export interface SocietyDesign {
  overview: string;
  lawDocument: string;
  agents: Agent[];
  timeScale: string;
}

// ── Phase 4 types ──────────────────────────────────────────────────────────

export interface AgentReflection {
  agentId: string;
  sessionId: string;
  pass1: string;
  /** Phase 5: post-briefing addendum */
  pass2?: string;
}

export interface SocietyEvaluation {
  sessionId: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  analysis: string;
}

// ── Phase 5 types ──────────────────────────────────────────────────────────

export interface ComparisonDimension {
  name: string;
  /** Score for session 1, 0–100 */
  score1: number;
  /** Score for session 2, 0–100 */
  score2: number;
  analysis: string;
}

export interface ComparisonResult {
  session1Id: string;
  session2Id: string;
  /** Multi-paragraph prose summary */
  narrative: string;
  dimensions: ComparisonDimension[];
  /** 1-2 sentence takeaway */
  verdict: string;
}

/** Full-fidelity export envelope */
export interface SessionExport {
  version: 1;
  exportedAt: string;
  session: Session;
  agents: Agent[];
  iterations: Array<{
    iterationNumber: number;
    stateSummary: string;
    statistics: string;
    lifecycleEvents: string;
    timestamp: string;
  }>;
  reflections: Array<{
    agentId: string | null;
    content: string;
    insights: string | null;
    createdAt: string;
  }>;
  chatMessages: Array<{
    context: string;
    agentId: string | null;
    role: string;
    content: string;
    timestamp: string;
  }>;
  roleChanges: Array<{
    agentId: string;
    fromRole: string;
    toRole: string;
    reason: string | null;
    iterationNumber: number;
    timestamp: string;
  }>;
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface AppSettings {
  /** LLM provider selection */
  provider: 'claude' | 'openai' | 'gemini' | 'local';
  apiKey: string;
  /** Base URL for local/custom OpenAI-compatible providers */
  baseUrl: string;
  centralAgentModel: string;
  citizenAgentModel: string;
  maxConcurrency: number;
}

export interface SettingsResponse {
  provider: AppSettings['provider'];
  hasApiKey: boolean;
  baseUrl: string;
  centralAgentModel: string;
  citizenAgentModel: string;
  maxConcurrency: number;
}

export interface TestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

// ── Brainstorm / Design helpers ────────────────────────────────────────────

export interface BrainstormChecklist {
  governance: boolean;
  economy: boolean;
  legal: boolean;
  culture: boolean;
  infrastructure: boolean;
}

export interface SessionConfig {
  totalIterations: number;
  checklist: BrainstormChecklist;
  readyForDesign: boolean;
}

export type DesignProgressEvent =
  | { type: 'step_start'; step: 'overview' | 'law' | 'agents'; stepIndex: number; totalSteps: 3 }
  | { type: 'step_done';  step: 'overview' | 'law' | 'agents'; stepIndex: number }
  | { type: 'complete';   sessionStage: Stage }
  | { type: 'error';      step: string; message: string };

export interface ChatResponse {
  reply: string;
  updatedChecklist: BrainstormChecklist | null;
  readyForDesign: boolean;
  artifactsUpdated: Array<'overview' | 'law' | 'agents'>;
  agentsSummary: string | null;
}

export interface SessionDetail {
  id: string;
  title: string;
  idea: string;
  stage: Stage;
  config: SessionConfig | null;
  law: string | null;
  societyOverview: string | null;
  timeScale: string | null;
  createdAt: string;
  updatedAt: string;
}
