/**
 * GovernanceManager — 5-step political cycle triggered every 5 iterations.
 *
 * Step 1: Selection    — pick 1–3 "politician" agents based on society type
 * Step 2: Proposals    — each politician proposes ONE policy change via LLM
 * Step 3: Ballot       — Central Agent synthesizes proposals into formal ballot
 * Step 4: Voting       — politicians vote YES/NO on each ballot item
 * Step 5: Ratification — majority vote (or autocratic decree) updates session policy
 *
 * All LLM failures are non-fatal: a failed proposal or vote is silently skipped.
 * If fewer than 2 politicians can be selected, the cycle is skipped entirely.
 */

import type { Agent, Session, SessionPolicy } from '@idealworld/shared';
import type { LLMProvider } from '../llm/types.js';
import {
  buildProposalPrompt,
  buildBallotPrompt,
  buildVotePrompt,
} from '../llm/prompts.js';
import type { GovernancePolicyProposal, GovernanceBallotItem } from '../llm/prompts.js';
import { sessionRepo } from '../db/repos/sessionRepo.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GovernanceResult {
  policyChanged: boolean;
  newPolicy: SessionPolicy;
  ratifiedItems: GovernanceBallotItem[];
  rejectedItems: GovernanceBallotItem[];
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract session policy from config, falling back to defaults. */
export function getSessionPolicy(raw: unknown): SessionPolicy {
  const p = raw as Partial<SessionPolicy> | null | undefined;
  return {
    tax_rate: typeof p?.tax_rate === 'number' && isFinite(p.tax_rate) ? p.tax_rate : 0.02,
    ubi_allocation: typeof p?.ubi_allocation === 'number' && isFinite(p.ubi_allocation) ? p.ubi_allocation : 1.0,
    enforcement_level: typeof p?.enforcement_level === 'number' && isFinite(p.enforcement_level) ? p.enforcement_level : 1.0,
  };
}

/** Validate and clamp a proposed policy value to its allowed range. */
function clampPolicyValue(field: GovernancePolicyProposal['field'], value: number): number {
  if (!isFinite(value)) return NaN;
  switch (field) {
    case 'tax_rate':        return Math.max(0, Math.min(0.25, value));
    case 'ubi_allocation':  return Math.max(0, Math.min(1.0, value));
    case 'enforcement_level': return Math.max(0.1, Math.min(3.0, value));
  }
}

/**
 * Select politician agents for the governance cycle.
 * - Dictatorship: 1 agent (highest-ranked role or first alive)
 * - Otherwise: up to 3 agents chosen for economic diversity (poorest, richest, middle)
 */
function selectPoliticians(agents: Agent[], societyOverview: string | null): Agent[] {
  if (agents.length === 0) return [];

  const overviewUpper = (societyOverview ?? '').toUpperCase();
  const isDictatorship = /DICTATOR|MONARCH|AUTOCRA|TOTALITAR|ABSOLUTE RULER|SUPREME LEADER/.test(overviewUpper);

  if (isDictatorship) {
    // Single decision-maker — prefer leader/governor role
    const leader = agents.find(a =>
      /LEADER|GOVERNOR|KING|QUEEN|EMPEROR|DICTATOR|SUPREME|CHIEF/.test(a.role.toUpperCase())
    ) ?? agents[0];
    return [leader];
  }

  // Democracy: pick up to 3 agents with economic diversity
  if (agents.length <= 3) return [...agents];

  const sorted = [...agents].sort((a, b) => a.currentStats.wealth - b.currentStats.wealth);
  const poorest = sorted[0];
  const richest = sorted[sorted.length - 1];
  const middle = sorted[Math.floor(sorted.length / 2)];

  // Deduplicate (in case population is tiny)
  const picked = [poorest, middle, richest].filter(
    (a, i, arr) => arr.findIndex(b => b.id === a.id) === i
  );
  return picked;
}

/** Safe JSON parse — returns null on failure. */
function safeJson(text: string): unknown {
  const clean = text.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(clean); } catch { return null; }
}

// ── Main governance cycle ─────────────────────────────────────────────────────

