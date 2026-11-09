ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
CREATE TABLE IF NOT EXISTS subscriptions (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 customer_id text UNIQUE, subscription_id text UNIQUE, checkout_id text,
 status text NOT NULL DEFAULT 'unpaid', paid_until timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_events (
 id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expired_account_tokens ON account_tokens(expires_at);
ALTER TABLE discovery_sources ADD COLUMN IF NOT EXISTS original_bytes bigint NOT NULL DEFAULT 0;
-- Existing originals remain readable; new uploads record their exact byte size.
UPDATE discovery_sources SET original_bytes=octet_length(pages::text) WHERE original_bytes=0;

CREATE OR REPLACE FUNCTION enforce_account_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE used_bytes bigint; used_chars bigint; new_bytes bigint; new_chars bigint;
BEGIN
 PERFORM id FROM users WHERE id=NEW.user_id FOR UPDATE;
 IF TG_TABLE_NAME='jobs' THEN
  IF NEW.state IN ('queued','processing') AND EXISTS(SELECT 1 FROM jobs WHERE user_id=NEW.user_id AND id<>NEW.id AND state IN ('queued','processing')) THEN
   RAISE EXCEPTION 'One analysis can run at a time. Wait for your current analysis to finish.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='discovery_sources' THEN
  IF EXISTS(SELECT 1 FROM discovery_sources WHERE user_id=NEW.user_id AND sha256=NEW.sha256) THEN RETURN NEW; END IF;
  new_bytes:=NEW.original_bytes;
  SELECT coalesce(sum(length(p->>'text')),0) INTO new_chars FROM jsonb_array_elements(NEW.pages) p;
 ELSE
  IF EXISTS(SELECT 1 FROM transcripts WHERE user_id=NEW.user_id AND sha256=NEW.sha256) THEN RETURN NEW; END IF;
  new_bytes:=octet_length(NEW.raw_text); new_chars:=length(NEW.raw_text);
 END IF;
 SELECT coalesce(sum(original_bytes),0) INTO used_bytes FROM discovery_sources WHERE user_id=NEW.user_id;
 SELECT used_bytes+coalesce(sum(octet_length(raw_text)),0) INTO used_bytes FROM transcripts WHERE user_id=NEW.user_id;
 SELECT coalesce(sum(length(p->>'text')),0) INTO used_chars FROM discovery_sources s CROSS JOIN LATERAL jsonb_array_elements(s.pages) p WHERE s.user_id=NEW.user_id;
 SELECT used_chars+coalesce(sum(length(raw_text)),0) INTO used_chars FROM transcripts WHERE user_id=NEW.user_id;
 IF used_bytes+new_bytes>1073741824 OR used_chars+new_chars>25000000 THEN
  RAISE EXCEPTION 'Workspace storage limit reached (1 GB originals or 25 million text characters). No overage charges apply.' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS source_capacity ON discovery_sources;
CREATE TRIGGER source_capacity BEFORE INSERT ON discovery_sources FOR EACH ROW EXECUTE FUNCTION enforce_account_capacity();
DROP TRIGGER IF EXISTS transcript_capacity ON transcripts;
CREATE TRIGGER transcript_capacity BEFORE INSERT ON transcripts FOR EACH ROW EXECUTE FUNCTION enforce_account_capacity();
DROP TRIGGER IF EXISTS job_capacity ON jobs;
CREATE TRIGGER job_capacity BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION enforce_account_capacity();
