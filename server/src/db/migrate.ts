import { sqlite } from './index.js';

export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      seed_idea TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'idea-input',
      config TEXT,
      law TEXT,
      society_overview TEXT,
      time_scale TEXT,
      society_evaluation TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      background TEXT NOT NULL DEFAULT '',
      initial_stats TEXT NOT NULL DEFAULT '{}',
      current_stats TEXT NOT NULL DEFAULT '{}',
      type TEXT NOT NULL DEFAULT 'citizen',
      status TEXT NOT NULL DEFAULT 'alive',
      born_at_iteration INTEGER,
      died_at_iteration INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);

    CREATE TABLE IF NOT EXISTS agent_intents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      iteration_id TEXT,
      intent TEXT NOT NULL,
      reasoning TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_intents_session ON agent_intents(session_id);

    CREATE TABLE IF NOT EXISTS resolved_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      iteration_id TEXT,
      action TEXT NOT NULL,
      outcome TEXT,
      resolved_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_resolved_actions_session ON resolved_actions(session_id);

    CREATE TABLE IF NOT EXISTS iterations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      iteration_number INTEGER NOT NULL,
      state_summary TEXT NOT NULL DEFAULT '',
      statistics TEXT NOT NULL DEFAULT '{}',
      lifecycle_events TEXT NOT NULL DEFAULT '[]',
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_iterations_session ON iterations(session_id);

    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      insights TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      context TEXT NOT NULL,
      agent_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_changes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      reason TEXT,
      iteration_number INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);

  // Data migration: rename 'refine' context to 'refinement' (spec §5.1 ChatContext)
  sqlite.exec(`
    UPDATE chat_messages SET context = 'refinement' WHERE context = 'refine';
  `);

  // Phase 4 migration: add agent_id to reflections (idempotent via try-catch)
  try {
    sqlite.exec(`ALTER TABLE reflections ADD COLUMN agent_id TEXT;`);
  } catch {
    // Column already exists — safe to ignore
  }

  console.log('Database migrations applied.');
}
