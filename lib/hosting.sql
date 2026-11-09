ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workflow_run_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatch_after timestamptz NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatch_token uuid;
CREATE TABLE IF NOT EXISTS job_chunks (
 job_id uuid NOT NULL REFERENCES jobs ON DELETE CASCADE, chunk_index integer NOT NULL,
 source_start integer NOT NULL, source_end integer NOT NULL, completed boolean NOT NULL DEFAULT false,
 candidates jsonb, usage jsonb, PRIMARY KEY(job_id,chunk_index)
);
CREATE TABLE IF NOT EXISTS upload_reservations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 customer_id uuid NOT NULL, filename text NOT NULL, title text NOT NULL, pathname text NOT NULL UNIQUE,
 expected_size integer NOT NULL CHECK(expected_size BETWEEN 1 AND 10485760), blob_url text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','completed','failed')),
 result jsonb, error text, locked_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,user_id) REFERENCES customers(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS storage_deletions (
 pathname text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_dispatch ON jobs(dispatch_after) WHERE state IN ('queued','processing');
CREATE INDEX IF NOT EXISTS expired_uploads ON upload_reservations(expires_at);
CREATE TABLE IF NOT EXISTS deployment_environment (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 name text NOT NULL CHECK(name IN ('preview','production'))
);

ALTER TABLE storage_deletions ADD COLUMN IF NOT EXISTS not_before timestamptz NOT NULL DEFAULT now();
ALTER TABLE storage_deletions ADD COLUMN IF NOT EXISTS transcript_id uuid;
