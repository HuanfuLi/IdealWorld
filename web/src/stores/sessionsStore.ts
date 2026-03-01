import { create } from 'zustand';
import { sessionsApi } from '../api/sessions';
import type { SessionMetadata } from '@idealworld/shared';

interface SessionsStore {
  sessions: SessionMetadata[];
  loading: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  createSession: (idea: string) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
}

export const useSessionsStore = create<SessionsStore>((set, get) => ({
  sessions: [],
  loading: false,
  error: null,

  loadSessions: async () => {
    set({ loading: true, error: null });
    try {
      const sessions = await sessionsApi.list();
      set({ sessions, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load sessions' });
    }
  },

  createSession: async (idea: string) => {
    const { id } = await sessionsApi.create(idea);
    // Refresh the list
    await get().loadSessions();
    return id;
  },

  deleteSession: async (id: string) => {
    await sessionsApi.delete(id);
    set(state => ({ sessions: state.sessions.filter(s => s.id !== id) }));
  },
}));
