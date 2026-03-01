import { apiFetch } from './client';
import type { AppSettings, SettingsResponse, TestResult } from '@idealworld/shared';

export const settingsApi = {
  get: () => apiFetch<SettingsResponse>('/settings'),

  update: (s: Partial<AppSettings>) =>
    apiFetch<SettingsResponse>('/settings', 'PUT', s),

  // Pass the current form state so the server can test with the live key
  // even before the user has clicked Save.
  test: (overrides?: Partial<AppSettings>) =>
    apiFetch<TestResult>('/settings/test', 'POST', overrides ?? {}),
};
