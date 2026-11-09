ALTER TABLE discovery_reports ADD COLUMN IF NOT EXISTS recovery_count integer NOT NULL DEFAULT 0;
ALTER TABLE discovery_reports ADD COLUMN IF NOT EXISTS recovery_root_id uuid;
ALTER TABLE discovery_reports ADD COLUMN IF NOT EXISTS recovery_of uuid;
DO $$ BEGIN
 ALTER TABLE discovery_reports ADD CONSTRAINT discovery_recovery_root_owner FOREIGN KEY(recovery_root_id,user_id) REFERENCES discovery_reports(id,user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE discovery_reports ADD CONSTRAINT discovery_recovery_parent_owner FOREIGN KEY(recovery_of,user_id) REFERENCES discovery_reports(id,user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS discovery_recovery_parent ON discovery_reports(user_id,recovery_of);
CREATE TABLE IF NOT EXISTS discovery_validation_work (
 user_id uuid NOT NULL, report_id uuid NOT NULL, opportunity_id text NOT NULL,
 opportunity jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('chosen','testing','reviewed')),
 activity text NOT NULL DEFAULT '', learning text NOT NULL DEFAULT '',
 outcome text CHECK(outcome IN ('supported','challenged','inconclusive')),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,report_id,opportunity_id),
 FOREIGN KEY(report_id,user_id) REFERENCES discovery_reports(id,user_id) ON DELETE CASCADE,
 CHECK(status <> 'reviewed' OR (outcome IS NOT NULL AND length(trim(learning)) > 0))
);
