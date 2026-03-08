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
 *
 * Phase 3 additions (elite/governing actions):
 *  - EMBEZZLE: Skim from communal trust — high reward, high legal risk
 *  - ADJUST_TAX: Force wealth redistribution from lower classes
 *  - SUPPRESS: Deploy enforcement to penalise a specific citizen
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
  // Phase 3: privileged elite/governing actions
  | 'EMBEZZLE'
  | 'ADJUST_TAX'
  | 'SUPPRESS'
  | 'NONE';

const VALID_ACTIONS: Set<string> = new Set([
  'WORK', 'TRADE', 'REST', 'STRIKE', 'STEAL', 'HELP', 'INVEST', 'CONSUME',
  'PRODUCE', 'EAT', 'POST_BUY_ORDER', 'POST_SELL_ORDER', 'SET_WAGE',
  'SABOTAGE',
  'EMBEZZLE', 'ADJUST_TAX', 'SUPPRESS',
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
  if (upper.includes('EMBEZZLE') || upper.includes('EMBEZ') || upper.includes('SKIM')) return 'EMBEZZLE';
  if (upper.includes('TAX') || upper.includes('REALLOCATE') || upper.includes('REDISTRIBUTE')) return 'ADJUST_TAX';
  if (upper.includes('SUPPRESS') || upper.includes('POLICE') || upper.includes('ENFORCE') || upper.includes('ARREST')) return 'SUPPRESS';
  return 'NONE';
}

// ── Role-tier classification ─────────────────────────────────────────────────

/**
 * Three-tier social hierarchy used to gate privileged ActionCodes.
 *  elite      → governing/command roles (EMBEZZLE, ADJUST_TAX, SUPPRESS)
 *  specialist → professional/skilled roles (STRIKE, SABOTAGE, SET_WAGE)
 *  laborer    → everyone else (basic survival actions only)
 */
export type RoleTier = 'elite' | 'specialist' | 'laborer';

export function getRoleTier(role: string): RoleTier {
  const upper = role.toUpperCase();
  if (/LEADER|GOVERNOR|PLANNER|MINISTER|COMMISSIONER|DIRECTOR|GENERAL|CHIEF|KING|QUEEN|MAYOR|PRESIDENT|CHAIRMAN|PARTY|SECRETARY|OFFICIAL|COMMANDER|ADMINISTRATOR|JUDGE|MAGISTRATE|OFFICER/.test(upper)) {
    return 'elite';
  }
  if (/MERCHANT|TRADER|SCHOLAR|HEALER|DOCTOR|TEACHER|PRIEST|MONK|SAGE|ENGINEER|SCIENTIST|LAWYER|INSPECTOR|SUPERVISOR|ACCOUNTANT|MANAGER|ARTISAN|SMITH|CARPENTER|BUILDER/.test(upper)) {
    return 'specialist';
  }
  return 'laborer';
}

/** Actions every citizen can choose from */
const BASE_ACTIONS: readonly ActionCode[] = [
  'WORK', 'REST', 'EAT', 'PRODUCE', 'TRADE',
  'POST_BUY_ORDER', 'POST_SELL_ORDER',
  'STEAL', 'HELP', 'CONSUME', 'INVEST', 'NONE',
];

/** Specialist-tier additions (organised/skilled actors) */
const SPECIALIST_ACTIONS: readonly ActionCode[] = [
  ...BASE_ACTIONS, 'STRIKE', 'SABOTAGE', 'SET_WAGE',
];

/** Elite-tier adds governing privileges on top of specialist set */
const ELITE_ACTIONS: readonly ActionCode[] = [
  ...SPECIALIST_ACTIONS, 'EMBEZZLE', 'ADJUST_TAX', 'SUPPRESS',
];

/**
 * Return the set of ActionCodes legally available to an agent of the given role.
 * Used to construct role-specific prompts so the LLM only picks valid options.
 */
export function getAllowedActions(role: string): readonly ActionCode[] {
  const tier = getRoleTier(role);
  if (tier === 'elite') return ELITE_ACTIONS;
  if (tier === 'specialist') return SPECIALIST_ACTIONS;
  return BASE_ACTIONS;
}
