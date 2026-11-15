import "dotenv/config";
import pg from "pg";
import { pool, query } from "../lib/db";
import { deleteDiscoverySource } from "../lib/source-deletion";
import { cleanStorage } from "../lib/storage";

async function replay() {
  const ledgerUrl = process.env.DELETION_LEDGER_DATABASE_URL;
  const restoredUrl = process.env.DATABASE_URL;
  if (!ledgerUrl || !restoredUrl || process.argv[2] !== "--isolated-restore")
    throw new Error(
      "Specify the deletion ledger and an isolated restored database.",
    );
  const identity = (url: string) => {
    const database = new URL(url);
    return database.host.replace("-pooler.", ".") + database.pathname;
  };
  if (identity(ledgerUrl) === identity(restoredUrl))
    throw new Error(
      "The restore and the deletion ledger must be different databases.",
    );

  const ledger = new pg.Client({ connectionString: ledgerUrl });
  await ledger.connect();
  try {
    await ledger.query("BEGIN READ ONLY");
    const {
      rows: [source],
    } = await ledger.query(
      "SELECT name FROM deployment_environment WHERE singleton=true",
    );
    const [target] = await query(
      "SELECT name FROM deployment_environment WHERE singleton=true",
    );
    if (!source?.name || source.name !== target?.name)
      throw new Error(
        "The restore and ledger must belong to the same environment.",
      );
    const { rows: receipts } = await ledger.query(
      "SELECT DISTINCT user_id,entity_id FROM audit WHERE entity_id IS NOT NULL AND ((action='source.deleted' AND entity_type='source') OR (action='Transcript and supporting evidence removed' AND entity_type='transcript'))",
    );
    let removed = 0;
    for (const receipt of receipts) {
      const [exists] = await query(
        "SELECT 1 FROM discovery_sources WHERE user_id=$1 AND id=$2 UNION ALL SELECT 1 FROM transcripts WHERE user_id=$1 AND id=$2",
        [receipt.user_id, receipt.entity_id],
      );
      if (!exists) continue;
      await deleteDiscoverySource(receipt.user_id, receipt.entity_id, null);
      removed++;
    }
    // The database is offline during replay, so each rerun can attempt cleanup immediately.
    await query(
      "UPDATE storage_deletions SET not_before=now() WHERE cardinality(source_deletion_ids)>0 AND attempts>0",
    );
    const pendingReceipts = await query(
      "SELECT DISTINCT unnest(source_deletion_ids) AS source_deletion_id FROM storage_deletions",
    );
    for (const { source_deletion_id } of pendingReceipts)
      while ((await cleanStorage(source_deletion_id)) === 50) {}
    const [pending] = await query(
      "SELECT 1 FROM storage_deletions WHERE cardinality(source_deletion_ids)>0 LIMIT 1",
    );
    if (pending) throw new Error("Restore file cleanup is incomplete.");
    console.log(
      `Reapplied ${removed} transcript deletions before restoring access.`,
    );
  } finally {
    await ledger.end();
  }
}

try {
  await replay();
} catch {
  console.error(
    "Transcript deletion replay did not complete. Keep the restored database offline.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