export async function runGovernanceCycle(params: {
  sessionId: string;
  agents: Agent[];
  session: Pick<Session, 'id' | 'societyOverview' | 'idea' | 'config' | 'law'>;
  currentPolicy: SessionPolicy;
  iterNum: number;
  provider: LLMProvider;
  citizenProv: LLMProvider;
  model: string;
  citizenModel: string;
}): Promise<GovernanceResult> {
  const { sessionId, agents, session, currentPolicy, iterNum, provider, citizenProv, model, citizenModel } = params;

  const societyContext = [
    session.societyOverview ? `Society: ${session.societyOverview.slice(0, 400)}` : '',
    session.law ? `Founding law excerpt: ${session.law.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n\n');

  // ── Step 1: Select politicians ───────────────────────────────────────────
  const politicians = selectPoliticians(agents, session.societyOverview ?? null);
  if (politicians.length === 0) {
    return {
      policyChanged: false,
      newPolicy: currentPolicy,
      ratifiedItems: [],
      rejectedItems: [],
      summary: '',
    };
  }

  // ── Step 2: Collect proposals ────────────────────────────────────────────
  const rawProposals: Array<{ name: string; role: string; proposal: GovernancePolicyProposal }> = [];

  await Promise.allSettled(politicians.map(async (agent) => {
    try {
      const messages = buildProposalPrompt(agent, currentPolicy, societyContext, iterNum);
      const raw = await citizenProv.chat(messages, { model: citizenModel });
      const parsed = safeJson(raw) as { proposal?: GovernancePolicyProposal | null } | null;
      if (!parsed?.proposal) return;
      const { field, value, reasoning } = parsed.proposal;
      if (!['tax_rate', 'ubi_allocation', 'enforcement_level'].includes(field)) return;
      const clamped = clampPolicyValue(field as GovernancePolicyProposal['field'], value);
      if (!isFinite(clamped)) return;
      rawProposals.push({ name: agent.name, role: agent.role, proposal: { field, value: clamped, reasoning: String(reasoning).slice(0, 200) } });
    } catch {
      // Non-fatal: skip this politician's proposal
    }
  }));

  if (rawProposals.length === 0) {
    return {
      policyChanged: false,
      newPolicy: currentPolicy,
      ratifiedItems: [],
      rejectedItems: [],
      summary: `📜 Governance Session at iteration ${iterNum}: No policy proposals were submitted.`,
    };
  }

  // ── Step 3: Synthesize ballot (Central Agent / provider) ─────────────────
  let ballot: GovernanceBallotItem[] = [];
  try {
    const messages = buildBallotPrompt(rawProposals, currentPolicy, societyContext);
    const raw = await provider.chat(messages, { model });
    const parsed = safeJson(raw) as { ballot?: GovernanceBallotItem[] } | null;
    if (Array.isArray(parsed?.ballot)) {
      ballot = parsed.ballot
        .filter(item => item && typeof item.field === 'string' && typeof item.proposedValue === 'number')
        .slice(0, 3)
        .map(item => ({
          field: item.field as GovernanceBallotItem['field'],
          proposedValue: clampPolicyValue(item.field as GovernanceBallotItem['field'], item.proposedValue),
          description: String(item.description ?? '').slice(0, 200),
        }))
        .filter(item => isFinite(item.proposedValue));
    }
  } catch {
    // Non-fatal: empty ballot
  }

  if (ballot.length === 0) {
    return {
      policyChanged: false,
      newPolicy: currentPolicy,
      ratifiedItems: [],
      rejectedItems: [],
      summary: `📜 Governance Session at iteration ${iterNum}: Proposals were submitted but could not be synthesized into a ballot.`,
    };
  }

  // ── Step 4: Voting ───────────────────────────────────────────────────────
  const voteResults: Array<{ item: GovernanceBallotItem; yesCount: number; noCount: number }> = [];

  for (const item of ballot) {
    let yesCount = 0;
    let noCount = 0;

    await Promise.allSettled(politicians.map(async (agent) => {
      try {
        const messages = buildVotePrompt(agent, item, currentPolicy);
        const raw = await citizenProv.chat(messages, { model: citizenModel });
        const parsed = safeJson(raw) as { vote?: string } | null;
        if (parsed?.vote === 'YES') yesCount++;
        else if (parsed?.vote === 'NO') noCount++;
        else yesCount++; // Default: abstention counts as YES to avoid deadlock
      } catch {
        yesCount++; // Default on failure
      }
    }));

    voteResults.push({ item, yesCount, noCount });
  }

  // ── Step 5: Ratification ─────────────────────────────────────────────────
  const ratifiedItems: GovernanceBallotItem[] = [];
  const rejectedItems: GovernanceBallotItem[] = [];
  const newPolicy: SessionPolicy = { ...currentPolicy };

  for (const { item, yesCount, noCount } of voteResults) {
    const passes = yesCount > noCount; // Simple majority (ties go to yes)
    if (passes) {
      newPolicy[item.field] = item.proposedValue;
      ratifiedItems.push(item);
    } else {
      rejectedItems.push(item);
    }
  }

  const policyChanged = ratifiedItems.length > 0;

  // Persist ratified policy to DB
  if (policyChanged) {
    try {
      await sessionRepo.updateConfig(sessionId, {
        ...(session.config ?? {}),
        policy: newPolicy,
      });
    } catch (err) {
      console.error(`[GOVERNANCE] Failed to persist policy for session ${sessionId}:`, err);
    }
  }

  // ── Build summary narrative ──────────────────────────────────────────────
  const politicianNames = politicians.map(p => `${p.name} (${p.role})`).join(', ');
  const ratifiedLines = ratifiedItems.map(i =>
    `  ✅ **${i.field}** → ${i.proposedValue} — "${i.description}"`
  );
  const rejectedLines = rejectedItems.map(i =>
    `  ❌ **${i.field}** → ${i.proposedValue} (rejected)`
  );

  let summary: string;
  if (!policyChanged) {
    summary = `📜 **Governance Session — Iteration ${iterNum}**\n` +
      `Legislators: ${politicianNames}\n` +
      `All ${ballot.length} ballot item(s) were rejected. Current policy unchanged.`;
  } else {
    summary = `📜 **Governance Session — Iteration ${iterNum}**\n` +
      `Legislators: ${politicianNames}\n` +
      `**Ratified:**\n${ratifiedLines.join('\n')}` +
      (rejectedLines.length > 0 ? `\n**Rejected:**\n${rejectedLines.join('\n')}` : '') +
      `\n\nThe new laws take effect immediately.`;
  }

  return { policyChanged, newPolicy, ratifiedItems, rejectedItems, summary };
}
