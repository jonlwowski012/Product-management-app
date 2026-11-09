CREATE TABLE IF NOT EXISTS discovery_sources (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 filename text NOT NULL, sha256 text NOT NULL, pages jsonb NOT NULL,
 warnings jsonb NOT NULL DEFAULT '[]', storage_path text, storage_key text,
 role text NOT NULL DEFAULT 'auto' CHECK(role IN ('auto','customer','context')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,sha256)
);
CREATE TABLE IF NOT EXISTS discovery_reports (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 question text NOT NULL DEFAULT '', product_context text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1, parent_id uuid, input_hash text NOT NULL, result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,input_hash),
 FOREIGN KEY(parent_id,user_id) REFERENCES discovery_reports(id,user_id)
);
CREATE TABLE IF NOT EXISTS discovery_report_sources (
 user_id uuid NOT NULL, report_id uuid NOT NULL, source_id uuid NOT NULL, role text NOT NULL,
 PRIMARY KEY(report_id,source_id),
 FOREIGN KEY(report_id,user_id) REFERENCES discovery_reports(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,user_id) REFERENCES discovery_sources(id,user_id)
);
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_purpose_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_purpose_check CHECK(purpose IN ('extract','brief','analyze'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS report_id uuid;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'byok';
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_report_owner;
ALTER TABLE jobs ADD CONSTRAINT jobs_report_owner FOREIGN KEY(report_id,user_id) REFERENCES discovery_reports(id,user_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_report ON jobs(report_id) WHERE state IN ('queued','processing');
ALTER TABLE job_chunks ADD COLUMN IF NOT EXISTS input jsonb;
ALTER TABLE upload_reservations ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE upload_reservations ADD COLUMN IF NOT EXISTS discovery boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS included_usage (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, month date NOT NULL,
 characters integer NOT NULL DEFAULT 0, runs integer NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,month)
);
