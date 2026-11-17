ALTER TABLE discovery_sources
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS context_default_at timestamptz;

CREATE TABLE IF NOT EXISTS source_connection_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector text NOT NULL,
  authorization_until timestamptz NOT NULL,
  PRIMARY KEY (user_id, connector)
);
