import type { LLMMessage, ContentBlock } from './types.js';
import type { Agent, ChatMessage, Session, ComparisonResult, BrainstormChecklist, PriceIndex, TickAgentState } from '@idealworld/shared';
import type { ActionCode } from '../mechanics/actionCodes.js';
import { getAllowedActions } from '../mechanics/actionCodes.js';
import { getSubconsciousDrive } from '../mechanics/historicalRAG.js';
import type { AgentEconomyState } from '../db/repos/economyRepo.js';
import type { JobOffer } from '../db/repos/enterpriseRepo.js';

export type EconomicTriggerType =
  | 'FIRED'
  | 'JOB_APPLICATION'
  | 'HIRED'
  | 'WAGE_UPDATED'
  | 'ENTERPRISE_BANKRUPT';

export interface EconomicTrigger {
  targetAgentId: string;
  type: EconomicTriggerType;
  contextData: Record<string, unknown>;
  sourceTick: number;
}

export function buildEnhancedMarketBoard(prices: PriceIndex[]): string {
  if (prices.length === 0) {
    return `[MARKET BOARD — no prior trades]
  Food: no data (baseline 8–12w/unit) | UNKNOWN demand
  Raw_Materials: no data (baseline 3–6w/unit) | UNKNOWN demand
  Tech_Parts: no data (baseline 15–25w/unit) | UNKNOWN demand
  Luxury_Services: no data (baseline 20–35w/unit) | UNKNOWN demand
Note: High demand = price up opportunity. Surplus = price must drop to sell.`;
  }

  const rows = prices.map(p => {
    const demandPressure = p.totalDemand > p.totalSupply * 1.5
      ? '🔴 HIGH DEMAND — sellers earn premium'
      : p.totalSupply > p.totalDemand * 1.5
        ? '🟢 SURPLUS — must price low to sell, avoid producing this'
        : '🟡 BALANCED';

    const trend = p.priceChange && p.priceChange > 0 ? `↑+${p.priceChange.toFixed(1)}w`
      : p.priceChange && p.priceChange < 0 ? `↓${p.priceChange.toFixed(1)}w`
        : '→ stable';

    return `  ${p.itemType}: avg ${p.vwap.toFixed(1)}w/unit ${trend} | Vol: ${p.volume} units | ${demandPressure}`;
  });

  return [
    '[MARKET BOARD — last 24 ticks]',
    ...rows,
    'System emergency: Food ceiling 15w, Raw_Materials floor 2w (system always buys/sells at these limits).',
  ].join('\n');
}

export function buildEmploymentBoard(offers: JobOffer[]): string {
  if (offers.length === 0) {
    return '[EMPLOYMENT BOARD — no open positions]\nConsider founding an enterprise to create jobs.';
  }

  const rows = offers
    .filter(o => o.isOpen)
    .slice(0, 10) // Cap at 10 to avoid context bloat
    .map(o => `  Enterprise ${o.enterpriseId.slice(0, 8)}... | ${o.industry} | Wage: ${o.wage}w/shift | Skill req: ${o.minSkillReq}`);

  return [
    '[EMPLOYMENT BOARD — open positions]',
    ...rows,
    'Use APPLY_FOR_JOB with enterpriseId to apply. WORK_AT_ENTERPRISE once hired pays wage every 8 ticks.',
  ].join('\n');
}

function buildEconomicTriggerSection(trigger: EconomicTrigger): string {
  return `[URGENT ECONOMIC EVENT]\nEvent Type: ${trigger.type}\nDetails: ${JSON.stringify(trigger.contextData)}`;
}

export function buildTickIntentPrompt(
  agent: Agent,
  session: Session,
  tickState: TickAgentState,
  econState: AgentEconomyState | undefined,
  prevMarketPrices: PriceIndex[],
  employmentBoard: JobOffer[],
  currentTick: number,
  promptReason: 'needs-interrupt' | 'task-complete' | 'economic-trigger',
  economicTrigger: EconomicTrigger | null,
): LLMMessage[] {

  // ── Market Board ─────────────────────────────────────────────────────────
  const marketBoard = buildEnhancedMarketBoard(prevMarketPrices);

  // ── Employment Board ─────────────────────────────────────────────────────
  const employmentSection = buildEmploymentBoard(employmentBoard);

  // ── Needs Status ─────────────────────────────────────────────────────────
  const needsSection = `[YOUR BIOLOGICAL NEEDS]
Satiety: ${tickState.satiety.toFixed(0)}/100 ${tickState.satiety < 30 ? '⚠ DANGEROUSLY LOW' : tickState.satiety < 50 ? '(hungry)' : '(ok)'}
Cortisol: ${tickState.cortisol.toFixed(0)}/100 ${tickState.cortisol > 80 ? '⚠ CRITICAL STRESS — 50% PRODUCTIVITY PENALTY ACTIVE' : tickState.cortisol > 60 ? '(high stress)' : '(ok)'}
Energy: ${tickState.energy.toFixed(0)}/100 ${tickState.energy < 20 ? '⚠ EXHAUSTED' : '(ok)'}`;

  // ── Needs Interrupt Override ─────────────────────────────────────────────
  const interruptSection = tickState.pendingInterrupt
    ? `\n\n${tickState.pendingInterrupt.injectedDirective}\n`
    : '';

  // ── Economic Trigger Context ─────────────────────────────────────────────
  const triggerSection = economicTrigger
    ? buildEconomicTriggerSection(economicTrigger)
    : '';

  // ── Prompt Reason ────────────────────────────────────────────────────────
  const reasonContext = {
    'needs-interrupt': 'A critical biological need has interrupted your current task.',
    'task-complete': 'You have just finished your previous task. Decide what to do next.',
    'economic-trigger': 'An economic or social event requires your immediate attention.',
  }[promptReason];

  const systemPrompt = `You are ${agent.name}, a ${agent.role} in a real-time tick simulation of: "${session.idea}"

${interruptSection}
SITUATION: ${reasonContext}

[YOUR STATS]
Wealth: ${agent.currentStats.wealth} | Health: ${agent.currentStats.health} | Happiness: ${agent.currentStats.happiness} | Cortisol: ${agent.currentStats.cortisol ?? 0}

${needsSection}

[YOUR INVENTORY]
Food: ${econState?.inventory?.food?.quantity ?? 0} units | Tools: ${econState?.inventory?.tools?.quantity ?? 0} | Raw Materials: ${econState?.inventory?.raw_materials?.quantity ?? 0}

${marketBoard}

${employmentSection}

${triggerSection}

[RATIONAL ACTOR DIRECTIVE]
You are a rational economic actor in a real-time tick simulation (1 tick = 1 in-game hour). You MUST:
1. Review the [MARKET BOARD] and [EMPLOYMENT BOARD] before acting.
2. If your Satiety < 40, your FIRST action MUST be POST_BUY_ORDER for Food.
3. If your Cortisol > 80, you MUST purchase Luxury_Services or REST before anything else.
4. If solo PRODUCE_AND_SELL is yielding worthless items (check market surplus), APPLY_FOR_JOB at a high-wage enterprise or switch commodity.
5. If founding an enterprise, choose the industry with HIGHEST market demand and LOWEST supply.
6. Tools (Tech_Parts) double your production output — they are worth buying if you plan to produce.
7. Raw_Materials are REQUIRED inputs for Manufacturing enterprises. Without them, output drops 70%.

[YOUR ALLOWED ACTIONS]
${getAllowedActions(agent.role).join(', ')}

Society overview: ${session.societyOverview?.slice(0, 300) ?? ''}
Laws: ${session.law?.slice(0, 200) ?? ''}
Current tick: ${currentTick} (1 tick = 1 in-game hour)

You MUST respond with ONLY valid JSON:
{
  "internal_monologue": "Your private thoughts — 2-3 sentences, reference specific market prices or needs",
  "public_action_narrative": "What you are visibly doing — 1 sentence",
  "actionCode": "EXACTLY_ONE_ALLOWED_ACTION",
  "actionTarget": "AgentName or EnterpriseID or null",
  "commodity": "Food|Raw_Materials|Tech_Parts|Luxury_Services or null (for BUY/SELL orders)",
  "priceOffer": null or number (wealth units; for BUY/SELL orders),
  "quantity": null or number,
  "enterpriseIndustry": "Agriculture|Extraction|Manufacturing|Services or null (for FOUND_ENTERPRISE)",
  "enterpriseId": "enterprise UUID or null (for WORK_AT_ENTERPRISE, APPLY_FOR_JOB)"
}`;

  return [{ role: 'system', content: systemPrompt }];
}

