/**
 * C6: Simulation parsers — parse LLM responses for agent intents and resolution (spec §5.6).
 */
import { parseJSON } from './json.js';
import { normalizeActionCode, type ActionCode } from '../mechanics/actionCodes.js';

export interface ParsedAgentIntent {
  intent: string;
  reasoning: string;
  actionCode: ActionCode;
  actionTarget: string | null;
}

export interface ParsedAgentOutcome {
  agentId: string;
  outcome: string;
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
  died: boolean;
  newRole: string | null;
}

export interface ParsedLifecycleEvent {
  type: 'death' | 'role_change';
  agentId: string;
  detail: string;
}

export interface ParsedResolution {
  narrativeSummary: string;
  agentOutcomes: ParsedAgentOutcome[];
  lifecycleEvents: ParsedLifecycleEvent[];
}

export function parseAgentIntent(text: string): ParsedAgentIntent {
  try {
    const raw = parseJSON<Record<string, unknown>>(text);
    return {
      intent: String(raw.intent ?? '').trim() || 'No specific intent.',
      reasoning: String(raw.reasoning ?? '').trim(),
      actionCode: normalizeActionCode(String(raw.actionCode ?? 'NONE')),
      actionTarget: raw.actionTarget ? String(raw.actionTarget) : null,
    };
  } catch {
    // LLM returned prose — treat the whole text as the intent
    return {
      intent: text.trim().slice(0, 500) || 'No specific intent.',
      reasoning: '',
      actionCode: 'NONE',
      actionTarget: null,
    };
  }
}

function clampDelta(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Math.max(-30, Math.min(30, Math.round(isNaN(n) ? 0 : n)));
}

export function parseResolution(text: string): ParsedResolution {
  try {
    const raw = parseJSON<Record<string, unknown>>(text);

    const narrativeSummary = String(raw.narrativeSummary ?? '').trim() || 'The iteration passed without major events.';

    const rawOutcomes = Array.isArray(raw.agentOutcomes) ? raw.agentOutcomes : [];
    // Stat deltas are now computed by the physics engine, not the LLM
    const agentOutcomes: ParsedAgentOutcome[] = rawOutcomes.map((o: Record<string, unknown>) => ({
      agentId: String(o.agentId ?? ''),
      outcome: String(o.outcome ?? '').trim(),
      wealthDelta: 0, // placeholder — physics engine provides actual values
      healthDelta: 0,
      happinessDelta: 0,
      died: o.died === true,
      newRole: o.newRole ? String(o.newRole) : null,
    }));

    const rawEvents = Array.isArray(raw.lifecycleEvents) ? raw.lifecycleEvents : [];
    const lifecycleEvents: ParsedLifecycleEvent[] = rawEvents.map((e: Record<string, unknown>) => ({
      type: e.type === 'role_change' ? 'role_change' : 'death',
      agentId: String(e.agentId ?? ''),
      detail: String(e.detail ?? ''),
    }));

    return { narrativeSummary, agentOutcomes, lifecycleEvents };
  } catch {
    // LLM returned prose instead of JSON — use the text as the narrative summary,
    // skip stat updates for this iteration to avoid crashing the simulation
    return {
      narrativeSummary: text.trim().slice(0, 500) || 'The iteration passed without major events.',
      agentOutcomes: [],
      lifecycleEvents: [],
    };
  }
}

export function parseFinalReport(text: string): string {
  const raw = parseJSON<Record<string, unknown>>(text);
  return String(raw.finalReport ?? '').trim() || text.trim();
}

// ── Phase 6: map-reduce parsers ──────────────────────────────────────────────

export interface ParsedGroupResolution {
  groupSummary: string;
  agentOutcomes: ParsedAgentOutcome[];
  lifecycleEvents: ParsedLifecycleEvent[];
}

export function parseGroupResolution(text: string): ParsedGroupResolution {
  try {
    const raw = parseJSON<Record<string, unknown>>(text);
    const groupSummary = String(raw.groupSummary ?? '').trim() || 'The group continued their activities.';

    const rawOutcomes = Array.isArray(raw.agentOutcomes) ? raw.agentOutcomes : [];
    // Stat deltas are now computed by the physics engine, not the LLM
    const agentOutcomes: ParsedAgentOutcome[] = rawOutcomes.map((o: Record<string, unknown>) => ({
      agentId: String(o.agentId ?? ''),
      outcome: String(o.outcome ?? '').trim(),
      wealthDelta: 0, // placeholder — physics engine provides actual values
      healthDelta: 0,
      happinessDelta: 0,
      died: o.died === true,
      newRole: o.newRole ? String(o.newRole) : null,
    }));

    const rawEvents = Array.isArray(raw.lifecycleEvents) ? raw.lifecycleEvents : [];
    const lifecycleEvents: ParsedLifecycleEvent[] = rawEvents.map((e: Record<string, unknown>) => ({
      type: e.type === 'role_change' ? 'role_change' : 'death',
      agentId: String(e.agentId ?? ''),
      detail: String(e.detail ?? ''),
    }));

    return { groupSummary, agentOutcomes, lifecycleEvents };
  } catch {
    return { groupSummary: 'The group continued their activities.', agentOutcomes: [], lifecycleEvents: [] };
  }
}

export interface ParsedMergeResolution {
  narrativeSummary: string;
  lifecycleEvents: ParsedLifecycleEvent[];
}

export function parseMergeResolution(text: string): ParsedMergeResolution {
  try {
    const raw = parseJSON<Record<string, unknown>>(text);
    const narrativeSummary = String(raw.narrativeSummary ?? '').trim() || 'The iteration passed.';
    const rawEvents = Array.isArray(raw.lifecycleEvents) ? raw.lifecycleEvents : [];
    const lifecycleEvents: ParsedLifecycleEvent[] = rawEvents.map((e: Record<string, unknown>) => ({
      type: e.type === 'role_change' ? 'role_change' : 'death',
      agentId: String(e.agentId ?? ''),
      detail: String(e.detail ?? ''),
    }));
    return { narrativeSummary, lifecycleEvents };
  } catch {
    return { narrativeSummary: text.trim().slice(0, 500) || 'The iteration passed.', lifecycleEvents: [] };
  }
}
