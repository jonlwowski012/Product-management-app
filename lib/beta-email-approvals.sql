ALTER TABLE users ADD COLUMN IF NOT EXISTS beta_export_until timestamptz;
ALTER TABLE beta_invitations ADD COLUMN IF NOT EXISTS approval_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS beta_invitations_approval_id ON beta_invitations(approval_id);
