import path from 'path';
import os from 'os';
import fs from 'fs';
import type { AppSettings } from '@idealworld/shared';

const CONFIG_DIR = path.join(os.homedir(), '.idealworld');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'claude',
  apiKey: '',
  baseUrl: 'http://localhost:1234/v1',
  centralAgentModel: 'claude-sonnet-4-6',
  citizenAgentModel: 'claude-haiku-4-5-20251001',
  maxConcurrency: 10,
};

export function readSettings(): AppSettings {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(updates: Partial<AppSettings>): AppSettings {
  const current = readSettings();
  const next: AppSettings = { ...current, ...updates };

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}