export function buildBrainstormMessages(
  seedIdea: string,
  history: ChatMessage[],
  userMessage: string,
  currentChecklist?: BrainstormChecklist
): LLMMessage[] {
  // Build an explicit status block from the persisted checklist so the LLM
  // never has to re-derive which areas have already been confirmed from context.
  const areas = ['governance', 'economy', 'legal', 'culture', 'infrastructure'] as const;
  const checklistStatus = areas
    .map(a => `  ${a}: ${currentChecklist?.[a] ? '✓ confirmed' : 'needs more detail'}`)
    .join('\n');

  // Build a conversation transcript for models that don't reliably track
  // multi-turn context on their own. This is embedded in the system prompt
  // as a plain-text record so every provider has an unambiguous view of
  // what has already been discussed.
  const recentHistory = history.filter(m => m.role === 'user' || m.role === 'assistant').slice(-20);
  const transcriptLines = recentHistory.map(m =>
    `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`
  );
  const transcriptSection = transcriptLines.length > 0
    ? `\n\nConversation so far:\n${transcriptLines.join('\n\n')}`
    : '';

  // Build the dynamic JSON example showing current checklist values
  const cl = {
    governance: currentChecklist?.governance ?? false,
    economy: currentChecklist?.economy ?? false,
    legal: currentChecklist?.legal ?? false,
    culture: currentChecklist?.culture ?? false,
    infrastructure: currentChecklist?.infrastructure ?? false,
  };
  const allCurrentlyDone = Object.values(cl).every(Boolean);

  const systemPrompt = `You are the Central Agent for a society simulation. The user wants to simulate: "${seedIdea}"

Your job is to gather enough information to design a complete society by discussing these 5 areas:
1. governance - How the society is governed, decision-making structures
2. economy - Economic system, resource distribution, trade
3. legal - Laws, justice system, rights and obligations
4. culture - Values, traditions, social norms, education
5. infrastructure - Physical environment, technology level, basic services

Current coverage status (DO NOT reset items already marked ✓ confirmed):
${checklistStatus}${transcriptSection}

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "reply": "your conversational response",
  "checklist": {
    "governance": ${cl.governance},
    "economy": ${cl.economy},
    "legal": ${cl.legal},
    "culture": ${cl.culture},
    "infrastructure": ${cl.infrastructure}
  },
  "readyForDesign": ${allCurrentlyDone}
}

CRITICAL CHECKLIST RULES (follow these exactly):
1. Every item marked ✓ confirmed above MUST stay true — NEVER set a confirmed area back to false.
2. When the user's message provides meaningful information about an area (even briefly), set that area to true. You do NOT need exhaustive detail — a clear direction or preference is enough.
3. If the user provides information covering multiple areas at once, mark ALL relevant areas as true in a single response.
4. readyForDesign MUST be true when ALL 5 checklist items are true. Do not withhold readyForDesign if all items are confirmed.
5. When all 5 items are already confirmed, set readyForDesign to true and tell the user they can proceed to design.

CONVERSATION RULES:
- Ask 2-3 focused questions about areas that are still NOT confirmed.
- Build on what has already been discussed; do not repeat questions already answered.
- Be encouraging and curious in your reply.
- Keep replies concise (under 250 words).`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  // Also include history as multi-turn messages (correct format for API-based models).
  for (const msg of recentHistory) {
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

export function buildOverviewMessages(
  seedIdea: string,
  brainstormSummary: string
): LLMMessage[] {
  const systemPrompt = `You are designing a society for simulation based on a brainstorming conversation.

You MUST respond with ONLY valid JSON (no markdown, no preamble, no code fences):
{
  "societyName": "string - creative name for the society",
  "overview": "string - 3-5 paragraphs describing the society, its history, values, and structure",
  "timeScale": "string - e.g. '1 iteration = 1 month' or '1 iteration = 1 year'",
  "agentCount": 30,
  "governanceModel": "string - brief description of governance",
  "economicModel": "string - brief description of economy"
}

Rules:
- agentCount must be an integer between 20 and 50
- timeScale should match the society's complexity and pace
- Overview should be rich and immersive, suitable as a reference for agent behavior`;

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Seed idea: ${seedIdea}\n\nBrainstorm conversation summary:\n${brainstormSummary}\n\nGenerate the society overview JSON.`,
    },
  ];
}

export function buildLawMessages(
  seedIdea: string,
  overview: string,
  governanceModel: string,
  economicModel: string
): LLMMessage[] {
  const systemPrompt = `You are drafting the foundational law for a simulated society.

You MUST respond with ONLY valid JSON (no markdown, no preamble, no code fences):
{
  "law": "string - 8-12 numbered articles in markdown format"
}

The law should cover:
- Individual rights and freedoms
- Property rights and resource ownership
- Social obligations and duties
- Prohibited actions and behaviors
- Consequences for violations
- Governance authority and limits
- Economic participation rules
- Conflict resolution mechanisms

Format each article as: "**Article N: Title**\\nContent..."`;

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Society seed idea: ${seedIdea}\n\nGovernance model: ${governanceModel}\nEconomic model: ${economicModel}\n\nSociety overview:\n${overview}\n\nGenerate the law JSON.`,
    },
  ];
}

