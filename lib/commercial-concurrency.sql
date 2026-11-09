ALTER TABLE users ADD COLUMN IF NOT EXISTS cleanup_after timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION prevent_deleted_account_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleting timestamptz;
BEGIN
 IF TG_TABLE_NAME='settings' THEN
  IF NEW.openai_key IS NULL AND NEW.anthropic_key IS NULL AND NEW.groq_key IS NULL AND NEW.gemini_key IS NULL THEN RETURN NEW; END IF;
 END IF;
 SELECT deletion_requested_at INTO deleting FROM users WHERE id=NEW.user_id FOR UPDATE;
 IF deleting IS NOT NULL THEN RAISE EXCEPTION 'Account deletion is in progress' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS settings_deletion_guard ON settings;
CREATE TRIGGER settings_deletion_guard BEFORE INSERT OR UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION prevent_deleted_account_write();
DROP TRIGGER IF EXISTS source_deletion_guard ON discovery_sources;
CREATE TRIGGER source_deletion_guard BEFORE INSERT ON discovery_sources FOR EACH ROW EXECUTE FUNCTION prevent_deleted_account_write();
DROP TRIGGER IF EXISTS transcript_deletion_guard ON transcripts;
CREATE TRIGGER transcript_deletion_guard BEFORE INSERT ON transcripts FOR EACH ROW EXECUTE FUNCTION prevent_deleted_account_write();
DROP TRIGGER IF EXISTS job_deletion_guard ON jobs;
CREATE TRIGGER job_deletion_guard BEFORE INSERT OR UPDATE OF state ON jobs FOR EACH ROW WHEN (NEW.state IN ('queued','processing')) EXECUTE FUNCTION prevent_deleted_account_write();
