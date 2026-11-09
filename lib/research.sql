ALTER TABLE customers ADD COLUMN IF NOT EXISTS merged_into uuid;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS research_version integer NOT NULL DEFAULT 1;
DO $$ BEGIN
 ALTER TABLE customers ADD CONSTRAINT customers_merge_owner FOREIGN KEY(merged_into,user_id) REFERENCES customers(id,user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS research_company_aliases (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 name_key text NOT NULL, company_id uuid NOT NULL,
 PRIMARY KEY(user_id,name_key),
 FOREIGN KEY(company_id,user_id) REFERENCES customers(id,user_id)
);
CREATE TABLE IF NOT EXISTS research_document_edits (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 source_id uuid, transcript_id uuid, company_id uuid, meeting_date date,
 version integer NOT NULL DEFAULT 1,
 CHECK(num_nonnulls(source_id,transcript_id)=1),
 UNIQUE(user_id,source_id), UNIQUE(user_id,transcript_id),
 FOREIGN KEY(source_id,user_id) REFERENCES discovery_sources(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(transcript_id,user_id) REFERENCES transcripts(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(company_id,user_id) REFERENCES customers(id,user_id)
);
CREATE TABLE IF NOT EXISTS research_signal_edits (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 signal_key text NOT NULL, company_id uuid, company_override boolean NOT NULL DEFAULT false,
 theme text, hidden boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(user_id,signal_key),
 FOREIGN KEY(company_id,user_id) REFERENCES customers(id,user_id)
);
CREATE INDEX IF NOT EXISTS research_source_reports ON discovery_report_sources(user_id,source_id);
CREATE INDEX IF NOT EXISTS research_analysis_jobs ON jobs(user_id,created_at DESC) WHERE purpose='analyze';