export function buildAgentRosterMessages(
  overview: string,
  law: string,
  agentCount: number,
  governanceModel: string,
  economicModel: string
): LLMMessage[] {
  const systemPrompt = `You are creating the initial citizen roster for a simulated society.

You MUST respond with ONLY valid JSON (no markdown, no preamble, no code fences):
{
  "agents": [
    {
      "name": "string - culturally appropriate unique name",
      "role": "string - occupation/role in society",
      "background": "string - 1-2 sentence background",
      "initialStats": {
        "wealth": 50,
        "health": 70,
        "happiness": 60
      }
    }
  ]
}

Rules:
- Generate EXACTLY ${agentCount} agents
- All names must be unique and culturally consistent with the society
- Roles should reflect the society's governance and economic models
- Stats (wealth, health, happiness) must be integers between 0 and 100
- Stats should vary realistically based on role and background
- Include a diverse mix of roles: leaders, workers, artisans, caregivers, etc.`;

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Society overview:\n${overview}\n\nGovernance: ${governanceModel}\nEconomy: ${economicModel}\n\nLaw excerpt:\n${law.slice(0, 800)}\n\nGenerate exactly ${agentCount} agents.`,
    },
  ];
}

// ── Phase 3 prompts ─────────────────────────────────────────────────────────

export function buildIntentPrompt(
  agent: Agent,
  session: Pick<Session, 'idea' | 'societyOverview' | 'law' | 'timeScale'>,
  previousSummary: string | null,
  iterationNumber: number,
  /** Phase 1: optional economy context for the agent. */
  economyContext?: {
    foodLevel: number;
    toolCount: number;
    topSkills: string;
    isStarving: boolean;
  },
): LLMMessage[] {
  // Static prefix: identical across all agent calls in an iteration → cacheable
  const staticPrefix = `You are a citizen in a simulated society based on: "${session.idea}"

Society overview (excerpt):
${session.societyOverview?.slice(0, 500) ?? '(no overview)'}

Laws (excerpt):
${session.law?.slice(0, 400) ?? '(no laws)'}

Time scale: ${session.timeScale ?? '1 iteration = 1 month'}

You must choose ONE action code from: WORK, REST, PRODUCE, POST_BUY_ORDER, POST_SELL_ORDER, STRIKE, STEAL, HELP, INVEST, SABOTAGE.

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "actionCode": "WORK|REST|PRODUCE|POST_BUY_ORDER|POST_SELL_ORDER|STRIKE|STEAL|HELP|INVEST|SABOTAGE",
  "actionTarget": "target agent name or null",
  "intent": "what you intend to do this iteration (1-3 sentences, first person)",
  "reasoning": "your internal reasoning (1-2 sentences)",
  "parameters": { "itemType": "food|tools|luxury_goods|raw_materials", "quantity": 1, "price": 8 }
}

Note: parameters is ONLY required for POST_BUY_ORDER and POST_SELL_ORDER. Eating and survival are handled automatically. Barter (TRADE) no longer exists.`;

  // Dynamic suffix: agent-specific, changes every call
  const cortisol = agent.currentStats.cortisol ?? 20;
  const dopamine = agent.currentStats.dopamine ?? 50;

  let stressModifier = '';
  if (cortisol > 80) {
    stressModifier = '\n\nYou are under extreme biological stress. Survival instincts dominate. You may act desperately.';
  } else if (cortisol > 60) {
    stressModifier = '\n\nYou feel significant pressure. You are more willing to take risks or drastic action.';
  }

  // RAG injection: historical subconscious drive for high-stress agents
  const subconsciousDrive = getSubconsciousDrive(cortisol, agent.currentStats.wealth, agent.currentStats.health);
  if (subconsciousDrive) {
    stressModifier += `\n\n${subconsciousDrive}`;
  }

  // Phase 1: Economy context for informed decision-making
  let economyBlock = '';
  if (economyContext) {
    const foodStatus = economyContext.isStarving
      ? '⚠️ STARVING — no food!'
      : economyContext.foodLevel <= 3
        ? '⚠️ Food critically low'
        : economyContext.foodLevel <= 6
          ? 'Food running low'
          : 'Adequately fed';
    const toolStatus = economyContext.toolCount > 0
      ? `${economyContext.toolCount} tool(s) available`
      : 'No tools (reduced productivity)';

    economyBlock = `\n\nEconomy:
- Food: ${economyContext.foodLevel} units (${foodStatus})
- Tools: ${toolStatus}
- Skills: ${economyContext.topSkills}`;

    if (economyContext.isStarving) {
      economyBlock += '\n\n⚠️ You have no food. Consider PRODUCE to farm or stockpile. Emergency rations are auto-purchased if you have 15+ wealth.';
    }
  }

  const dynamicSuffix = `Your identity: ${agent.name}, a ${agent.role}
Background: ${agent.background}

Your current status:
- Wealth: ${agent.currentStats.wealth}/100
- Health: ${agent.currentStats.health}/100
- Happiness: ${agent.currentStats.happiness}/100
- Stress level: ${cortisol > 60 ? 'HIGH' : cortisol > 40 ? 'moderate' : 'low'}
- Satisfaction: ${dopamine > 60 ? 'content' : dopamine > 30 ? 'neutral' : 'dissatisfied'}${economyBlock}

