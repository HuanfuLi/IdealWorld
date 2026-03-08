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
  // Enterprise founding
  | 'FOUND_ENTERPRISE'
  // HR actions
  | 'POST_JOB_OFFER'
  | 'APPLY_FOR_JOB'
  | 'HIRE_EMPLOYEE'
  | 'FIRE_EMPLOYEE'
  // Employment actions
  | 'WORK_AT_ENTERPRISE'
  // New production action (replaces bare PRODUCE for tick system)
  | 'PRODUCE_AND_SELL'
  | 'NONE';

const VALID_ACTIONS: Set<string> = new Set([
  'WORK', 'TRADE', 'REST', 'STRIKE', 'STEAL', 'HELP', 'INVEST', 'CONSUME',
  'PRODUCE', 'EAT', 'POST_BUY_ORDER', 'POST_SELL_ORDER', 'SET_WAGE',
  'SABOTAGE',
  'EMBEZZLE', 'ADJUST_TAX', 'SUPPRESS',
  'FOUND_ENTERPRISE', 'POST_JOB_OFFER', 'APPLY_FOR_JOB', 'HIRE_EMPLOYEE',
  'FIRE_EMPLOYEE', 'WORK_AT_ENTERPRISE', 'PRODUCE_AND_SELL',
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
  // TRADE is no longer a valid action — redirect to market order (closest intent)
  if (upper === 'TRADE' || upper.includes('BARTER') || upper.includes('EXCHANGE')) return 'POST_BUY_ORDER';
  if (upper.includes('PRODUCE') || upper.includes('FARM') || upper.includes('CRAFT')) return 'PRODUCE';
  if (upper.includes('EAT') || upper.includes('FEED')) return 'EAT';
  if (upper.includes('WAGE') || upper.includes('HIRE')) return 'SET_WAGE';
  if (upper.includes('SABOTAGE') || upper.includes('DESTROY') || upper.includes('VANDAL') || upper.includes('DISRUPT')) return 'SABOTAGE';
  if (upper.includes('EMBEZZLE') || upper.includes('EMBEZ') || upper.includes('SKIM')) return 'EMBEZZLE';
  if (upper.includes('TAX') || upper.includes('REALLOCATE') || upper.includes('REDISTRIBUTE')) return 'ADJUST_TAX';
  if (upper.includes('SUPPRESS') || upper.includes('POLICE') || upper.includes('ENFORCE') || upper.includes('ARREST')) return 'SUPPRESS';

  if (upper.includes('FOUND') || upper.includes('START') || upper.includes('ESTABLISH') || upper.includes('CREATE_ENTERPRISE')) return 'FOUND_ENTERPRISE';
  if (upper.includes('POST_JOB') || upper.includes('RECRUIT') || upper.includes('HIRING')) return 'POST_JOB_OFFER';
  if (upper.includes('APPLY') || upper.includes('JOB_APP')) return 'APPLY_FOR_JOB';
  if (upper.includes('HIRE') && !upper.includes('FIRE')) return 'HIRE_EMPLOYEE';
  if (upper.includes('FIRE') || upper.includes('DISMISS') || upper.includes('LAYOFF')) return 'FIRE_EMPLOYEE';
  if (upper.includes('WORK_AT') || upper.includes('SHIFT') || upper.includes('CLOCKING_IN')) return 'WORK_AT_ENTERPRISE';
  if (upper.includes('PRODUCE_AND_SELL') || upper.includes('CRAFT_SELL')) return 'PRODUCE_AND_SELL';

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

/** Actions every citizen can choose from.
 * NOTE: EAT and CONSUME are excluded — survival metabolism is now automatic.
 * NOTE: TRADE is excluded — all item transfers must go through the order book
 *       so prices are set by supply/demand, not bilateral negotiation.
 */
const BASE_ACTIONS: readonly ActionCode[] = [
  'WORK', 'REST', 'PRODUCE', 'PRODUCE_AND_SELL', 'WORK_AT_ENTERPRISE', 'APPLY_FOR_JOB',
  'POST_BUY_ORDER', 'POST_SELL_ORDER',
  'STEAL', 'HELP', 'INVEST', 'NONE',
];

/** Specialist-tier additions (organised/skilled actors) */
const SPECIALIST_ACTIONS: readonly ActionCode[] = [
  ...BASE_ACTIONS, 'STRIKE', 'SABOTAGE', 'SET_WAGE',
  'FOUND_ENTERPRISE', 'POST_JOB_OFFER', 'HIRE_EMPLOYEE', 'FIRE_EMPLOYEE'
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

/** Duration in ticks (1 tick = 1 in-game hour) for long-running tasks */
export const ACTION_TICK_DURATIONS: Partial<Record<ActionCode, number>> = {
  'PRODUCE_AND_SELL': 8,        // 8 hours of production + market listing
  'WORK_AT_ENTERPRISE': 8,      // 8-hour work shift
  'REST': 6,                    // 6 hours sleep
  'FOUND_ENTERPRISE': 24,       // 1 day to set up enterprise
  'POST_JOB_OFFER': 1,          // Instant admin action
  'APPLY_FOR_JOB': 1,           // Instant application
  'HIRE_EMPLOYEE': 1,           // Instant HR decision
  'FIRE_EMPLOYEE': 1,           // Instant HR decision
  'POST_BUY_ORDER': 1,          // Instant market order
  'POST_SELL_ORDER': 1,         // Instant market order
  'STEAL': 2,                   // 2-hour heist
  'HELP': 3,                    // 3-hour assistance
  'INVEST': 1,                  // Instant financial action
  'SABOTAGE': 4,                // 4-hour covert operation
  'EMBEZZLE': 2,
  'ADJUST_TAX': 1,
  'SUPPRESS': 3,
  'NONE': 1,
};

/** Get duration for an action, defaulting to 1 tick for instant actions */
export function getActionDuration(code: ActionCode): number {
  return ACTION_TICK_DURATIONS[code] ?? 1;
}
