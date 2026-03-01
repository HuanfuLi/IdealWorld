import { create } from 'zustand';
import { compareApi } from '../api/compare';
import { sessionsApi } from '../api/sessions';
import type { ComparisonResult, SessionMetadata } from '@idealworld/shared';

interface CompareMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CompareStore {
  allSessions: SessionMetadata[];
  selectedIds: string[];
  comparison: ComparisonResult | null;
  messages: CompareMessage[];
  loading: boolean;
  chatPending: boolean;
  error: string | null;

  loadSessions: () => Promise<void>;
  toggleSession: (id: string) => void;
  runComparison: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  allSessions: [] as SessionMetadata[],
  selectedIds: [] as string[],
  comparison: null as ComparisonResult | null,
  messages: [] as CompareMessage[],
  loading: false,
  chatPending: false,
  error: null as string | null,
};

export const useCompareStore = create<CompareStore>((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

  loadSessions: async () => {
    try {
      const sessions = await sessionsApi.list();
      set({ allSessions: sessions });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load sessions' });
    }
  },

  toggleSession: (id: string) => {
    const { selectedIds, comparison } = get();
    // Reset comparison if selection changes
    if (comparison) {
      set({ comparison: null, messages: [], error: null });
    }
    if (selectedIds.includes(id)) {
      set({ selectedIds: selectedIds.filter(s => s !== id) });
    } else if (selectedIds.length < 2) {
      set({ selectedIds: [...selectedIds, id] });
    }
  },

  runComparison: async () => {
    const { selectedIds } = get();
    if (selectedIds.length !== 2) return;

    set({ loading: true, error: null, comparison: null, messages: [] });
    try {
      const comparison = await compareApi.runComparison(selectedIds[0], selectedIds[1]);
      set({ comparison, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Comparison failed',
      });
    }
  },

  sendMessage: async (text: string) => {
    const { selectedIds, comparison } = get();
    if (!comparison || selectedIds.length !== 2) return;

    const userMsg: CompareMessage = { role: 'user', content: text };
    set(state => ({ messages: [...state.messages, userMsg], chatPending: true, error: null }));

    try {
      const reply = await compareApi.sendMessage(selectedIds[0], selectedIds[1], text);
      const assistantMsg: CompareMessage = { role: 'assistant', content: reply };
      set(state => ({ messages: [...state.messages, assistantMsg], chatPending: false }));
    } catch (err) {
      set({
        chatPending: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      });
    }
  },
}));
