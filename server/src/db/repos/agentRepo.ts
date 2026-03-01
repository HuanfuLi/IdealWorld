/**
 * C1: AgentRepo — CRUD for agents (spec §5.5).
 */
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../index.js';
import { agents } from '../schema.js';
import type { Agent, AgentStats } from '@idealworld/shared';

function parseStats(raw: string): AgentStats {
  try { return JSON.parse(raw); } catch { return { wealth: 50, health: 70, happiness: 60 }; }
}

function rowToAgent(row: typeof agents.$inferSelect): Agent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    role: row.role,
    background: row.background,
    initialStats: parseStats(row.initialStats),
    currentStats: parseStats(row.currentStats),
    isAlive: row.status === 'alive',
    isCentralAgent: row.type === 'central' || undefined,
    status: row.status,
    type: row.type,
    bornAtIteration: row.bornAtIteration ?? null,
    diedAtIteration: row.diedAtIteration ?? null,
  };
}

export const agentRepo = {
  async bulkCreate(
    agentData: Omit<Agent, 'id' | 'isAlive' | 'isCentralAgent'>[]
  ): Promise<Agent[]> {
    const rows = agentData.map(a => ({
      id: uuidv4(),
      sessionId: a.sessionId,
      name: a.name,
      role: a.role,
      background: a.background,
      initialStats: JSON.stringify(a.initialStats),
      currentStats: JSON.stringify(a.currentStats),
      type: a.type ?? 'citizen',
      status: a.status ?? 'alive',
      bornAtIteration: a.bornAtIteration ?? undefined,
      diedAtIteration: a.diedAtIteration ?? undefined,
    }));

    // Insert in batches of 25
    for (let i = 0; i < rows.length; i += 25) {
      await db.insert(agents).values(rows.slice(i, i + 25));
    }

    const inserted = await this.listBySession(agentData[0]?.sessionId ?? '');
    return inserted;
  },

  async listBySession(sessionId: string): Promise<Agent[]> {
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.sessionId, sessionId));
    return rows.map(rowToAgent);
  },

  /**
   * Update an agent's current stats after an iteration resolves.
   * Clamps values to [0, 100].
   */
  async updateStats(id: string, wealth: number, health: number, happiness: number): Promise<Agent> {
    const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
    const stats: AgentStats = {
      wealth: clamp(wealth),
      health: clamp(health),
      happiness: clamp(happiness),
    };
    await db
      .update(agents)
      .set({ currentStats: JSON.stringify(stats) })
      .where(eq(agents.id, id));
    const [row] = await db.select().from(agents).where(eq(agents.id, id));
    return rowToAgent(row);
  },

  async markDead(id: string, iterationNumber: number): Promise<void> {
    await db
      .update(agents)
      .set({ status: 'dead', diedAtIteration: iterationNumber })
      .where(eq(agents.id, id));
  },
};
