import { blobEnabled } from "./storage";
import { query, AppError } from "./db";
export const resources: Record<
  string,
  { table: string; columns: string; order: string }
> = {
  customers: { table: "customers", columns: "*", order: "id" },
  products: { table: "products", columns: "*", order: "id" },
  transcripts: {
    table: "transcripts",
    columns: "id,customer_id,title,filename,sha256,created_at",
    order: "created_at DESC,id",
  },
  signals: { table: "signals", columns: "*", order: "created_at DESC,id" },
  features: { table: "features", columns: "*", order: "created_at DESC,id" },
  briefs: { table: "briefs", columns: "*", order: "created_at DESC,id" },
  assessments: {
    table: "assessments",
    columns: "*",
    order: "created_at DESC,id",
  },
  questions: { table: "questions", columns: "*", order: "created_at,id" },
  featureSignals: {
    table: "feature_signals",
    columns: "*",
    order: "feature_id,signal_id",
  },
  briefFeatures: {
    table: "brief_features",
    columns: "*",
    order: "brief_id,feature_id",
  },
  briefSignals: {
    table: "brief_signals",
    columns: "*",
    order: "brief_id,signal_id",
  },
  curation: { table: "curation", columns: "*", order: "target_type,target_id" },
  stances: {
    table: "stances",
    columns: "*",
    order: "target_type,target_id,customer_id",
  },
};
export async function resourcePage(
  user: string,
  resource: string,
  offset = 0,
  search = "",
) {
  const spec = Object.hasOwn(resources, resource) ? resources[resource] : null;
  if (!spec || !Number.isSafeInteger(offset) || offset < 0)
    throw new AppError("Invalid page");
  const searchable = [
    "customers",
    "products",
    "features",
    "briefs",
    "transcripts",
    "signals",
  ].includes(resource);
  if (search && !searchable)
    throw new AppError("This collection cannot be searched");
  const field = ["customers", "products"].includes(resource) ? "name" : "title";
  const params: unknown[] = [user, offset];
  const where = search ? ` AND ${field} ILIKE $3` : "";
  if (search)
    params.push("%" + search.slice(0, 200).replace(/[\\%_]/g, "\\$&") + "%");
  const rows = await query(
    `SELECT ${spec.columns} FROM ${spec.table} WHERE user_id=$1${where} ORDER BY ${spec.order} LIMIT 51 OFFSET $2`,
    params,
  );
  const items = [];
  let bytes = 0;
  for (const row of rows.slice(0, 50)) {
    const size = Buffer.byteLength(JSON.stringify(row));
    if (items.length && bytes + size > 256000) break;
    items.push(row);
    bytes += size;
  }
  return {
    items,
    next: rows.length > items.length ? offset + items.length : null,
  };
}
export async function workspaceMetadata(user: string) {
  const [settings, jobs, audit] = await Promise.all([
    query(
      "SELECT provider,model,validation_threshold,openai_key IS NOT NULL AS has_openai_key,anthropic_key IS NOT NULL AS has_anthropic_key,groq_key IS NOT NULL AS has_groq_key,gemini_key IS NOT NULL AS has_gemini_key FROM settings WHERE user_id=$1",
      [user],
    ),
    query(
      "SELECT id,transcript_id,brief_id,report_id,purpose,provider,model,prompt_version,source_hash,state,attempts,error,usage,created_at,finished_at FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [user],
    ),
    query(
      "SELECT * FROM audit WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80",
      [user],
    ),
  ]);
  return {
    settings,
    jobs,
    audit,
    collections: Object.keys(resources),
    uploadMode: blobEnabled() ? "blob" : "local",
  };
}
