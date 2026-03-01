/**
 * Action codes for the neuro-symbolic engine.
 * LLMs decide *what* to do (action codes); the physics engine decides *how much* stats change.
 */

export type ActionCode =
  | 'WORK'
  | 'TRADE'
  | 'REST'
  | 'STRIKE'
  | 'STEAL'
  | 'HELP'
  | 'INVEST'
  | 'CONSUME'
  | 'NONE';

const VALID_ACTIONS: Set<string> = new Set([
  'WORK', 'TRADE', 'REST', 'STRIKE', 'STEAL', 'HELP', 'INVEST', 'CONSUME', 'NONE',
]);

/**
 * Normalise a raw string from LLM output into a valid ActionCode.
 * Case-insensitive match; returns 'NONE' if unrecognised.
 */
export function normalizeActionCode(raw: string): ActionCode {
  const upper = raw.trim().toUpperCase();
  if (VALID_ACTIONS.has(upper)) return upper as ActionCode;
  return 'NONE';
}
