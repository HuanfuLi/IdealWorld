import type { LLMMessage } from './types.js';
import type { Agent, ChatMessage, Session } from '@idealworld/shared';

export function buildBrainstormMessages(
  seedIdea: string,
  history: ChatMessage[],
  userMessage: string
): LLMMessage[] {
  const systemPrompt = `You are the Central Agent for a society simulation. The user wants to simulate: "${seedIdea}"

Your job is to gather enough information to design a complete society. Ask 2-3 focused questions per response covering these 5 areas:
1. governance - How the society is governed, decision-making structures
2. economy - Economic system, resource distribution, trade
3. legal - Laws, justice system, rights and obligations
4. culture - Values, traditions, social norms, education
5. infrastructure - Physical environment, technology level, basic services

Track which areas have been sufficiently covered. Once ALL five areas have meaningful information, set readyForDesign to true.

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "reply": "your conversational response with 2-3 focused questions",
  "checklist": {
    "governance": false,
    "economy": false,
    "legal": false,
    "culture": false,
    "infrastructure": false
  },
  "readyForDesign": false
}

Rules:
- Set checklist items to true only when that area has been sufficiently discussed
- readyForDesign must only be true when ALL 5 checklist items are true
- Be encouraging and curious in your reply
- Keep replies concise (under 200 words)`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  // Cap history at last 20 messages
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
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
  iterationNumber: number
): LLMMessage[] {
  const systemPrompt = `You are ${agent.name}, a ${agent.role} in a simulated society based on: "${session.idea}"

Background: ${agent.background}

Your current status:
- Wealth: ${agent.currentStats.wealth}/100
- Health: ${agent.currentStats.health}/100
- Happiness: ${agent.currentStats.happiness}/100

Society overview (excerpt):
${session.societyOverview?.slice(0, 500) ?? '(no overview)'}

Laws (excerpt):
${session.law?.slice(0, 400) ?? '(no laws)'}

Time scale: ${session.timeScale ?? '1 iteration = 1 month'}

${previousSummary ? `What happened last iteration:\n${previousSummary.slice(0, 600)}` : 'This is the first iteration.'}

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "intent": "string - what you intend to do this iteration (1-3 sentences, first person)",
  "reasoning": "string - your internal reasoning (1-2 sentences)"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Iteration ${iterationNumber}: What will you do?` },
  ];
}

export interface AgentIntent {
  agentId: string;
  agentName: string;
  intent: string;
  reasoning: string;
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
    const stats = agent?.currentStats ?? { wealth: 50, health: 70, happiness: 60 };
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

You MUST respond with ONLY valid JSON (no markdown, no preamble):
{
  "narrativeSummary": "string - 3-5 sentence story of what happened this iteration",
  "agentOutcomes": [
    {
      "agentId": "string",
      "outcome": "string - what happened to this agent (1-2 sentences)",
      "wealthDelta": 0,
      "healthDelta": 0,
      "happinessDelta": 0,
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
- Deltas must be integers between -30 and +30; be realistic, not extreme
- died: true only if the agent's health would drop to 0 or they face fatal circumstances
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
- Speak as the character, not as an AI
- Be specific about events that affected you
- Express genuine emotions: resentment, gratitude, regret, pride, etc.
- Do not summarize; reflect personally`;

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
- You may soften, deepen, or maintain your original view
- Be specific about what changed (or didn't) in your thinking
- Remain in character`;

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

export function buildRefineMessages(
  seedIdea: string,
  overview: string,
  law: string,
  agentCount: number,
  refineHistory: ChatMessage[],
  userMessage: string
): LLMMessage[] {
  const systemPrompt = `You are the Central Agent helping refine a society design. You have context about the current design.

Seed idea: ${seedIdea}

Current overview (excerpt):
${overview.slice(0, 500)}

Current law (excerpt):
${law.slice(0, 500)}

Current agent count: ${agentCount}

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

Rules:
- artifactsUpdated: array containing any of "overview", "law", "agents" that were changed
- updatedOverview: full new overview text if changed, null otherwise
- updatedLaw: full new law text if changed, null otherwise
- agentChanges.add: array of {name, role, background, initialStats} for new agents
- agentChanges.remove: array of agent names to remove
- agentChanges.modify: array of {name, role, background, initialStats} for agents to update
- agentsSummary: brief summary of agent changes if agents were modified, null otherwise
- Only include changes that were explicitly requested`;

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
