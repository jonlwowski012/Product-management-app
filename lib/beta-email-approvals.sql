ALTER TABLE users ADD COLUMN IF NOT EXISTS beta_export_until timestamptz;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS approved_email text UNIQUE;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS approval_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS beta_invitations_approval_id ON beta_invitations(approval_id);
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS code_hash text;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS code_expires_at timestamptz;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS code_sent_at timestamptz;

CREATE OR REPLACE FUNCTION delete_claimed_beta_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM beta_invitations WHERE user_id=OLD.id AND approved_email IS NOT NULL;
 RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS delete_claimed_beta_approval ON users;
CREATE TRIGGER delete_claimed_beta_approval BEFORE DELETE ON users FOR EACH ROW
 EXECUTE FUNCTION delete_claimed_beta_approval();
