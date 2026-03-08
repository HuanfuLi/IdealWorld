/**
 * Economy Repository — persistence for Phase 1 economy data.
 *
 * Handles CRUD for:
 *  - Agent economy state (skills + inventory)
 *  - Economy snapshots per iteration
 *  - Market price history
 */
import { eq, and, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from '../index.js';
import { agentEconomy, economySnapshots, marketPrices } from '../schema.js';
import type { SkillMatrix, Inventory, EconomySnapshot, PriceIndex } from '@idealworld/shared';
import { DEFAULT_SKILL_MATRIX, DEFAULT_INVENTORY } from '@idealworld/shared';

// ── Agent Economy State ──────────────────────────────────────────────────────

function parseSkillsJson(raw: string): SkillMatrix {
    try {
        const parsed = JSON.parse(raw);
        // Validate it has the expected shape
        if (parsed && typeof parsed.farming === 'object') return parsed;
        return structuredClone(DEFAULT_SKILL_MATRIX);
    } catch {
        return structuredClone(DEFAULT_SKILL_MATRIX);
    }
}

function parseInventoryJson(raw: string): Inventory {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.food === 'object') return parsed;
        return structuredClone(DEFAULT_INVENTORY);
    } catch {
        return structuredClone(DEFAULT_INVENTORY);
    }
}

export interface AgentEconomyState {
    agentId: string;
    sessionId: string;
    skills: SkillMatrix;
    inventory: Inventory;
    lastUpdated: number;
}

