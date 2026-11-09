ALTER TABLE job_reductions DROP CONSTRAINT IF EXISTS job_reductions_level_check;
ALTER TABLE job_reductions ADD CONSTRAINT job_reductions_level_check CHECK(level>=0 AND level<32);
