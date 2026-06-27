-- Mental Wellness Tracker - Neon Postgres schema
-- Run once against DATABASE_URL. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- bcrypt hash
  exam_type     TEXT NOT NULL,                 -- NEET, JEE, CUET, CAT, GATE, UPSC, boards, other
  exam_date     DATE,
  persona_pref  TEXT NOT NULL DEFAULT 'adaptive', -- calm | hype | adaptive
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mood_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id   BIGINT REFERENCES journal_entries(id) ON DELETE CASCADE,
  mood       SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  energy     SMALLINT NOT NULL CHECK (energy BETWEEN 1 AND 5),
  sleep_hrs  NUMERIC(3,1) CHECK (sleep_hrs >= 0 AND sleep_hrs <= 24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id          BIGSERIAL PRIMARY KEY,
  entry_id    BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  emotion     TEXT NOT NULL,                   -- dominant emotion label
  intensity   SMALLINT NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  summary     TEXT NOT NULL,
  reframe     TEXT,                            -- CBT-style cognitive reframe
  coping_json JSONB NOT NULL DEFAULT '{}'::jsonb, -- { strategy, mindfulness, nudge }
  safety_flag BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS triggers (
  id          BIGSERIAL PRIMARY KEY,
  analysis_id BIGINT NOT NULL REFERENCES ai_analysis(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,                   -- "mock test", "peer comparison"
  category    TEXT NOT NULL,                   -- academic | social | family | health | self
  sentiment   SMALLINT NOT NULL CHECK (sentiment BETWEEN -2 AND 2)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes: every dashboard/trend query filters by user + time.
CREATE INDEX IF NOT EXISTS idx_journal_user_time   ON journal_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mood_user_time      ON mood_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_entry      ON ai_analysis (entry_id);
CREATE INDEX IF NOT EXISTS idx_triggers_analysis   ON triggers (analysis_id);
CREATE INDEX IF NOT EXISTS idx_triggers_label      ON triggers (label);
CREATE INDEX IF NOT EXISTS idx_chat_user_time      ON chat_messages (user_id, created_at);