export const economyRepo = {
    /**
     * Get or initialize economy state for a single agent.
     */
    async getAgentEconomy(agentId: string, sessionId: string): Promise<AgentEconomyState> {
        const [row] = await db.select()
            .from(agentEconomy)
            .where(eq(agentEconomy.agentId, agentId));

        if (row) {
            return {
                agentId: row.agentId,
                sessionId: row.sessionId,
                skills: parseSkillsJson(row.skills),
                inventory: parseInventoryJson(row.inventory),
                lastUpdated: row.lastUpdated,
            };
        }

        // No economy state yet — will be initialized on first use
        return {
            agentId,
            sessionId,
            skills: structuredClone(DEFAULT_SKILL_MATRIX),
            inventory: structuredClone(DEFAULT_INVENTORY),
            lastUpdated: 0,
        };
    },

    /**
     * Load economy state for all agents in a session.
     */
    async listBySession(sessionId: string): Promise<AgentEconomyState[]> {
        const rows = await db.select()
            .from(agentEconomy)
            .where(eq(agentEconomy.sessionId, sessionId));

        return rows.map(row => ({
            agentId: row.agentId,
            sessionId: row.sessionId,
            skills: parseSkillsJson(row.skills),
            inventory: parseInventoryJson(row.inventory),
            lastUpdated: row.lastUpdated,
        }));
    },

    /**
     * Batch upsert economy state for multiple agents.
     * Uses a transaction for performance.
     */
    async bulkUpsertAgentEconomy(
        updates: Array<{
            agentId: string;
            sessionId: string;
            skills: SkillMatrix;
            inventory: Inventory;
            lastUpdated: number;
        }>
    ): Promise<void> {
        if (updates.length === 0) return;

        // Use raw SQL for upsert (INSERT OR REPLACE)
        const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO agent_economy (id, agent_id, session_id, skills, inventory, last_updated)
      VALUES (
        COALESCE(
          (SELECT id FROM agent_economy WHERE agent_id = ?),
          ?
        ),
        ?, ?, ?, ?, ?
      )
    `);

        const run = sqlite.transaction((items: typeof updates) => {
            for (const u of items) {
                const newId = uuidv4();
                stmt.run(
                    u.agentId, newId,
                    u.agentId, u.sessionId,
                    JSON.stringify(u.skills),
                    JSON.stringify(u.inventory),
                    u.lastUpdated,
                );
            }
        });

        run(updates);
    },

    /**
     * Initialize economy state for agents that don't have one.
     */
    async initializeForSession(
        sessionId: string,
        agents: Array<{ id: string; role: string }>
    ): Promise<void> {
        const existing = await this.listBySession(sessionId);
        const existingIds = new Set(existing.map(e => e.agentId));

        const newEntries = agents
            .filter(a => !existingIds.has(a.id))
            .map(a => ({
                agentId: a.id,
                sessionId,
                skills: structuredClone(DEFAULT_SKILL_MATRIX),
                inventory: structuredClone(DEFAULT_INVENTORY),
                lastUpdated: 0,
            }));

        if (newEntries.length > 0) {
            await this.bulkUpsertAgentEconomy(newEntries);
        }
    },

    // ── Economy Snapshots ──────────────────────────────────────────────────

    /**
     * Save an economy snapshot for an iteration.
     */
    async saveSnapshot(
        sessionId: string,
        iterationNumber: number,
        snapshot: EconomySnapshot
    ): Promise<void> {
        await db.insert(economySnapshots).values({
            id: uuidv4(),
            sessionId,
            iterationNumber,
            snapshotData: JSON.stringify(snapshot),
            timestamp: new Date().toISOString(),
        });
    },

    /**
     * Load economy snapshot for a specific iteration.
     */
    async getSnapshot(sessionId: string, iterationNumber: number): Promise<EconomySnapshot | null> {
        const [row] = await db.select()
            .from(economySnapshots)
            .where(
                and(
                    eq(economySnapshots.sessionId, sessionId),
                    eq(economySnapshots.iterationNumber, iterationNumber),
                )
            );

        if (!row) return null;
        try {
            return JSON.parse(row.snapshotData);
        } catch {
            return null;
        }
    },

    // ── Market Prices ──────────────────────────────────────────────────────

    /**
     * Save market price indices for an iteration.
     */
    async savePriceIndices(
        sessionId: string,
        iterationNumber: number,
        indices: PriceIndex[]
    ): Promise<void> {
        if (indices.length === 0) return;

        const rows = indices.map(idx => ({
            id: uuidv4(),
            sessionId,
            iterationNumber,
            itemType: idx.itemType,
            lastPrice: idx.lastPrice,
            vwap: idx.vwap,
            volume: idx.volume,
        }));

        for (let i = 0; i < rows.length; i += 25) {
            await db.insert(marketPrices).values(rows.slice(i, i + 25));
        }
    },

    /**
     * Get the most recent price index for every item type in a session.
     * Used to inject market board context into LLM prompts.
     */
    async getLatestPriceIndices(sessionId: string): Promise<PriceIndex[]> {
        // Get the max iteration number that has price data
        const [maxRow] = await db
            .select({ maxIter: sql<number>`max(${marketPrices.iterationNumber})` })
            .from(marketPrices)
            .where(eq(marketPrices.sessionId, sessionId));

        const maxIter = maxRow?.maxIter;
        if (!maxIter) return [];

        const rows = await db.select()
            .from(marketPrices)
            .where(
                and(
                    eq(marketPrices.sessionId, sessionId),
                    eq(marketPrices.iterationNumber, maxIter),
                )
            );

        return rows.map(r => ({
            itemType: r.itemType as PriceIndex['itemType'],
            lastPrice: r.lastPrice,
            vwap: r.vwap,
            volume: r.volume,
            totalDemand: 0,
            totalSupply: 0,
        }));
    },

    /**
     * Get price history for a specific item in a session.
     */
    async getPriceHistory(
        sessionId: string,
        itemType: string
    ): Promise<Array<{ iterationNumber: number; lastPrice: number; vwap: number; volume: number }>> {
        const rows = await db.select()
            .from(marketPrices)
            .where(
                and(
                    eq(marketPrices.sessionId, sessionId),
                    eq(marketPrices.itemType, itemType),
                )
            );

        return rows.map(r => ({
            iterationNumber: r.iterationNumber,
            lastPrice: r.lastPrice,
            vwap: r.vwap,
            volume: r.volume,
        }));
    },
};
