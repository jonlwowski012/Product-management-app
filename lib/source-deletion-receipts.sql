ALTER TABLE storage_deletions ADD COLUMN IF NOT EXISTS source_deletion_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE storage_deletions SET source_deletion_ids=array_append(source_deletion_ids,source_deletion_id)
 WHERE source_deletion_id IS NOT NULL AND NOT source_deletion_ids @> ARRAY[source_deletion_id];
CREATE INDEX IF NOT EXISTS storage_deletions_source_receipts ON storage_deletions USING gin(source_deletion_ids);
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS draft_evidence_ids uuid[] NOT NULL DEFAULT '{}';
WITH linked AS (
 SELECT user_id,brief_id,signal_id FROM brief_signals
 UNION
 SELECT bf.user_id,bf.brief_id,fs.signal_id FROM brief_features bf
 JOIN feature_signals fs ON fs.user_id=bf.user_id AND fs.feature_id=bf.feature_id
), evidence AS (
 SELECT user_id,brief_id,array_agg(signal_id) AS ids FROM linked GROUP BY user_id,brief_id
)
UPDATE briefs b SET draft_evidence_ids=ARRAY(SELECT DISTINCT unnest(b.draft_evidence_ids || e.ids))
 FROM evidence e WHERE b.user_id=e.user_id AND b.id=e.brief_id AND (
   b.ai_proposal IS NOT NULL OR EXISTS(SELECT 1 FROM audit a WHERE a.user_id=b.user_id
     AND a.entity_type='brief' AND a.entity_id=b.id AND a.action='AI draft accepted; human fields preserved')
 );
ALTER TABLE upload_reservations ADD COLUMN IF NOT EXISTS source_hashes text[];
ALTER TABLE upload_reservations ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
ALTER TABLE upload_reservations ADD COLUMN IF NOT EXISTS processing_token uuid;
CREATE INDEX IF NOT EXISTS audit_source_deletions_by_owner ON audit(user_id,created_at) WHERE action='source.deleted';
