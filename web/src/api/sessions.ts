import { apiFetch } from './client';
import type { SessionMetadata } from '@idealworld/shared';

export const sessionsApi = {
  list: () => apiFetch<SessionMetadata[]>('/sessions'),

  create: (idea: string, title?: string) =>
    apiFetch<{ id: string }>('/sessions', 'POST', { idea, title }),

  delete: (id: string) =>
    apiFetch<void>(`/sessions/${id}`, 'DELETE'),
};
