/**
 * Action codes for the neuro-symbolic engine.
 * LLMs decide *what* to do (action codes); the physics engine decides *how much* stats change.
 *
 * Phase 1 additions:
 *  - PRODUCE: Subsistence farming/crafting — convert raw materials into food
 *  - EAT: Consume extra food for health recovery
 *  - POST_BUY_ORDER: Place a buy order on the global order book
 *  - POST_SELL_ORDER: Place a sell order on the global order book
 *  - SET_WAGE: Set wage offer for hiring (employer action)
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
  // Phase 1 additions
  | 'PRODUCE'
  | 'EAT'
  | 'POST_BUY_ORDER'
  | 'POST_SELL_ORDER'
  | 'SET_WAGE'
  // Phase 2 additions
  | 'SABOTAGE'
  | 'NONE';

const VALID_ACTIONS: Set<string> = new Set([
  'WORK', 'TRADE', 'REST', 'STRIKE', 'STEAL', 'HELP', 'INVEST', 'CONSUME',
  'PRODUCE', 'EAT', 'POST_BUY_ORDER', 'POST_SELL_ORDER', 'SET_WAGE',
  'SABOTAGE',
  'NONE',
]);

/**
 * Normalise a raw string from LLM output into a valid ActionCode.
 * Case-insensitive match; returns 'NONE' if unrecognised.
 */
export function normalizeActionCode(raw: string): ActionCode {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if (VALID_ACTIONS.has(upper)) return upper as ActionCode;
  // Fuzzy matching for common LLM outputs
  if (upper.includes('BUY')) return 'POST_BUY_ORDER';
  if (upper.includes('SELL')) return 'POST_SELL_ORDER';
  if (upper.includes('PRODUCE') || upper.includes('FARM') || upper.includes('CRAFT')) return 'PRODUCE';
  if (upper.includes('EAT') || upper.includes('FEED')) return 'EAT';
  if (upper.includes('WAGE') || upper.includes('HIRE')) return 'SET_WAGE';
  if (upper.includes('SABOTAGE') || upper.includes('DESTROY') || upper.includes('VANDAL') || upper.includes('DISRUPT')) return 'SABOTAGE';
  return 'NONE';
}