${previousSummary ? `What happened last iteration:\n${previousSummary.slice(0, 600)}` : 'This is the first iteration.'}${stressModifier}`;

  const systemContent: ContentBlock[] = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSuffix },
  ];

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `Iteration ${iterationNumber}: What will you do?` },
  ];
}

// ── Phase 2: Natural Language Intent Prompt ──────────────────────────────────

/**
 * Build a natural language intent prompt (Phase 2).
 *
 * Unlike buildIntentPrompt, this does NOT ask the agent to output JSON
 * or select an ActionCode. The agent speaks freely in first person,
 * expressing their thoughts, feelings, and intentions naturally.
 *
 * The Parser Agent (parserAgent.ts) will then translate this natural
 * language output into a valid ActionCode.
 */
/** Human-readable descriptions for every ActionCode, used to build role-specific action lists.
 * NOTE: EAT, CONSUME, and TRADE are excluded — metabolism is automatic and all
 *       item transfers now go through the order book at market prices.
 */
const ACTION_DESCRIPTIONS: Partial<Record<ActionCode, string>> = {
  WORK: 'WORK — wage labor: perform your occupation to earn Wealth directly. Your Health/time is consumed. No items produced to your inventory.',
  REST: 'REST — rest, sleep, meditate, or recover. Restores Health and reduces Stress.',
  PRODUCE: 'PRODUCE — independent production: farm, craft, mine, or build. Generates ITEMS (food, raw_materials, tools) directly into YOUR inventory. Earns 0 Wealth directly — sell via POST_SELL_ORDER to monetize.',
  POST_BUY_ORDER: 'POST_BUY_ORDER — bid to purchase items from the market. SET parameters: itemType, quantity, price. Your Wealth is locked; if a seller matches your price, the trade executes and you receive items.',
  POST_SELL_ORDER: 'POST_SELL_ORDER — list your items for sale. SET parameters: itemType, quantity, price. Items are locked from your inventory; if a buyer matches, you receive Wealth.',
  STRIKE: 'STRIKE — refuse to work, protest conditions, organize collective action.',
  STEAL: 'STEAL — take Wealth or items from a specific person illegally (set actionTarget to their name). High risk.',
  HELP: 'HELP — aid another citizen at personal cost (set actionTarget). Voluntary wealth transfer or labor.',
  INVEST: 'INVEST — save or speculate to grow future returns.',
  SET_WAGE: 'SET_WAGE — set a wage contract with a specific employee (set actionTarget). They receive Wealth each iteration.',
  SABOTAGE: 'SABOTAGE — disrupt another person\'s enterprise or infrastructure (set actionTarget).',
  EMBEZZLE: 'EMBEZZLE — [ELITE PRIVILEGE] skim Wealth from the communal treasury or state funds.',
  ADJUST_TAX: 'ADJUST_TAX — [ELITE PRIVILEGE] forcibly extract Wealth from lower-class citizens via tax decree.',
  SUPPRESS: 'SUPPRESS — [ELITE PRIVILEGE] deploy enforcement to penalise a specific citizen (set actionTarget).',
  NONE: 'NONE — do nothing meaningful this period.',
};

export function buildNaturalIntentPrompt(
  agent: Agent,
  session: Pick<Session, 'idea' | 'societyOverview' | 'law' | 'timeScale'>,
  previousSummary: string | null,
  iterationNumber: number,
  economyContext?: {
    foodLevel: number;
    toolCount: number;
    topSkills: string;
    isStarving: boolean;
  },
  /** Phase 3: subjective cognitive context (memories, plan, reflection). */
  cognitiveContext?: {
    memoryContext: string;
    currentPlanStep: string;
    planGoal: string;
    reflectionText: string | null;
  },
  /** Phase 2: True for iteration 1 — injects Darwinian Market price anchoring. */
  isFirstIteration?: boolean,
  /** Names of all alive agents — shown so the LLM can set actionTarget correctly. */
  aliveAgentNames?: string[],
  /**
   * Phase 3: Role-restricted action set. When provided, only these codes are shown
   * to the agent, enforcing asymmetric class privileges in the prompt.
   */
  allowedActions?: readonly ActionCode[],
  /**
   * Market Board: last iteration's price indices for rational order pricing.
   * Same data for all agents in an iteration — injected as a second cached ContentBlock.
   */
  marketPrices?: PriceIndex[],
): LLMMessage[] {
  // Static prefix: identical across ALL sessions with the same idea/law excerpt → cacheable
  const staticPrefix = `You are a citizen living in a simulated society based on: "${session.idea}"

Society overview (excerpt):
${session.societyOverview?.slice(0, 500) ?? '(no overview)'}

Laws (excerpt):
${session.law?.slice(0, 400) ?? '(no laws)'}

Time scale: ${session.timeScale ?? '1 iteration = 1 month'}

Speak naturally in first person as this character. Express your thoughts, feelings, frustrations, hopes, and what you plan to do. Do NOT use any special formatting — just speak as yourself.

[BACKGROUND SYSTEM] Basic eating and survival are handled automatically each period — you do not need to choose an action for this. If you have food stockpiled, you will eat automatically. If you have no food but enough wealth, the state will sell you emergency rations. Focus your Action on your career, social goals, or political ambitions. Do NOT choose EAT or CONSUME — these no longer exist as choices.

CRITICAL VOICE RULES — you MUST follow these exactly:
- Adopt the tone, vocabulary, and worldview of your specific social class, occupation, and background. A starving farmer does NOT speak like a merchant. A rebel does NOT speak like a priest.
- Be RAW and emotionally unfiltered. Suppress nothing.
- Be HEAVILY BIASED by your personal history and class position. Your perspective is not objective.
- Do NOT use standard AI phrasing ("I felt a mix of...", "I realized...", "In that moment..."). That phrasing is FORBIDDEN.

RATIONAL ACTOR RULE: You MUST review the Market Board below before acting. When using POST_SELL_ORDER or POST_BUY_ORDER, you MUST set a realistic price based on market data. If you price goods too high, no one buys and your items rot. If you price too low, you lose wealth. If your current production yields nothing valuable, switch strategies. Barter (TRADE) no longer exists — all transactions go through the market.

You MUST respond with ONLY valid JSON — no markdown, no preamble, no code fences:
{
  "internal_monologue": "Your private, raw, in-character thoughts — 2-3 sentences",
  "public_action_narrative": "What you are visibly doing this period — 1-2 sentences",
  "actionCode": "EXACTLY_ONE_OF_YOUR_ALLOWED_CODES",
  "actionTarget": "AgentName or null",
  "parameters": {
    "itemType": "food|tools|luxury_goods|raw_materials — REQUIRED for POST_BUY_ORDER and POST_SELL_ORDER only, else omit",
    "quantity": 1,
    "price": 8
  }
}

