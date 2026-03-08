import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('name').notNull(),
  idea: text('seed_idea').notNull(),
  stage: text('stage').notNull().default('idea-input'),
  config: text('config'),
  law: text('law'),
  societyOverview: text('society_overview'),
  timeScale: text('time_scale'),
  societyEvaluation: text('society_evaluation'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull(),
  background: text('background').notNull().default(''),
  initialStats: text('initial_stats').notNull().default('{}'),
  currentStats: text('current_stats').notNull().default('{}'),
  type: text('type').notNull().default('citizen'),
  status: text('status').notNull().default('alive'),
  bornAtIteration: integer('born_at_iteration'),
  diedAtIteration: integer('died_at_iteration'),
});

export const agentIntents = sqliteTable('agent_intents', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  iterationId: text('iteration_id'),
  intent: text('intent').notNull(),
  reasoning: text('reasoning'),
  actionCode: text('action_code').notNull().default('NONE'),
  actionTarget: text('action_target'),
  createdAt: text('created_at').notNull(),
});

export const resolvedActions = sqliteTable('resolved_actions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  iterationId: text('iteration_id'),
  action: text('action').notNull(),
  outcome: text('outcome'),
  resolvedAt: text('resolved_at').notNull(),
});

export const iterations = sqliteTable('iterations', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  iterationNumber: integer('iteration_number').notNull(),
  stateSummary: text('state_summary').notNull().default(''),
  statistics: text('statistics').notNull().default('{}'),
  lifecycleEvents: text('lifecycle_events').notNull().default('[]'),
  timestamp: text('timestamp').notNull(),
});

export const reflections = sqliteTable('reflections', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agentId: text('agent_id'),
  content: text('content').notNull(),
  insights: text('insights'),
  createdAt: text('created_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  context: text('context').notNull(),
  agentId: text('agent_id'),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: text('timestamp').notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const roleChanges = sqliteTable('role_changes', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  fromRole: text('from_role').notNull(),
  toRole: text('to_role').notNull(),
  reason: text('reason'),
  iterationNumber: integer('iteration_number').notNull(),
  timestamp: text('timestamp').notNull(),
});

// ── Phase 1 Economy Tables ──────────────────────────────────────────────────

/** Stores per-iteration economy snapshots (skills, inventory, market state). */
export const economySnapshots = sqliteTable('economy_snapshots', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  iterationNumber: integer('iteration_number').notNull(),
  /** JSON: full EconomySnapshot (market state, contracts, summary stats). */
  snapshotData: text('snapshot_data').notNull().default('{}'),
  timestamp: text('timestamp').notNull(),
});

/** Stores per-agent economy state (skills + inventory), updated each iteration. */
export const agentEconomy = sqliteTable('agent_economy', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  /** JSON: SkillMatrix */
  skills: text('skills').notNull().default('{}'),
  /** JSON: Inventory */
  inventory: text('inventory').notNull().default('{}'),
  /** Last iteration this was updated. */
  lastUpdated: integer('last_updated').notNull().default(0),
});

/** Stores market price history for charting/analytics. */
export const marketPrices = sqliteTable('market_prices', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  iterationNumber: integer('iteration_number').notNull(),
  /** Item type (food, tools, luxury_goods, raw_materials). */
  itemType: text('item_type').notNull(),
  /** Last traded price. */
  lastPrice: real('last_price').notNull().default(0),
  /** Volume-weighted average price. */
  vwap: real('vwap').notNull().default(0),
  /** Total volume traded. */
  volume: integer('volume').notNull().default(0),
});

// ── Phase 3: Tick System & Enterprise Data Model ────────────────────────────

export const enterprises = sqliteTable('enterprises', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  industry: text('industry').notNull(), // 'Agriculture' | 'Extraction' | 'Manufacturing' | 'Services'
  outputCommodity: text('output_commodity').notNull(), // CommodityCategory
  efficiencyMultiplier: real('efficiency_multiplier').notNull().default(2.5),
  employeeIds: text('employee_ids').notNull().default('[]'), // JSON array
  wagePer8Ticks: real('wage_per_8_ticks').notNull().default(0),
  stockpile: real('stockpile').notNull().default(0),
  foundedAt: integer('founded_at').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const jobOffers = sqliteTable('job_offers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  enterpriseId: text('enterprise_id').notNull(),
  ownerId: text('owner_id').notNull(),
  industry: text('industry').notNull(),
  wage: real('wage').notNull(),
  minSkillReq: real('min_skill_req').notNull().default(0),
  isOpen: integer('is_open', { mode: 'boolean' }).notNull().default(true),
  postedAt: integer('posted_at').notNull(),
  applicantIds: text('applicant_ids').notNull().default('[]'), // JSON array
});

export const agentTickState = sqliteTable('agent_tick_state', {
  agentId: text('agent_id').notNull(),
  sessionId: text('session_id').notNull(),
  satiety: real('satiety').notNull().default(70),
  cortisol: real('cortisol').notNull().default(20),
  energy: real('energy').notNull().default(80),
  activeTask: text('active_task'),  // JSON blob of ActiveTask | null
  lastPromptedTick: integer('last_prompted_tick').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

