import type { Agent } from '@idealworld/shared';
import type { TickAgentState, NeedsInterrupt } from '@idealworld/shared';

/**
 * In-memory tick state for running simulation.
 * Avoids per-tick DB reads for hot-path needs data.
 * Flushed to DB every N ticks or on task completion.
 */
export class TickStateStore {
    private states = new Map<string, TickAgentState>();
    private globalTick = 0;
    private economicTriggers = new Map<string, string>();

    init(agents: Agent[]): void {
        this.globalTick = 0;
        for (const agent of agents) {
            this.states.set(agent.id, {
                satiety: 70,
                cortisol: agent.currentStats.cortisol ?? 20,
                energy: 80,
                activeTask: null,
                lastPromptedTick: -1,
                pendingInterrupt: null,
            });
        }
    }

    get(agentId: string): TickAgentState | undefined {
        return this.states.get(agentId);
    }

    set(agentId: string, state: Partial<TickAgentState>): void {
        const existing = this.states.get(agentId);
        if (existing) this.states.set(agentId, { ...existing, ...state });
    }

    incrementTick(): number {
        return ++this.globalTick;
    }

    getCurrentTick(): number {
        return this.globalTick;
    }

    queueEconomicTrigger(agentId: string, reason: string): void {
        this.economicTriggers.set(agentId, reason);
    }

    getEconomicTriggers(): Map<string, string> {
        const current = this.economicTriggers;
        this.economicTriggers = new Map();
        return current;
    }

    /** Dump all states for DB flush — called every 10 ticks */
    snapshot(): Map<string, TickAgentState> {
        return new Map(this.states);
    }
}

export const tickStateStore = new TickStateStore();