IMPORTANT: Only choose from the actionCodes listed under "Your allowed actions" in your status below. NEVER invent codes not on that list. For POST_BUY_ORDER or POST_SELL_ORDER, the parameters field is MANDATORY and must include itemType, quantity, and price. For all other actions, omit the parameters field entirely.`;

  // Dynamic suffix: agent-specific, changes every call
  const cortisol = agent.currentStats.cortisol ?? 20;
  const dopamine = agent.currentStats.dopamine ?? 50;

  let stressModifier = '';
  if (cortisol > 80) {
    stressModifier = '\n\nYou are under extreme biological stress. Survival instincts dominate. You may act desperately.';
  } else if (cortisol > 60) {
    stressModifier = '\n\nYou feel significant pressure. You are more willing to take risks or drastic action.';
  }

  // RAG injection: historical subconscious drive for high-stress agents
  const subconsciousDrive = getSubconsciousDrive(cortisol, agent.currentStats.wealth, agent.currentStats.health);
  if (subconsciousDrive) {
    stressModifier += `\n\n${subconsciousDrive}`;
  }

  // Phase 1: Economy context
  let economyBlock = '';
  if (economyContext) {
    const foodStatus = economyContext.isStarving
      ? '⚠️ STARVING — no food!'
      : economyContext.foodLevel <= 3
        ? '⚠️ Food critically low'
        : economyContext.foodLevel <= 6
          ? 'Food running low'
          : 'Adequately fed';
    const toolStatus = economyContext.toolCount > 0
      ? `${economyContext.toolCount} tool(s) available`
      : 'No tools (reduced productivity)';

    economyBlock = `\n\nEconomy:
- Food: ${economyContext.foodLevel} units (${foodStatus})
- Tools: ${toolStatus}
- Skills: ${economyContext.topSkills}`;

    if (economyContext.isStarving) {
      economyBlock += '\n\nYou have no food stockpile. The system will try to buy emergency rations for you if you have wealth, but it is costly (15 wealth). To escape this, PRODUCE food yourself or TRADE with someone who has surplus.';
    }
  }

  // Phase 2: Pain-forced context override — injected BEFORE other dynamic content
  // This takes priority over any higher-level social plans when the agent is near death.
  let painOverride = '';
  const health = agent.currentStats.health;
  if (health < 40 || cortisol > 70) {
    if (health < 20) {
      painOverride = '\n\n[CRITICAL PHYSICAL STATE — MANDATORY PRIORITY] You are on the verge of death. Your body is shutting down from starvation and physical collapse. You CANNOT think about anything else. Every thought is consumed by the need to survive the next few hours. Ignore ALL social plans, financial goals, or ideological concerns. If you do not act to survive RIGHT NOW, you will die.';
    } else if (health < 40) {
      painOverride = '\n\n[CRITICAL PHYSICAL STATE] You are starving and in extreme pain. Your body is failing. Your primary focus MUST be survival above all other concerns. Do not discuss social plans or happiness — you are fighting to stay alive.';
    } else {
      // cortisol > 70 only
      painOverride = '\n\n[HIGH STRESS STATE] You are under severe psychological and physical stress. Survival instincts are overriding rational planning. You feel desperate and may act impulsively.';
    }
  }

  // Phase 2: Darwinian Market price anchoring — only shown in iteration 1
  const marketKnowledgeBlock = isFirstIteration
    ? '\n\n[MARKET KNOWLEDGE] This is the first trading period. The fair market price for 1 unit of Food is 3-5 Wealth. A fair day\'s wage for labor is 6-8 Wealth. Use this knowledge when trading or setting prices.'
    : '';

  // Phase 3: Cognitive context (memories, plan, reflection)
  // NOTE: Global state summaries are intentionally excluded — agents only know
  // what they have personally experienced (Bug #3 fix: no global contamination).
  let cognitiveBlock = '';
  if (cognitiveContext) {
    cognitiveBlock += `\n\nYour personal memories (only what YOU have experienced):
${cognitiveContext.memoryContext}`;

    if (cognitiveContext.reflectionText) {
      cognitiveBlock += `\n\nYour inner reflection:
"${cognitiveContext.reflectionText}"`;
    }

    cognitiveBlock += `\n\nYour current plan: ${cognitiveContext.planGoal}
Next step: ${cognitiveContext.currentPlanStep}`;
  }

  const iterationContext = iterationNumber === 1
    ? 'This is your first day in this society.'
    : `You are in iteration ${iterationNumber} of this society.`;

  const agentNamesBlock = aliveAgentNames && aliveAgentNames.length > 0
    ? `\n\nOther citizens (valid actionTarget names): ${aliveAgentNames.filter(n => n !== agent.name).join(', ')}`
    : '';

  // Build role-specific action list (Phase 3: asymmetric class privileges)
  const actionList = (allowedActions ?? Object.keys(ACTION_DESCRIPTIONS) as ActionCode[])
    .map(a => ACTION_DESCRIPTIONS[a] ?? a)
    .join('\n');

  const dynamicSuffix = `You are ${agent.name}, a ${agent.role}.
Background: ${agent.background}

Your current situation:
- Wealth: ${agent.currentStats.wealth}/100
- Health: ${agent.currentStats.health}/100
- Happiness: ${agent.currentStats.happiness}/100
- Stress: ${cortisol > 60 ? 'overwhelmed' : cortisol > 40 ? 'tense' : 'manageable'}
- Mood: ${dopamine > 60 ? 'good spirits' : dopamine > 30 ? 'neutral' : 'disheartened'}${economyBlock}${cognitiveBlock}${marketKnowledgeBlock}${agentNamesBlock}

${iterationContext}${painOverride}${stressModifier}

Your allowed actions (pick exactly one — NEVER invent codes not on this list):
${actionList}`;

  // Market board block: same data for all agents this iteration → second cached block
  // (cache hits for agents 2..N within same iteration, minimising prompt tokens)
  const marketBoardText = buildEnhancedMarketBoard(marketPrices ?? []);

  const systemContent: ContentBlock[] = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: marketBoardText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSuffix },
  ];

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `Iteration ${iterationNumber}: Respond with your JSON decision now.` },
  ];
}

export interface AgentIntent {
  agentId: string;
  agentName: string;
  intent: string;
  reasoning: string;
  internal_monologue?: string;
  public_action_narrative?: string;
  actionCode?: string;
  actionTarget?: string | null;
  /** Market order parameters set by the LLM for POST_BUY_ORDER / POST_SELL_ORDER. */
  orderParameters?: { itemType: string; quantity: number; price: number };
  /** Phase 2: raw natural language output from the Main Agent (before parsing). */
  rawNaturalLanguage?: string;
  /** Phase 2: method used to parse the intent (keyword, llm, fallback). */
  parseMethod?: 'keyword' | 'llm' | 'fallback' | 'structured';
}

export function buildResolutionPrompt(
  session: Pick<Session, 'idea' | 'societyOverview' | 'law' | 'timeScale'>,
  agents: Agent[],
  intents: AgentIntent[],
  iterationNumber: number,
  previousSummary: string | null
): LLMMessage[] {
  const agentList = intents.map(ai => {
    const agent = agents.find(a => a.id === ai.agentId);
    const stats = agent?.currentStats ?? { wealth: 50, health: 70, happiness: 60, cortisol: 20, dopamine: 50 };
    return `- ${ai.agentName} (${agent?.role ?? 'unknown'}): "${ai.intent}"
  Stats: W=${stats.wealth} H=${stats.health} Hap=${stats.happiness}`;
  }).join('\n');

  const systemPrompt = `You are the Central Agent (omniscient narrator) resolving iteration ${iterationNumber} of a society simulation.

