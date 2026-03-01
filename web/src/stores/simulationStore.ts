import { create } from 'zustand';
import type { Agent, Iteration, IterationStats } from '@idealworld/shared';

// SSE event shapes mirroring server's SimulationEvent union
type SSEEvent =
  | { type: 'iteration-start'; iteration: number; total: number }
  | { type: 'agent-intent'; agentId: string; agentName: string; intent: string }
  | { type: 'resolution'; iteration: number; narrativeSummary: string; lifecycleEvents: LifecycleEvent[] }
  | { type: 'iteration-complete'; iteration: number; stats: IterationStats }
  | { type: 'simulation-complete'; finalReport: string }
  | { type: 'paused'; iteration: number }
  | { type: 'error'; message: string };

export interface LifecycleEvent {
  type: 'death' | 'role_change';
  agentId: string;
  detail: string;
}

export interface IterationFeed {
  number: number;
  narrativeSummary: string;
  lifecycleEvents: LifecycleEvent[];
  stats: IterationStats | null;
}

interface SimulationStore {
  // Status
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  currentIteration: number;
  totalIterations: number;

  // Live feed
  feed: IterationFeed[];
  pendingIntents: Record<string, string>; // agentId → intent

  // Stats history
  statsHistory: IterationStats[];

  // Agents (loaded from API)
  agents: Agent[];

  // Final report
  finalReport: string | null;

  // Error
  error: string | null;

  // Actions
  loadAgents: (sessionId: string) => Promise<void>;
  loadHistory: (sessionId: string) => Promise<void>;
  connectSSE: (sessionId: string) => () => void;
  pause: (sessionId: string) => Promise<void>;
  resume: (sessionId: string) => Promise<void>;
  abort: (sessionId: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  isRunning: false,
  isPaused: false,
  isComplete: false,
  currentIteration: 0,
  totalIterations: 0,
  feed: [] as IterationFeed[],
  pendingIntents: {} as Record<string, string>,
  statsHistory: [] as IterationStats[],
  agents: [] as Agent[],
  finalReport: null as string | null,
  error: null as string | null,
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

  loadAgents: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/agents`);
      if (!res.ok) return;
      const data = await res.json() as { agents: Agent[] };
      set({ agents: data.agents });
    } catch { /* ignore */ }
  },

  loadHistory: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/iterations?full=true`);
      if (!res.ok) return;
      const iters = await res.json() as Array<Iteration & { statistics?: IterationStats; lifecycleEvents?: LifecycleEvent[] }>;
      if (iters.length === 0) return;

      const feed: IterationFeed[] = iters.map(it => ({
        number: it.number,
        narrativeSummary: it.narrativeSummary,
        lifecycleEvents: (it.lifecycleEvents ?? []) as LifecycleEvent[],
        stats: it.statistics ?? null,
      }));

      const statsHistory: IterationStats[] = iters
        .filter(it => it.statistics)
        .map(it => it.statistics!);

      set({
        feed,
        statsHistory,
        currentIteration: iters[iters.length - 1].number,
        totalIterations: iters.length,
      });
    } catch { /* ignore */ }
  },

  connectSSE: (sessionId: string) => {
    const es = new EventSource(`/api/sessions/${sessionId}/simulate/stream`);

    // ── Double-buffering: push events into a mutable buffer and flush
    // via requestAnimationFrame to avoid per-event React re-renders. ────
    const buffer: SSEEvent[] = [];
    let rafId: number | null = null;

    const flushBuffer = () => {
      rafId = null;
      if (buffer.length === 0) return;

      const batch = buffer.splice(0);
      let needAgentReload = false;

      set(state => {
        // Clone mutable state we'll update across the batch
        let { isRunning, isPaused, isComplete, currentIteration, totalIterations,
              pendingIntents, feed, statsHistory, finalReport, error } = state;

        // Process as mutable copies to avoid intermediate object allocations
        feed = [...feed];
        pendingIntents = { ...pendingIntents };

        for (const event of batch) {
          switch (event.type) {
            case 'iteration-start':
              isRunning = true;
              isPaused = false;
              currentIteration = event.iteration;
              totalIterations = event.total;
              pendingIntents = {};
              break;

            case 'agent-intent':
              pendingIntents[event.agentId] = event.intent;
              break;

            case 'resolution': {
              const entry: IterationFeed = {
                number: event.iteration,
                narrativeSummary: event.narrativeSummary,
                lifecycleEvents: event.lifecycleEvents as LifecycleEvent[],
                stats: null,
              };
              const idx = feed.findIndex(f => f.number === event.iteration);
              if (idx >= 0) {
                feed[idx] = { ...feed[idx], ...entry };
              } else {
                feed.push(entry);
              }
              break;
            }

            case 'iteration-complete': {
              feed = feed.map(f =>
                f.number === event.iteration ? { ...f, stats: event.stats } : f
              );
              statsHistory = [...statsHistory, event.stats];
              pendingIntents = {};
              needAgentReload = true;
              break;
            }

            case 'simulation-complete':
              isRunning = false;
              isComplete = true;
              finalReport = event.finalReport;
              needAgentReload = true;
              break;

            case 'paused':
              isRunning = false;
              isPaused = true;
              break;

            case 'error':
              isRunning = false;
              error = event.message;
              break;
          }
        }

        return {
          isRunning, isPaused, isComplete, currentIteration, totalIterations,
          pendingIntents, feed, statsHistory, finalReport, error,
        };
      });

      if (needAgentReload) {
        get().loadAgents(sessionId);
      }
    };

    const scheduleFlush = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(flushBuffer);
      }
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        buffer.push(event);
        scheduleFlush();
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      if (rafId !== null) cancelAnimationFrame(rafId);
      // Flush any remaining events synchronously
      flushBuffer();
    };
  },

  pause: async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}/simulate/pause`, { method: 'POST' });
  },

  resume: async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}/simulate/resume`, { method: 'POST' });
    set({ isPaused: false, isRunning: true });
  },

  abort: async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}/simulate/abort`, { method: 'POST' });
    set({ isRunning: false, isPaused: false });
  },
}));
