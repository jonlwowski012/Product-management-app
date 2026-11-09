CREATE TABLE IF NOT EXISTS job_reductions (
 job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 level integer NOT NULL CHECK(level>=0 AND level<8),
 batch_index integer NOT NULL CHECK(batch_index>=0),
 input jsonb NOT NULL, selected_ids jsonb, usage jsonb,
 completed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(job_id,level,batch_index)
);
ALTER TABLE discovery_reports ADD COLUMN IF NOT EXISTS import_warnings jsonb NOT NULL DEFAULT '[]';