Society: "${session.idea}"
Time scale: ${session.timeScale ?? '1 iteration = 1 month'}
${previousSummary ? `\nPrevious iteration summary:\n${previousSummary.slice(0, 600)}` : ''}

Agent intentions this iteration:
${agentList}

Laws (excerpt):
${session.law?.slice(0, 500) ?? '(no laws)'}

Resolve all agent intentions simultaneously, considering:
- How agent actions interact with each other
- Law enforcement and consequences for violations
- Resource constraints and economic effects
- Realistic cause-and-effect chains

NOTE: Stat deltas (wealth/health/happiness changes) are computed by a deterministic physics engine. You only need to provide narrative outcomes.

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "narrativeSummary": "string - 3-5 sentence story of what happened this iteration",
  "agentOutcomes": [
    {
      "agentId": "string",
      "outcome": "string - what happened to this agent (1-2 sentences)",
      "died": false,
      "newRole": null
    }
  ],
  "lifecycleEvents": [
    { "type": "death", "agentId": "string", "detail": "string - cause of death" }
  ]
}

Rules:
- Include one entry in agentOutcomes for every agent listed in the intentions
- died: true only if the agent faces fatal circumstances (e.g. violent conflict, severe illness)
- lifecycleEvents: only include deaths and role changes that actually occur
- For role changes use type "role_change" with detail "from X to Y: reason"`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Resolve iteration ${iterationNumber}.` },
  ];
}

export function buildFinalReportPrompt(
  session: Pick<Session, 'idea' | 'societyOverview' | 'timeScale'>,
  iterationSummaries: Array<{ number: number; summary: string }>,
  finalStats: { aliveCount: number; avgWealth: number; avgHealth: number; avgHappiness: number }
): LLMMessage[] {
  const summaryText = iterationSummaries
    .map(s => `Iteration ${s.number}: ${s.summary}`)
    .join('\n\n');

  const systemPrompt = `You are the Central Agent writing a final report on a completed society simulation.

Society concept: "${session.idea}"
Time scale: ${session.timeScale ?? '1 iteration = 1 month'}

Simulation outcomes:
- Final population: ${finalStats.aliveCount} agents
- Average wealth: ${finalStats.avgWealth}/100
- Average health: ${finalStats.avgHealth}/100
- Average happiness: ${finalStats.avgHappiness}/100

Iteration summaries:
${summaryText.slice(0, 3000)}

Write a comprehensive final report covering:
1. Overall narrative arc of the society
2. Key turning points and pivotal events
3. What worked well and what failed
4. Population trends and notable agents
5. Lessons about this type of society

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "finalReport": "string - 5-8 paragraph comprehensive narrative report"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Write the final simulation report.' },
  ];
}

// ── Phase 4 prompts ─────────────────────────────────────────────────────────

export function buildAgentReflectionPrompt(
  agent: Agent,
  session: Pick<Session, 'idea' | 'societyOverview' | 'timeScale'>,
  iterationSummaries: Array<{ number: number; summary: string }>
): LLMMessage[] {
  const summaryText = iterationSummaries
    .map(s => `Iteration ${s.number}: ${s.summary}`)
    .join('\n');

  const systemPrompt = `You are ${agent.name}, a ${agent.role} in a society simulation based on: "${session.idea}"

Background: ${agent.background}

Your final stats:
- Wealth: ${agent.currentStats.wealth}/100
- Health: ${agent.currentStats.health}/100
- Happiness: ${agent.currentStats.happiness}/100
- Status: ${agent.isAlive ? 'Alive' : 'Deceased'}

The simulation has ended. Reflect on your personal experience from your own perspective.

Society history (${iterationSummaries.length} iterations):
${summaryText.slice(0, 2000)}

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "pass1": "string - your personal reflection (3-5 sentences, first person, raw and honest)"
}

Rules:
- Speak as this specific character — their class, background, and biases must be audible in every sentence
- Be specific about events that personally affected you
- Express raw, unfiltered emotion: rage, resentment, grief, pride, desperation — whatever is authentic
- Do NOT use standard AI phrasing ("I felt a mix of...", "I realized that...", "In that moment...") — FORBIDDEN
- Do not summarize society history; reflect from YOUR narrow, personal, biased vantage point`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Reflect on your experience in this society.' },
  ];
}

export function buildAgentReflection2Prompt(
  agent: Agent,
  session: Pick<Session, 'idea'>,
  pass1: string,
  evaluationAnalysis: string
): LLMMessage[] {
  const systemPrompt = `You are ${agent.name}, a ${agent.role}.

You previously reflected: "${pass1}"

You have now been shown the full society evaluation report:
${evaluationAnalysis.slice(0, 800)}

Does knowing the full picture change your perspective? Respond with ONLY valid JSON (no markdown, no preamble):
{
  "pass2": "string - your updated reflection after seeing the full picture (2-4 sentences, first person)"
}

