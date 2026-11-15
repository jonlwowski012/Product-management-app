CREATE TABLE IF NOT EXISTS beta_invitations (
 slot smallint PRIMARY KEY CHECK(slot BETWEEN 1 AND 10),
 token_hash text NOT NULL UNIQUE,
 user_id uuid UNIQUE REFERENCES users ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 CHECK(user_id IS NULL OR claimed_at IS NOT NULL)
);
