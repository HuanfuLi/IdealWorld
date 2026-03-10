import { Router } from 'express';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, agents, iterations, chatMessages, agentIntents } from '../db/schema.js';
import { v4 as uuidv4 } from 'uuid';
import type { SessionMetadata, SessionDetail, Agent, ChatMessage, Stage } from '@idealworld/shared';

const router = Router();

// GET /api/sessions — list all sessions with metadata
router.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: sessions.id,
        title: sessions.title,
        idea: sessions.idea,
        stage: sessions.stage,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .orderBy(sql`${sessions.updatedAt} DESC`);

    const result: SessionMetadata[] = await Promise.all(
      rows.map(async (session) => {
        const [agentCountRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(agents)
          .where(eq(agents.sessionId, session.id));

        const [iterCountRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(iterations)
          .where(eq(iterations.sessionId, session.id));

        return {
          id: session.id,
          title: session.title,
          idea: session.idea,
          stage: session.stage as Stage,
          agentCount: Number(agentCountRow?.count ?? 0),
          totalIterations: 0,
          completedIterations: Number(iterCountRow?.count ?? 0),
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error('GET /sessions error:', err);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// POST /api/sessions — create a new session
// Body: { idea, title? }  (spec §5.2)
router.post('/', async (req, res) => {
  const body = req.body as { idea?: string; title?: string; seedIdea?: string; name?: string };
  const idea = body.idea ?? body.seedIdea; // accept legacy field name

  if (!idea || idea.trim().length < 10) {
    return res.status(400).json({ error: 'idea must be at least 10 characters' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const title = body.title?.trim() || body.name?.trim() || idea.trim().slice(0, 60);

  try {
    await db.insert(sessions).values({
      id,
      title,
      idea: idea.trim(),
      stage: 'idea-input',
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ id });
  } catch (err) {
    console.error('POST /sessions error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/:id — session detail
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let config = null;
    if (session.config) {
      try {
        config = JSON.parse(session.config);
      } catch {
        // ignore malformed config
      }
    }

    const detail: SessionDetail = {
      id: session.id,
      title: session.title,
      idea: session.idea,
      stage: session.stage as Stage,
      config,
      law: session.law ?? null,
      societyOverview: session.societyOverview ?? null,
      timeScale: session.timeScale ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };

    res.json(detail);
  } catch (err) {
    console.error('GET /sessions/:id error:', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// GET /api/sessions/:id/agents — agent roster
router.get('/:id/agents', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.sessionId, id))
      .orderBy(asc(agents.name));

    const result: Agent[] = rows.map(a => ({
      id: a.id,
      sessionId: a.sessionId,
      name: a.name,
      role: a.role,
      background: a.background,
      initialStats: (() => {
        try { return JSON.parse(a.initialStats); } catch { return { wealth: 50, health: 70, happiness: 60 }; }
      })(),
      currentStats: (() => {
        try { return JSON.parse(a.currentStats); } catch { return { wealth: 50, health: 70, happiness: 60 }; }
      })(),
      isAlive: a.status === 'alive',
      isCentralAgent: a.type === 'central' || undefined,
      status: a.status,
      type: a.type,
      bornAtIteration: a.bornAtIteration ?? null,
      diedAtIteration: a.diedAtIteration ?? null,
    }));

    res.json({ agents: result, total: result.length });
  } catch (err) {
    console.error('GET /sessions/:id/agents error:', err);
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

// GET /api/sessions/:id/agent-intents — all stored agent intents grouped by agent
router.get('/:id/agent-intents', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await db
      .select({
        agentId: agentIntents.agentId,
        agentName: agents.name,
        role: agents.role,
        actionCode: agentIntents.actionCode,
        actionTarget: agentIntents.actionTarget,
        actionQueue: agentIntents.actionQueue,
        intent: agentIntents.intent,
        iterationNumber: iterations.iterationNumber,
      })
      .from(agentIntents)
      .innerJoin(agents, eq(agentIntents.agentId, agents.id))
      .leftJoin(iterations, eq(agentIntents.iterationId, iterations.id))
      .where(eq(agentIntents.sessionId, id))
      .orderBy(asc(sql`COALESCE(${iterations.iterationNumber}, 9999999)`), asc(agentIntents.createdAt));

    // Find the max completed iteration to infer the iteration number of mid-flight intents
    const [maxIterRow] = await db.select({ max: sql<number>`max(${iterations.iterationNumber})` })
      .from(iterations).where(eq(iterations.sessionId, id));
    const maxCompleted = maxIterRow?.max ?? 0;
    const currentRunning = maxCompleted + 1;

    // Group by agentId preserving insertion order
    const byAgent = new Map<string, {
      agentId: string; agentName: string; role: string;
      intents: Array<{
        iterationNumber: number;
        actionCode: string;
        actionTarget: string | null;
        actions: Array<{ actionCode: string; parameters: Record<string, unknown> }>;
        narrative: string;
      }>;
    }>();
    for (const row of rows) {
      if (!byAgent.has(row.agentId)) {
        byAgent.set(row.agentId, { agentId: row.agentId, agentName: row.agentName, role: row.role, intents: [] });
      }
      let actions: Array<{ actionCode: string; parameters: Record<string, unknown> }> = [];
      if (row.actionQueue) {
        try {
          const parsed = JSON.parse(row.actionQueue);
          if (Array.isArray(parsed)) actions = parsed;
        } catch { /* ignore malformed queue */ }
      }
      byAgent.get(row.agentId)!.intents.push({
        iterationNumber: row.iterationNumber ?? currentRunning,
        actionCode: row.actionCode ?? 'NONE',
        actionTarget: row.actionTarget ?? null,
        actions,
        narrative: row.intent,
      });
    }

    res.json({ agents: Array.from(byAgent.values()) });
  } catch (err) {
    console.error('GET /sessions/:id/agent-intents error:', err);
    res.status(500).json({ error: 'Failed to load agent intents' });
  }
});

// GET /api/sessions/:id/messages — chat history
// Supports ?context=brainstorm|refinement|review:<agentId>
// Without ?context returns all messages grouped by context (legacy)
router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const contextFilter = req.query.context as string | undefined;
  try {
    let query = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(asc(chatMessages.timestamp));

    const rows = await query;

    const toMsg = (r: typeof rows[0]): ChatMessage => ({
      id: r.id,
      sessionId: r.sessionId,
      context: r.context as ChatMessage['context'],
      agentId: r.agentId ?? null,
      role: r.role as 'user' | 'assistant' | 'system',
      content: r.content,
      timestamp: r.timestamp,
    });

    if (contextFilter) {
      // Return flat array filtered by context
      const filtered = rows.filter(r => r.context === contextFilter).map(toMsg);
      return res.json(filtered);
    }

    // Legacy grouped response for backward compat
    res.json({
      brainstorm: rows.filter(r => r.context === 'brainstorm').map(toMsg),
      refinement: rows.filter(r => r.context === 'refinement').map(toMsg),
    });
  } catch (err) {
    console.error('GET /sessions/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// PATCH /api/sessions/:id/stage — update stage only (spec §5.2)
router.patch('/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body as { stage?: string };

  if (!stage) {
    return res.status(400).json({ error: 'stage is required' });
  }

  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const now = new Date().toISOString();
    await db
      .update(sessions)
      .set({ stage, updatedAt: now })
      .where(eq(sessions.id, id));

    const [updated] = await db.select().from(sessions).where(eq(sessions.id, id));
    let config = null;
    if (updated.config) {
      try { config = JSON.parse(updated.config); } catch { /* ignore */ }
    }

    res.json({
      id: updated.id,
      title: updated.title,
      idea: updated.idea,
      stage: updated.stage,
      config,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('PATCH /sessions/:id/stage error:', err);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});

// PUT /api/sessions/:id/config — patch config fields (kept for backward compat)
router.put('/:id/config', async (req, res) => {
  const { id } = req.params;
  const body = req.body as { totalIterations?: number; checklist?: unknown; readyForDesign?: boolean; stage?: string };

  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let currentConfig: Record<string, unknown> = {};
    if (session.config) {
      try { currentConfig = JSON.parse(session.config); } catch { /* ignore */ }
    }

    const updatedConfig = { ...currentConfig };
    if (body.totalIterations !== undefined) updatedConfig.totalIterations = body.totalIterations;
    if (body.checklist !== undefined) updatedConfig.checklist = body.checklist;
    if (body.readyForDesign !== undefined) updatedConfig.readyForDesign = body.readyForDesign;

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      config: JSON.stringify(updatedConfig),
      updatedAt: now,
    };
    if (body.stage) updates.stage = body.stage;

    await db.update(sessions).set(updates).where(eq(sessions.id, id));

    const [updated] = await db.select().from(sessions).where(eq(sessions.id, id));
    res.json({
      id: updated.id,
      stage: updated.stage,
      config: updatedConfig,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('PUT /sessions/:id/config error:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// POST /api/sessions/:id/fork — clone session design into a new session
router.post('/:id/fork', async (req, res) => {
  const { id } = req.params;
  const body = req.body as { iterations?: number };

  try {
    const [source] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!source) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const newId = uuidv4();
    const now = new Date().toISOString();
    const totalIterations = body.iterations || 20;

    const config = JSON.stringify({
      totalIterations,
      checklist: { governance: true, economy: true, legal: true, culture: true, infrastructure: true },
      readyForDesign: true,
    });

    await db.insert(sessions).values({
      id: newId,
      title: `${source.title} (fork)`,
      idea: source.idea,
      stage: 'design-review',
      config,
      law: source.law,
      societyOverview: source.societyOverview,
      timeScale: source.timeScale,
      createdAt: now,
      updatedAt: now,
    });

    // Copy agents with fresh stats
    const sourceAgents = await db.select().from(agents).where(eq(agents.sessionId, id));
    for (const a of sourceAgents) {
      await db.insert(agents).values({
        id: uuidv4(),
        sessionId: newId,
        name: a.name,
        role: a.role,
        background: a.background,
        initialStats: a.initialStats,
        currentStats: a.initialStats, // reset to initial
        status: 'alive',
        type: a.type,
        bornAtIteration: null,
        diedAtIteration: null,
      });
    }

    res.status(201).json({ id: newId });
  } catch (err) {
    console.error('POST /sessions/:id/fork error:', err);
    res.status(500).json({ error: 'Failed to fork session' });
  }
});

// POST /api/sessions/:id/fork-simulation — fork with simulation data preserved
router.post('/:id/fork-simulation', async (req, res) => {
  const { id } = req.params;

  try {
    const [source] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!source) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const newId = uuidv4();
    const now = new Date().toISOString();

    // Find max iteration number for config
    const [maxRow] = await db.select({ max: sql<number>`max(${iterations.iterationNumber})` })
      .from(iterations).where(eq(iterations.sessionId, id));
    const maxIterNum = maxRow?.max ?? 0;

    const config = JSON.stringify({ totalIterations: maxIterNum });

    await db.insert(sessions).values({
      id: newId,
      title: `${source.title} (fork)`,
      idea: source.idea,
      stage: 'simulation-complete',
      config,
      law: source.law,
      societyOverview: source.societyOverview,
      timeScale: source.timeScale,
      createdAt: now,
      updatedAt: now,
    });

    // Copy agents — preserve currentStats as both initial and current
    const sourceAgents = await db.select().from(agents).where(eq(agents.sessionId, id));
    for (const a of sourceAgents) {
      await db.insert(agents).values({
        id: uuidv4(),
        sessionId: newId,
        name: a.name,
        role: a.role,
        background: a.background,
        initialStats: a.currentStats,
        currentStats: a.currentStats,
        status: a.status,
        type: a.type,
        bornAtIteration: a.bornAtIteration ?? null,
        diedAtIteration: a.diedAtIteration ?? null,
      });
    }

    // Copy all iterations
    const sourceIters = await db.select().from(iterations)
      .where(eq(iterations.sessionId, id))
      .orderBy(asc(iterations.iterationNumber));
    for (const it of sourceIters) {
      await db.insert(iterations).values({
        id: uuidv4(),
        sessionId: newId,
        iterationNumber: it.iterationNumber,
        stateSummary: it.stateSummary,
        statistics: it.statistics,
        lifecycleEvents: it.lifecycleEvents,
        timestamp: it.timestamp,
      });
    }

    res.status(201).json({ id: newId });
  } catch (err) {
    console.error('POST /sessions/:id/fork-simulation error:', err);
    res.status(500).json({ error: 'Failed to fork simulation' });
  }
});

// DELETE /api/sessions/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await db.delete(sessions).where(eq(sessions.id, id));
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /sessions/:id error:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
