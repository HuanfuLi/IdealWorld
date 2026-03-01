import { v4 as uuidv4 } from 'uuid';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, agents, chatMessages } from '../db/schema.js';
import { getProvider } from './gateway.js';
import { withRetry } from './retry.js';
import {
  buildBrainstormMessages,
  buildOverviewMessages,
  buildLawMessages,
  buildAgentRosterMessages,
  buildRefineMessages,
} from './prompts.js';
import { parseJSON } from '../parsers/json.js';
import type { ChatMessage, DesignProgressEvent, BrainstormChecklist, SessionConfig } from '@idealworld/shared';

interface BrainstormResult {
  reply: string;
  checklist: BrainstormChecklist;
  readyForDesign: boolean;
}

export async function brainstorm(
  sessionId: string,
  idea: string,
  history: ChatMessage[],
  userMessage: string,
  currentChecklist?: BrainstormChecklist
): Promise<BrainstormResult> {
  const provider = getProvider();
  const messages = buildBrainstormMessages(idea, history, userMessage, currentChecklist);
  const raw = await withRetry(() => provider.chat(messages, { maxTokens: 2048 }));

  let parsed: { reply: string; checklist: BrainstormChecklist; readyForDesign: boolean };
  try {
    parsed = parseJSON<{
      reply: string;
      checklist: BrainstormChecklist;
      readyForDesign: boolean;
    }>(raw);
  } catch {
    // If JSON extraction fails entirely, treat the raw text as the reply
    parsed = {
      reply: raw.slice(0, 1000),
      checklist: { governance: false, economy: false, legal: false, culture: false, infrastructure: false },
      readyForDesign: false,
    };
  }

  // Force readyForDesign false if any checklist item is still false
  const checklist = parsed.checklist ?? {
    governance: false,
    economy: false,
    legal: false,
    culture: false,
    infrastructure: false,
  };
  const allDone = Object.values(checklist).every(Boolean);
  const readyForDesign = allDone && (parsed.readyForDesign ?? false);

  return { reply: parsed.reply, checklist, readyForDesign };
}

interface SessionRow {
  id: string;
  idea: string;
  societyOverview: string | null;
  law: string | null;
  config: string | null;
}

export async function generateDesign(
  session: SessionRow,
  brainstormHistory: ChatMessage[],
  onProgress: (event: DesignProgressEvent) => void
): Promise<void> {
  const provider = getProvider();
  const now = () => new Date().toISOString();

  // Build a text summary of the brainstorm conversation for context
  const brainstormSummary = brainstormHistory
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
    .join('\n\n');

  // Step 1: Overview
  onProgress({ type: 'step_start', step: 'overview', stepIndex: 0, totalSteps: 3 });

  const overviewRaw = await withRetry(() =>
    provider.chat(buildOverviewMessages(session.idea, brainstormSummary), { maxTokens: 2048 })
  );
  const overviewData = parseJSON<{
    societyName: string;
    overview: string;
    timeScale: string;
    agentCount: number;
    governanceModel: string;
    economicModel: string;
  }>(overviewRaw);

  // Clamp agentCount to 20-50
  const agentCount = Math.min(50, Math.max(20, Math.round(overviewData.agentCount ?? 30)));

  await db
    .update(sessions)
    .set({
      title: overviewData.societyName ?? session.id,
      societyOverview: overviewData.overview,
      timeScale: overviewData.timeScale,
      updatedAt: now(),
    })
    .where(eq(sessions.id, session.id));

  onProgress({ type: 'step_done', step: 'overview', stepIndex: 0 });

  // Step 2: Law
  onProgress({ type: 'step_start', step: 'law', stepIndex: 1, totalSteps: 3 });

  const lawRaw = await withRetry(() =>
    provider.chat(
      buildLawMessages(
        session.idea,
        overviewData.overview,
        overviewData.governanceModel,
        overviewData.economicModel
      ),
      { maxTokens: 3000 }
    )
  );
  const lawData = parseJSON<{ law: string }>(lawRaw);

  await db
    .update(sessions)
    .set({ law: lawData.law, updatedAt: now() })
    .where(eq(sessions.id, session.id));

  onProgress({ type: 'step_done', step: 'law', stepIndex: 1 });

  // Step 3: Agents
  onProgress({ type: 'step_start', step: 'agents', stepIndex: 2, totalSteps: 3 });

  const agentsRaw = await withRetry(() =>
    provider.chat(
      buildAgentRosterMessages(
        overviewData.overview,
        lawData.law,
        agentCount,
        overviewData.governanceModel,
        overviewData.economicModel
      ),
      { maxTokens: 8192 }
    )
  );
  const agentsData = parseJSON<{
    agents: Array<{
      name: string;
      role: string;
      background: string;
      initialStats: { wealth: number; health: number; happiness: number };
    }>;
  }>(agentsRaw);

  if (!Array.isArray(agentsData.agents) || agentsData.agents.length === 0) {
    throw new Error('Agent roster generation returned no agents. Please retry.');
  }

  // Clear existing agents and insert new ones in batches of 25
  await db.delete(agents).where(eq(agents.sessionId, session.id));

  const agentRows = agentsData.agents.map(a => ({
    id: uuidv4(),
    sessionId: session.id,
    name: a.name,
    role: a.role,
    background: a.background ?? '',
    initialStats: JSON.stringify(a.initialStats ?? { wealth: 50, health: 70, happiness: 60 }),
    currentStats: JSON.stringify(a.initialStats ?? { wealth: 50, health: 70, happiness: 60 }),
    type: 'citizen',
    status: 'alive',
  }));

  // Insert in batches of 25
  for (let i = 0; i < agentRows.length; i += 25) {
    const batch = agentRows.slice(i, i + 25);
    await db.insert(agents).values(batch);
  }

  await db
    .update(sessions)
    .set({ stage: 'design-review', updatedAt: now() })
    .where(eq(sessions.id, session.id));

  onProgress({ type: 'step_done', step: 'agents', stepIndex: 2 });
  onProgress({ type: 'complete', sessionStage: 'design-review' });
}

