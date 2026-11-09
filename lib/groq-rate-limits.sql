ALTER TABLE settings ALTER COLUMN provider SET DEFAULT 'groq';
ALTER TABLE settings ALTER COLUMN model SET DEFAULT 'openai/gpt-oss-20b';
UPDATE settings SET provider='groq',model='openai/gpt-oss-20b'
WHERE openai_key IS NULL AND anthropic_key IS NULL AND groq_key IS NULL
AND provider='openai' AND model='gpt-4.1-mini';

CREATE TABLE IF NOT EXISTS groq_rate_limits (
  id text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{"events":[]}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
