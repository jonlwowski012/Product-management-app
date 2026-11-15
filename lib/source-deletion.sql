ALTER TABLE storage_deletions ADD COLUMN IF NOT EXISTS source_deletion_id uuid;
CREATE INDEX IF NOT EXISTS storage_deletions_source_receipt
 ON storage_deletions(source_deletion_id) WHERE source_deletion_id IS NOT NULL;