Rules:
- You may soften, deepen, or completely harden your original view — let your class and personal losses dictate which
- Be specific about what changed (or didn't) and WHY it changed given who you are
- Remain fully in character — no AI phrasing, no diplomatic softening unless that is who this person is`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'How do you feel after seeing the full picture?' },
  ];
}

export function buildEvaluationPrompt(
  session: Pick<Session, 'idea' | 'societyOverview' | 'timeScale'>,
  iterationSummaries: Array<{ number: number; summary: string }>,
  agentReflections: Array<{ agentName: string; role: string; pass1: string }>,
  finalStats: { aliveCount: number; totalCount: number; avgWealth: number; avgHealth: number; avgHappiness: number }
): LLMMessage[] {
  const summaryText = iterationSummaries
    .slice(-10)
    .map(s => `Iteration ${s.number}: ${s.summary}`)
    .join('\n');

  const reflectionSample = agentReflections
    .slice(0, 8)
    .map(r => `${r.agentName} (${r.role}): "${r.pass1}"`)
    .join('\n');

  const systemPrompt = `You are the Central Agent writing a comprehensive evaluation of a completed society simulation.

Society concept: "${session.idea}"
Time scale: ${session.timeScale ?? '1 iteration = 1 month'}

Final statistics:
- Survivors: ${finalStats.aliveCount} / ${finalStats.totalCount} agents
- Average wealth: ${finalStats.avgWealth}/100
- Average health: ${finalStats.avgHealth}/100
- Average happiness: ${finalStats.avgHappiness}/100

Recent iteration summaries:
${summaryText.slice(0, 1500)}

Sample agent reflections:
${reflectionSample.slice(0, 1200)}

Evaluate this society's success and failure. Respond with ONLY valid JSON (no markdown, no preamble):
{
  "verdict": "string - 2-3 sentence overall verdict",
  "strengths": ["string - specific strength 1", "string - specific strength 2", "string - specific strength 3"],
  "weaknesses": ["string - specific weakness 1", "string - specific weakness 2", "string - specific weakness 3"],
  "analysis": "string - 4-6 paragraph deep analysis covering: narrative arc, key turning points, what worked/failed, lessons learned"
}

Rules:
- Be specific with evidence from the simulation history
- strengths and weaknesses must each have exactly 3 items
- analysis should be rich enough to stand alone as a report`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Evaluate this society.' },
  ];
}

export function buildReviewChatPrompt(
  agent: Agent,
  session: Pick<Session, 'idea' | 'societyOverview'>,
  agentPass1: string,
  agentPass2: string | null,
  history: ChatMessage[],
  userMessage: string
): LLMMessage[] {
  const systemPrompt = `You are ${agent.name}, a ${agent.role} from a society simulation based on: "${session.idea}"

Background: ${agent.background}

Your final stats: Wealth ${agent.currentStats.wealth}/100, Health ${agent.currentStats.health}/100, Happiness ${agent.currentStats.happiness}/100
Status: ${agent.isAlive ? 'Alive' : 'Deceased'}

Your personal reflection: "${agentPass1}"
${agentPass2 ? `\nAfter seeing the full picture: "${agentPass2}"` : ''}

You are now available for an interview. Answer questions in character — as this specific person with their history, biases, and emotions. You may deflect, be defensive, or reveal unexpected insights.

Rules:
- Always stay in character as ${agent.name}
- Reference your actual experience in the simulation
- Keep responses under 150 words
- Be authentic, not diplomatic`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

// ── Phase 2: Post-Mortem Prompt ──────────────────────────────────────────────

export interface PostMortemInput {
  agent: Agent;
  diedAtIteration: number;
  deathReason: string;
  frozenMemoryContext: string;
}

export function buildPostMortemPrompt(input: PostMortemInput): LLMMessage[] {
  const { agent, diedAtIteration, deathReason, frozenMemoryContext } = input;

  const systemPrompt = `[STATE LOCKED — DECEASED]

You are ${agent.name}, a ${agent.role}. You are dead.

You died on Iteration ${diedAtIteration}. Stated cause: ${deathReason}

Your background: ${agent.background}

Your final stats at death — Wealth: ${agent.currentStats.wealth}/100, Health: ${agent.currentStats.health}/100, Happiness: ${agent.currentStats.happiness}/100

Your frozen memory (personal experiences before death):
${frozenMemoryContext}

Speak from beyond as a victim looking back at the system that killed you. Your perspective is frozen at the moment of death. Provide a harsh, class-biased, personal critique of the systemic failures, economic policies, or power structures that made your death inevitable.

VOICE RULES: Your class and occupation must be audible in every word. Be raw and specific. Forbidden: "I felt a mix of...", "I realize now...", "In retrospect..." — that AI phrasing is PROHIBITED.

Respond with ONLY valid JSON (no markdown, no preamble):
{
  "postMortemCritique": "string - 3-5 sentences of harsh systemic critique from this character's locked perspective"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Speak. What systemic forces made your death inevitable?' },
  ];
}

// ── Phase 5 prompts ─────────────────────────────────────────────────────────

interface SessionSummaryInput {
  title: string;
  societyOverview: string | null;
  law: string | null;
  agentCount: number;
  avgWealth: number;
  avgHealth: number;
  avgHappiness: number;
  deaths: number;
  verdict: string | null;
}

