import { create } from 'zustand';
import { brainstormApi } from '../api/brainstorm';
import type { SessionDetail, ChatMessage, Agent, DesignProgressEvent } from '@idealworld/shared';

interface DesignProgress {
  active: boolean;
  currentStep: 'overview' | 'law' | 'agents' | null;
  completedSteps: Array<'overview' | 'law' | 'agents'>;
  error: string | null;
}

interface SessionDetailStore {
  session: SessionDetail | null;
  brainstormMessages: ChatMessage[];
  refinementMessages: ChatMessage[];
  agents: Agent[];
  loading: boolean;
  chatPending: boolean;
  designProgress: DesignProgress;
  error: string | null;

  loadSession: (id: string) => Promise<void>;
  loadAgents: (id: string) => Promise<void>;
  sendBrainstormMessage: (id: string, text: string) => Promise<void>;
  startDesignGeneration: (id: string) => Promise<void>;
  sendRefinementMessage: (id: string, text: string) => Promise<void>;
  startSimulation: (id: string, totalIterations: number) => Promise<void>;
  reset: () => void;
}

const defaultProgress: DesignProgress = {
  active: false,
  currentStep: null,
  completedSteps: [],
  error: null,
};

export const useSessionDetailStore = create<SessionDetailStore>((set, get) => ({
  session: null,
  brainstormMessages: [],
  refinementMessages: [],
  agents: [],
  loading: false,
  chatPending: false,
  designProgress: defaultProgress,
  error: null,

  reset: () =>
    set({
      session: null,
      brainstormMessages: [],
      refinementMessages: [],
      agents: [],
      loading: false,
      chatPending: false,
      designProgress: defaultProgress,
      error: null,
    }),

  loadSession: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const [session, messages, agentsResult] = await Promise.all([
        brainstormApi.getSession(id),
        brainstormApi.getMessages(id),
        brainstormApi.getAgents(id),
      ]);
      set({
        session,
        brainstormMessages: messages.brainstorm,
        refinementMessages: messages.refinement,
        agents: agentsResult.agents,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load session',
      });
    }
  },

  loadAgents: async (id: string) => {
    try {
      const result = await brainstormApi.getAgents(id);
      set({ agents: result.agents });
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  },

  sendBrainstormMessage: async (id: string, text: string) => {
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: id,
      context: 'brainstorm',
      agentId: null,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    set(state => ({
      brainstormMessages: [...state.brainstormMessages, optimisticMsg],
      chatPending: true,
    }));

    try {
      const response = await brainstormApi.chat(id, text, 'brainstorm');

      const assistantMsg: ChatMessage = {
        id: `temp-agent-${Date.now()}`,
        sessionId: id,
        context: 'brainstorm',
        agentId: null,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
      };

      set(state => ({
        brainstormMessages: [...state.brainstormMessages, assistantMsg],
        chatPending: false,
        session: state.session
          ? {
              ...state.session,
              stage: state.session.stage === 'idea-input' ? 'brainstorming' : state.session.stage,
              config: state.session.config
                ? {
                    ...state.session.config,
                    checklist: response.updatedChecklist ?? state.session.config.checklist,
                    readyForDesign: response.readyForDesign,
                  }
                : {
                    totalIterations: 20,
                    checklist: response.updatedChecklist ?? {
                      governance: false,
                      economy: false,
                      legal: false,
                      culture: false,
                      infrastructure: false,
                    },
                    readyForDesign: response.readyForDesign,
                  },
            }
          : null,
      }));
    } catch (err) {
      set(state => ({
        brainstormMessages: state.brainstormMessages.filter(m => m.id !== optimisticMsg.id),
        chatPending: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      }));
    }
  },

  startDesignGeneration: async (id: string) => {
    set({
      designProgress: {
        active: true,
        currentStep: null,
        completedSteps: [],
        error: null,
      },
    });

    try {
      // POST /api/sessions/:id/design (spec §5.2)
      const response = await fetch(`/api/sessions/${id}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as DesignProgressEvent;

            if (event.type === 'step_start') {
              set(state => ({
                designProgress: {
                  ...state.designProgress,
                  currentStep: event.step,
                },
              }));
            } else if (event.type === 'step_done') {
              set(state => ({
                designProgress: {
                  ...state.designProgress,
                  completedSteps: [...state.designProgress.completedSteps, event.step],
                  currentStep: state.designProgress.currentStep === event.step
                    ? null
                    : state.designProgress.currentStep,
                },
              }));
            } else if (event.type === 'complete') {
              set(state => ({
                designProgress: {
                  ...state.designProgress,
                  active: false,
                  currentStep: null,
                },
                session: state.session
                  ? { ...state.session, stage: event.sessionStage }
                  : null,
              }));
            } else if (event.type === 'error') {
              set({
                designProgress: {
                  active: false,
                  currentStep: null,
                  completedSteps: [],
                  error: event.message,
                },
              });
            }
          } catch {
            // ignore parse errors for individual SSE lines
          }
        }
      }
    } catch (err) {
      set({
        designProgress: {
          active: false,
          currentStep: null,
          completedSteps: [],
          error: err instanceof Error ? err.message : 'Design generation failed',
        },
      });
    }
  },

  sendRefinementMessage: async (id: string, text: string) => {
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: id,
      context: 'refinement',
      agentId: null,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    set(state => ({
      refinementMessages: [...state.refinementMessages, optimisticMsg],
      chatPending: true,
    }));

    try {
      const response = await brainstormApi.chat(id, text, 'refinement');

      const assistantMsg: ChatMessage = {
        id: `temp-agent-${Date.now()}`,
        sessionId: id,
        context: 'refinement',
        agentId: null,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
      };

      set(state => ({
        refinementMessages: [...state.refinementMessages, assistantMsg],
        chatPending: false,
      }));

      if (response.artifactsUpdated.includes('agents')) {
        await get().loadAgents(id);
      }
      if (response.artifactsUpdated.includes('overview') || response.artifactsUpdated.includes('law')) {
        const session = await brainstormApi.getSession(id);
        set({ session });
      }
    } catch (err) {
      set(state => ({
        refinementMessages: state.refinementMessages.filter(m => m.id !== optimisticMsg.id),
        chatPending: false,
        error: err instanceof Error ? err.message : 'Refinement chat failed',
      }));
    }
  },

  startSimulation: async (id: string, totalIterations: number) => {
    const res = await fetch(`/api/sessions/${id}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iterations: totalIterations }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    set(state => ({
      session: state.session ? { ...state.session, stage: 'simulating' } : null,
    }));
  },
}));
