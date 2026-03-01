/**
 * Deterministic physics engine for the neuro-symbolic simulation.
 * Given an agent and their chosen action code, compute exact stat deltas.
 * All values clamped to [-30, +30] for deltas, [0, 100] for final stats.
 */
import type { Agent } from '@idealworld/shared';
import type { ActionCode } from './actionCodes.js';

export interface PhysicsInput {
  agent: Agent;
  actionCode: ActionCode;
  actionTarget?: string;    // target agentId for TRADE/STEAL/HELP
  allAgents: Agent[];
}

export interface PhysicsOutput {
  wealthDelta: number;
  healthDelta: number;
  happinessDelta: number;
  cortisolDelta: number;
  dopamineDelta: number;
}

/** Role-based income for WORK action */
function roleIncome(role: string): number {
  const upper = role.toUpperCase();
  if (/LEADER|GOVERNOR|MERCHANT|CHIEF|KING|QUEEN|MAYOR|MINISTER/.test(upper)) return 8;
  if (/ARTISAN|WORKER|FARMER|BUILDER|MINER|SMITH|CARPENTER/.test(upper)) return 5;
  if (/SCHOLAR|HEALER|PRIEST|TEACHER|MONK|DOCTOR|SAGE/.test(upper)) return 4;
  return 3;
}

/** Calculate trade wealth delta based on partner's wealth */
function tradeCalc(agent: Agent, allAgents: Agent[], targetId?: string): number {
  const target = targetId ? allAgents.find(a => a.id === targetId) : undefined;
  if (!target || !target.isAlive) return 2; // no valid partner → small gain
  // Both parties gain a small amount; wealthier party gains less
  const diff = target.currentStats.wealth - agent.currentStats.wealth;
  return Math.round(Math.max(-5, Math.min(5, diff * 0.1)) + 2);
}

/** Calculate steal wealth gain */
function stealCalc(agent: Agent, allAgents: Agent[], targetId?: string): number {
  const target = targetId ? allAgents.find(a => a.id === targetId) : undefined;
  if (!target || !target.isAlive) return 3;
  return Math.min(15, Math.round(target.currentStats.wealth * 0.15));
}

const clampDelta = (v: number): number => Math.max(-30, Math.min(30, Math.round(v)));

/**
 * Resolve an agent's action into deterministic stat deltas.
 */
export function resolveAction(input: PhysicsInput): PhysicsOutput {
  const { agent, actionCode, actionTarget, allAgents } = input;
  let w = 0, h = 0, hap = 0, cor = 0, dop = 0;

  switch (actionCode) {
    case 'WORK':
      w = roleIncome(agent.role);
      h = -2;
      hap = -1;
      cor = -3;
      dop = 2;
      break;
    case 'REST':
      w = 0;
      h = 5;
      hap = 2;
      cor = -5;
      dop = 1;
      break;
    case 'TRADE':
      w = tradeCalc(agent, allAgents, actionTarget);
      h = 0;
      hap = 3;
      cor = -2;
      dop = 3;
      break;
    case 'STRIKE':
      w = 0;
      h = 0;
      hap = 5;
      cor = 5;
      dop = 4;
      break;
    case 'STEAL':
      w = stealCalc(agent, allAgents, actionTarget);
      h = -5;
      hap = -3;
      cor = 10;
      dop = 5;
      break;
    case 'HELP':
      w = -5;
      h = 0;
      hap = 5;
      cor = -5;
      dop = 5;
      break;
    case 'INVEST':
      w = -10;
      h = 0;
      hap = -2;
      cor = 3;
      dop = 2;
      break;
    case 'CONSUME':
      w = -8;
      h = 3;
      hap = 8;
      cor = -8;
      dop = 8;
      break;
    case 'NONE':
    default:
      w = 0;
      h = -1;
      hap = -1;
      cor = 2;
      dop = -2;
      break;
  }

  // Automatic adjustments applied AFTER action resolution
  // Health baseline: -2/iter (metabolism). REST/CONSUME partially offset this.
  h -= 2;

  // Cortisol auto-escalation for low resources
  const stats = agent.currentStats;
  if (stats.wealth < 20) cor += 10;
  if (stats.health < 30) cor += 8;

  // Dopamine decay: hedonic adaptation
  dop -= 3;

  return {
    wealthDelta: clampDelta(w),
    healthDelta: clampDelta(h),
    happinessDelta: clampDelta(hap),
    cortisolDelta: clampDelta(cor),
    dopamineDelta: clampDelta(dop),
  };
}
