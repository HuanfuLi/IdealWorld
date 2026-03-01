import { create } from 'zustand';
import type { Agent, Iteration, AgentAction, IterationStats } from '@idealworld/shared';

// SSE event shapes mirroring server's SimulationEvent union
interface IterationStartEvent { type: 'iteration-start'; iteration: number; total: number }
interface AgentIntentEvent { type: 'agent-intent'; agentId: string; agentName: string; intent: string }
interface ResolutionEvent { type: 'resolution'; iteration: number; narrativeSummary: string; lifecycleEvents: LifecycleEvent[] }
interface IterationCompleteEvent { type: 'iteration-complete'; iteration: number; stats: IterationStats }
interface SimulationCompleteEvent { type: 'simulation-complete'; finalReport: string }
interface PausedEvent { type: 'paused'; iteration: number }
interface ErrorEvent { type: 'error'; message: string }

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
      const res = await fetch(`/api/sessions/${sessionId}/iterations`);
      if (!res.ok) return;
      const iters = await res.json() as Iteration[];
      if (iters.length === 0) return;

      const feed: IterationFeed[] = iters.map(it => ({
        number: it.number,
        narrativeSummary: it.narrativeSummary,
        lifecycleEvents: [],
        stats: null,
      }));

      set({
        feed,
        currentIteration: iters[iters.length - 1].number,
      });
    } catch { /* ignore */ }
  },

  connectSSE: (sessionId: string) => {
    const es = new EventSource(`/api/sessions/${sessionId}/simulate/stream`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as
          | IterationStartEvent | AgentIntentEvent | ResolutionEvent
          | IterationCompleteEvent | SimulationCompleteEvent | PausedEvent | ErrorEvent;

        switch (event.type) {
          case 'iteration-start':
            set({
              isRunning: true,
              isPaused: false,
              currentIteration: event.iteration,
              totalIterations: event.total,
              pendingIntents: {},
            });
            break;

          case 'agent-intent':
            set(state => ({
              pendingIntents: { ...state.pendingIntents, [event.agentId]: event.intent },
            }));
            break;

          case 'resolution':
            set(state => {
              const existingIdx = state.feed.findIndex(f => f.number === event.iteration);
              const entry: IterationFeed = {
                number: event.iteration,
                narrativeSummary: event.narrativeSummary,
                lifecycleEvents: event.lifecycleEvents as LifecycleEvent[],
                stats: null,
              };
              if (existingIdx >= 0) {
                const newFeed = [...state.feed];
                newFeed[existingIdx] = { ...newFeed[existingIdx], ...entry };
                return { feed: newFeed };
              }
              return { feed: [...state.feed, entry] };
            });
            break;

          case 'iteration-complete':
            set(state => {
              const newFeed = state.feed.map(f =>
                f.number === event.iteration ? { ...f, stats: event.stats } : f
              );
              return {
                feed: newFeed,
                statsHistory: [...state.statsHistory, event.stats],
                pendingIntents: {},
              };
            });
            // Reload agents to get updated stats
            get().loadAgents(sessionId);
            break;

          case 'simulation-complete':
            set({ isRunning: false, isComplete: true, finalReport: event.finalReport });
            get().loadAgents(sessionId);
            break;

          case 'paused':
            set({ isRunning: false, isPaused: true });
            break;

          case 'error':
            set({ isRunning: false, error: event.message });
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // SSE errors are normal when server restarts; just close
      es.close();
    };

    return () => es.close();
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