interface RefineResult {
  reply: string;
  artifactsUpdated: Array<'overview' | 'law' | 'agents'>;
  agentsSummary: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  background: string;
  initialStats: string;
}

export async function refine(
  session: SessionRow & { title: string },
  currentAgents: AgentRow[],
  refineHistory: ChatMessage[],
  userMessage: string
): Promise<RefineResult> {
  const provider = getProvider();
  const messages = buildRefineMessages(
    session.idea,
    session.societyOverview ?? '',
    session.law ?? '',
    currentAgents.length,
    refineHistory,
    userMessage
  );

  const raw = await withRetry(() => provider.chat(messages, { maxTokens: 4096 }));
  const parsed = parseJSON<{
    reply: string;
    artifactsUpdated: Array<'overview' | 'law' | 'agents'>;
    updatedOverview: string | null;
    updatedLaw: string | null;
    agentChanges: {
      add: Array<{ name: string; role: string; background: string; initialStats: { wealth: number; health: number; happiness: number } }>;
      remove: string[];
      modify: Array<{ name: string; role: string; background: string; initialStats: { wealth: number; health: number; happiness: number } }>;
    };
    agentsSummary: string | null;
  }>(raw);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (parsed.updatedOverview) {
    updates.societyOverview = parsed.updatedOverview;
  }
  if (parsed.updatedLaw) {
    updates.law = parsed.updatedLaw;
  }
  if (Object.keys(updates).length > 1) {
    await db.update(sessions).set(updates).where(eq(sessions.id, session.id));
  }

  // Apply agent changes
  const agentChanges = parsed.agentChanges ?? { add: [], remove: [], modify: [] };

  // Remove agents by name
  if (agentChanges.remove?.length > 0) {
    for (const name of agentChanges.remove) {
      await db
        .delete(agents)
        .where(sql`${agents.sessionId} = ${session.id} AND ${agents.name} = ${name}`);
    }
  }

  // Modify existing agents by name
  if (agentChanges.modify?.length > 0) {
    for (const a of agentChanges.modify) {
      const statsJson = JSON.stringify(a.initialStats ?? { wealth: 50, health: 70, happiness: 60 });
      await db
        .update(agents)
        .set({ role: a.role, background: a.background, initialStats: statsJson, currentStats: statsJson })
        .where(sql`${agents.sessionId} = ${session.id} AND ${agents.name} = ${a.name}`);
    }
  }

  // Add new agents
  if (agentChanges.add?.length > 0) {
    const newRows = agentChanges.add.map(a => ({
      id: uuidv4(),
      sessionId: session.id,
      name: a.name,
      role: a.role,
      background: a.background ?? '',
      initialStats: JSON.stringify(a.initialStats ?? { wealth: 50, health: 70, happiness: 60 }),
      currentStats: JSON.stringify(a.initialStats ?? { wealth: 50, health: 70, happiness: 60 }),
      type: 'citizen',
      status: 'alive',
    }));
    await db.insert(agents).values(newRows);
  }

  return {
    reply: parsed.reply,
    artifactsUpdated: parsed.artifactsUpdated ?? [],
    agentsSummary: parsed.agentsSummary ?? null,
  };
}