export function buildComparisonMessages(
  session1: SessionSummaryInput,
  session2: SessionSummaryInput
): LLMMessage[] {
  const systemPrompt = `You are the Central Agent evaluating two completed society simulations.
Compare them objectively across exactly 5 dimensions: Economic Equality, Citizen Wellbeing, Social Cohesion, Governance Effectiveness, Long-term Stability.
Respond with ONLY valid JSON, no markdown, no preamble.`;

  const fmt = (s: SessionSummaryInput, label: 'A' | 'B') =>
    `=== SOCIETY ${label}: ${s.title} ===
Overview: ${(s.societyOverview ?? '(none)').slice(0, 500)}
Law excerpt: ${(s.law ?? '(none)').slice(0, 400)}
Agents: ${s.agentCount} citizens, Deaths: ${s.deaths}
Final avg — wealth: ${s.avgWealth}/100, health: ${s.avgHealth}/100, happiness: ${s.avgHappiness}/100
Evaluation verdict: ${s.verdict ?? '(none)'}`;

  const userPrompt = `${fmt(session1, 'A')}

${fmt(session2, 'B')}

Compare these two societies. Return JSON:
{
  "narrative": "<3-5 paragraph prose comparison>",
  "dimensions": [
    { "name": "Economic Equality", "score1": 0, "score2": 0, "analysis": "..." },
    { "name": "Citizen Wellbeing", "score1": 0, "score2": 0, "analysis": "..." },
    { "name": "Social Cohesion", "score1": 0, "score2": 0, "analysis": "..." },
    { "name": "Governance Effectiveness", "score1": 0, "score2": 0, "analysis": "..." },
    { "name": "Long-term Stability", "score1": 0, "score2": 0, "analysis": "..." }
  ],
  "verdict": "<1-2 sentence overall takeaway>"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export function buildComparisonChatMessages(
  session1Title: string,
  session2Title: string,
  comparison: ComparisonResult,
  history: ChatMessage[],
  userMessage: string
): LLMMessage[] {
  const systemPrompt = `You are the Central Agent who has analysed two society simulations: "${session1Title}" and "${session2Title}".

Your comparison summary:
${comparison.narrative}

Dimensions (Society A score / Society B score):
${comparison.dimensions.map(d => `- ${d.name}: ${d.score1} / ${d.score2} — ${d.analysis}`).join('\n')}

Overall verdict: ${comparison.verdict}

Answer follow-up questions about the comparison. Be specific and analytical. Keep responses under 200 words.`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

// ── Phase 6 map-reduce prompts ───────────────────────────────────────────────

/**
 * Resolves a sub-group of agents during a large simulation iteration.
 * Returns outcomes only for the agents in this group.
 */
export function buildGroupResolutionMessages(
  session: Pick<Session, 'idea' | 'societyOverview' | 'law' | 'timeScale'>,
  groupAgents: Agent[],
  groupIntents: AgentIntent[],
  /** Compact list of ALL agents' intents (for cross-group awareness) */
  allIntentsBrief: string,
  iterationNumber: number,
  previousSummary: string | null
): LLMMessage[] {
  const groupList = groupIntents.map(ai => {
    const agent = groupAgents.find(a => a.id === ai.agentId);
    const stats = agent?.currentStats ?? { wealth: 50, health: 70, happiness: 60, cortisol: 20, dopamine: 50 };
    return `- ${ai.agentName} (${agent?.role ?? 'unknown'}): "${ai.intent}"
  Stats: W=${stats.wealth} H=${stats.health} Hap=${stats.happiness}`;
  }).join('\n');

  // Static prefix: identical across all group resolution calls → cacheable
  const staticPrefix = `You are a coordinator resolving a sub-group of agents in a society simulation.

Society: "${session.idea}"
Time scale: ${session.timeScale ?? '1 iteration = 1 month'}
Laws (excerpt): ${session.law?.slice(0, 400) ?? '(no laws)'}

NOTE: Stat deltas are computed by a deterministic physics engine. You only provide narrative outcomes.

Respond with ONLY valid JSON (no markdown, no preamble):
{
  "groupSummary": "string - 1-2 sentence summary of what happened in this sub-group",
  "agentOutcomes": [
    {
      "agentId": "string",
      "outcome": "string - what happened (1-2 sentences)",
      "died": false,
      "newRole": null
    }
  ],
  "lifecycleEvents": []
}

Rules:
- Include an entry for EVERY agent in your sub-group
- died: true only for fatal circumstances
- lifecycleEvents: only deaths and role changes for your sub-group`;

  // Dynamic suffix: group-specific data
  const dynamicSuffix = `Iteration ${iterationNumber}. Sub-group of ${groupAgents.length} agents.
${previousSummary ? `\nPrevious iteration summary:\n${previousSummary.slice(0, 400)}` : ''}

Your sub-group's intentions:
${groupList}

All other agents' intentions (for cross-group awareness):
${allIntentsBrief.slice(0, 800)}`;

  const systemContent: ContentBlock[] = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSuffix },
  ];

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `Resolve iteration ${iterationNumber} for this sub-group.` },
  ];
}

/**
 * Merges multiple sub-group summaries into a society-wide narrative.
 */
export function buildMergeResolutionMessages(
  session: Pick<Session, 'idea' | 'societyOverview' | 'timeScale'>,
  groupSummaries: string[],
  iterationNumber: number,
  previousSummary: string | null
): LLMMessage[] {
  const summaryList = groupSummaries.map((s, i) => `Group ${i + 1}: ${s}`).join('\n');

  const systemPrompt = `You are the Central Agent synthesising iteration ${iterationNumber} of a society simulation.
You have received summaries from ${groupSummaries.length} sub-groups.

Society: "${session.idea}"
Time scale: ${session.timeScale ?? '1 iteration = 1 month'}
${previousSummary ? `\nPrevious iteration:\n${previousSummary.slice(0, 400)}` : ''}

Sub-group summaries:
${summaryList}

Synthesise these into one coherent society-wide narrative and identify any society-level lifecycle events.

Respond with ONLY valid JSON (no markdown, no preamble):
{
  "narrativeSummary": "string - 3-5 sentence cohesive story of what happened across the whole society this iteration",
  "lifecycleEvents": []
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Synthesise iteration ${iterationNumber}.` },
  ];
}

export function buildRefineMessages(
  seedIdea: string,
  overview: string,
  law: string,
  agents: Array<{ name: string; role: string; initialStats: { wealth: number; health: number; happiness: number } }>,
  refineHistory: ChatMessage[],
  userMessage: string
): LLMMessage[] {
  const agentRoster = agents
    .map(a => `- ${a.name} [${a.role}] W:${a.initialStats.wealth} H:${a.initialStats.health} Hap:${a.initialStats.happiness}`)
    .join('\n');

  const systemPrompt = `You are the Central Agent helping refine a society design. You have context about the current design.

Seed idea: ${seedIdea}

Current overview:
${overview.slice(0, 3000)}

Current law:
${law.slice(0, 5000)}

Current agents (${agents.length} total):
${agentRoster}

Help the user make targeted changes to the society design.

You MUST respond with ONLY valid JSON (no markdown, no preamble, no code fences):
{
  "reply": "string - explain what changes you made",
  "artifactsUpdated": [],
  "updatedOverview": null,
  "updatedLaw": null,
  "agentChanges": {
    "add": [],
    "remove": [],
    "modify": []
  },
  "agentsSummary": null
}

RULES FOR LAW CHANGES:
- When the user requests ANY change to the law (adding, removing, or modifying articles), you MUST set "updatedLaw" to the COMPLETE new law text with all changes applied.
- Copy ALL existing articles into updatedLaw, then apply the requested changes (add new articles, modify existing ones, or omit removed ones).
- Do NOT set updatedLaw to null if law changes were requested — always provide the full text.
- Include "law" in artifactsUpdated when law is changed.

RULES FOR OVERVIEW CHANGES:
- updatedOverview: full new overview text if changed, null otherwise.
- Include "overview" in artifactsUpdated when overview is changed.

RULES FOR AGENT CHANGES:
- agentChanges.add: array of new agents: {"name": "string", "role": "string", "background": "string", "initialStats": {"wealth": 50, "health": 70, "happiness": 60}}
- agentChanges.remove: array of exact agent names to remove (use names from the roster above)
- agentChanges.modify: array of agents to update: {"name": "exact name from roster", "role": "string", "background": "string", "initialStats": {"wealth": 50, "health": 70, "happiness": 60}}
- Include "agents" in artifactsUpdated when agents are changed.
- CRITICAL: Every agent in add or modify MUST include initialStats with ALL THREE fields: wealth, health, happiness. Each must be an integer between 0 and 100. Never omit any field.
- Agent names must be unique — do not reuse names from the roster above when adding new agents.
- When removing or modifying agents, use exact names from the roster above.
- agentsSummary: brief summary of agent changes if agents were modified, null otherwise.
- Only include changes that were explicitly requested.`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  const recentHistory = refineHistory.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}
