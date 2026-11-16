ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS approved_email text UNIQUE;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS approval_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS beta_invitations_approval_id ON beta_invitations(approval_id);
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS code_hash text;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS code_expires_at timestamptz;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS code_sent_at timestamptz;

UPDATE beta_invitations i SET approved_email=u.email
 FROM users u WHERE i.user_id=u.id AND i.approved_email IS NULL;
DELETE FROM beta_invitations WHERE approved_email IS NULL;
ALTER TABLE beta_invitations ALTER COLUMN approved_email SET NOT NULL;
ALTER TABLE beta_invitations DROP CONSTRAINT IF EXISTS beta_invitations_user_id_fkey;
ALTER TABLE beta_invitations ADD CONSTRAINT beta_invitations_user_id_fkey
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE beta_invitations DROP COLUMN IF EXISTS token_hash;
