ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS one_public_demo ON users(is_demo) WHERE is_demo;
CREATE TABLE IF NOT EXISTS demo_dataset (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 version text NOT NULL, seeded_at timestamptz NOT NULL DEFAULT now()
);
