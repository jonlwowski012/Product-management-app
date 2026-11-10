import { z } from "zod";
import type pg from "pg";
import type { NextRequest } from "next/server";
import { query, transaction, AppError, id, assertWritableUser } from "./db";
import {
  buildResearch,
  documentLabels,
  nameKey,
  researchThemes,
  type Company,
} from "./research-model";
import type { DiscoverySource } from "./opportunities";

export async function ensureResearchCompanies(
  c: pg.PoolClient,
  user: string,
  sources: DiscoverySource[],
  findings: { source_id: string; origin: string }[],
) {
  const customerSources = new Set(
    findings.filter((f) => f.origin === "customer").map((f) => f.source_id),
  );
  const names = new Map<string, string>();
  for (const source of sources) {
    if (source.role === "context" || !customerSources.has(source.id)) continue;
    const { company } = documentLabels(
      source.pages[0]?.text.slice(0, 4000) ?? "",
    );
    if (company) names.set(nameKey(company), company);
  }
  for (const name of names.values()) await companyByName(c, user, name);
}
async function companyByName(c: pg.PoolClient, user: string, name: string) {
  const key = nameKey(name);
  // Serialize automatic suggestions and manual creation for this account.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    user + ":companies",
  ]);
  const { rows: found } = await c.query(
    `SELECT c.* FROM customers c LEFT JOIN research_company_aliases a ON a.company_id=c.id AND a.user_id=c.user_id
     WHERE c.user_id=$1 AND (a.name_key=$2 OR lower(regexp_replace(trim(c.name),'\\s+',' ','g'))=$2) ORDER BY c.id LIMIT 1`,
    [user, key],
  );
  let company = found[0];
  if (company?.merged_into) {
    const { rows } = await c.query(
      "SELECT * FROM customers WHERE id=$1 AND user_id=$2",
      [company.merged_into, user],
    );
    company = rows[0];
  }
  if (!company) {
    const { rows } = await c.query(
      "INSERT INTO customers(id,user_id,name,segment) VALUES($1,$2,$3,'') RETURNING *",
      [id(), user, name.trim()],
    );
    company = rows[0];
  }
  await c.query(
    "INSERT INTO research_company_aliases(user_id,name_key,company_id) VALUES($1,$2,$3) ON CONFLICT(user_id,name_key) DO NOTHING",
    [user, key, company.id],
  );
  return company;
}
export async function loadResearch(user: string) {
  const results = await Promise.all([
    query<Company>(
      "SELECT id,name,merged_into,research_version FROM customers WHERE user_id=$1",
      [user],
    ),
    query(
      "SELECT name_key,company_id FROM research_company_aliases WHERE user_id=$1",
      [user],
    ),
    query(
      `SELECT s.id,s.sha256 AS fingerprint,'source' AS kind,s.filename,s.created_at::text,left(s.pages->0->>'text',4000) AS header,
      coalesce((SELECT rs.role FROM discovery_report_sources rs JOIN discovery_reports r ON r.id=rs.report_id AND r.user_id=rs.user_id
      WHERE rs.source_id=s.id AND rs.user_id=$1 AND r.result IS NOT NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 1),s.role) AS role
      FROM discovery_sources s WHERE s.user_id=$1`,
      [user],
    ),
    query(
      `SELECT t.id,t.fingerprint,'transcript' AS kind,t.title AS filename,t.created_at::text,left(t.raw_text,4000) AS header,'customer' AS role,t.customer_id,
      (SELECT s.id FROM discovery_sources s WHERE s.user_id=$1 AND s.sha256=t.fingerprint ORDER BY s.created_at,s.id LIMIT 1) AS discovery_source_id
      FROM (SELECT *,encode(sha256(convert_to(replace(encode(convert_to(raw_text,'UTF8'),'base64'),E'\\n',''),'UTF8')),'hex') AS fingerprint FROM transcripts WHERE user_id=$1) t`,
      [user],
    ),
    query(
      `WITH source_jobs AS (
      SELECT DISTINCT j.id,j.created_at,p->>'source_id' AS source_id FROM jobs j
      JOIN job_chunks c ON c.job_id=j.id CROSS JOIN LATERAL jsonb_array_elements(c.input) p
      WHERE j.user_id=$1 AND j.purpose='analyze' AND j.state='succeeded'
    ), latest AS (SELECT DISTINCT ON(source_id) * FROM source_jobs ORDER BY source_id,created_at DESC,id DESC),
    extracted AS (
      SELECT l.source_id::uuid AS source_id,l.created_at::text,
      coalesce((SELECT jsonb_agg(f) FROM job_chunks c CROSS JOIN LATERAL jsonb_array_elements(c.candidates) f
       WHERE c.job_id=l.id AND f->>'source_id'=l.source_id),'[]'::jsonb) AS findings,true AS extracted FROM latest l
    ), saved AS (
      SELECT DISTINCT ON(rs.source_id) rs.source_id,r.created_at::text,
      coalesce((SELECT jsonb_agg(f) FROM jsonb_array_elements(r.result->'findings') f WHERE f->>'source_id'=rs.source_id::text),'[]'::jsonb) AS findings,false AS extracted
      FROM discovery_report_sources rs JOIN discovery_reports r ON r.id=rs.report_id AND r.user_id=rs.user_id
      WHERE rs.user_id=$1 AND r.result IS NOT NULL ORDER BY rs.source_id,r.created_at DESC,r.id DESC
    ) SELECT * FROM extracted UNION ALL SELECT * FROM saved WHERE source_id NOT IN(SELECT source_id FROM extracted)`,
      [user],
    ),
    query(
      `SELECT s.id,s.transcript_id,s.quote,s.source_start,s.title,s.sentiment,s.timestamp,s.verified,s.review,s.created_at::text,
      (SELECT f.title FROM feature_signals fs JOIN features f ON f.id=fs.feature_id AND f.user_id=fs.user_id WHERE fs.signal_id=s.id AND fs.user_id=$1 ORDER BY f.id LIMIT 1) AS theme
      FROM signals s WHERE s.user_id=$1`,
      [user],
    ),
    query(
      "SELECT *,meeting_date::text FROM research_document_edits WHERE user_id=$1",
      [user],
    ),
    query("SELECT * FROM research_signal_edits WHERE user_id=$1", [user]),
    query<{ problem: string; theme: string }>(
      `SELECT f->>'problem' AS problem,o->>'title' AS theme FROM discovery_reports r
      CROSS JOIN LATERAL jsonb_array_elements(r.result->'opportunities') WITH ORDINALITY AS opportunities(o,ord)
      CROSS JOIN LATERAL jsonb_array_elements(r.result->'findings') f
      WHERE r.user_id=$1 AND ((o->'supporting_ids') ? (f->>'id') OR (o->'opposing_ids') ? (f->>'id') OR (o->'risk_ids') ? (f->>'id') OR (o->'context_ids') ? (f->>'id'))
      ORDER BY r.created_at,r.id,opportunities.ord`,
      [user],
    ),
  ]);
  return buildResearch({
    companies: results[0],
    aliases: results[1] as any,
    sources: results[2] as any,
    transcripts: results[3] as any,
    findings: results[4] as any,
    legacySignals: results[5],
    documentEdits: results[6],
    signalEdits: results[7],
    themeLabels: results[8],
  });
}
const companyName = z.string().trim().min(1).max(120);
const version = z.number().int().min(0);
const kindSchema = z.enum(["source", "transcript"]);
export async function researchApi(
  req: NextRequest,
  parts: string[],
  user: string,
  body: () => Promise<unknown>,
) {
  if (req.method === "GET" && parts[1] === "options") {
    const q = nameKey(req.nextUrl.searchParams.get("q") ?? "");
    const items = await query(
      "SELECT id,name FROM customers WHERE user_id=$1 AND merged_into IS NULL AND position($2 in lower(name))>0 ORDER BY name,id LIMIT 50",
      [user, q],
    );
    return { items };
  }
  const data = await loadResearch(user);
  const documents = data.conversations.map((d) => ({
    ...d,
    company_name: data.choices.find((c) => c.id === d.company_id)?.name ?? "",
  }));
  const search = req.nextUrl.searchParams;
  const offset = Number(search.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new AppError("Invalid page");
  const page = <T>(items: T[], extra = {}) => ({
    items: items.slice(offset, offset + 50),
    total: items.length,
    next: offset + 50 < items.length ? offset + 50 : null,
    ...extra,
  });
  const q = nameKey(search.get("q") ?? "");
  if (req.method === "GET") {
    if (parts[1] === "companies") {
      if (parts[2]) {
        const cid = z.uuid().parse(parts[2]);
        const resolved = data.root(cid);
        if (!resolved) throw new AppError("Company not found", 404);
        if (resolved !== cid) return { merged_into: resolved };
        const company =
          data.companies.find((c) => c.id === cid) ??
          data.choices.find((c) => c.id === cid);
        const conversations = documents
          .filter((d) =>
            data.companyDocuments.get(cid)?.has(d.kind + "/" + d.id),
          )
          .sort(
            (a, b) =>
              (b.meeting_date ?? "").localeCompare(a.meeting_date ?? "") ||
              b.created_at.localeCompare(a.created_at),
          );
        return page(conversations, {
          company,
          themes: researchThemes(
            data.signals.filter((s) => s.company_id === cid),
          ).slice(0, 5),
        });
      }
      return page(
        data.companies.filter((c) => nameKey(c.name).includes(q)),
        {
          needs_company: data.conversations.filter((d) => d.needs_company)
            .length,
        },
      );
    }
    if (parts[1] === "documents")
      return page(
        documents.filter(
          (d) => d.needs_company && nameKey(d.filename).includes(q),
        ),
      );
    if (parts[1] === "signals") {
      const cid = search.get("company");
      if (cid && !data.root(cid)) throw new AppError("Company not found", 404);
      const signals = data.signals.filter(
        (s) =>
          (!cid || s.company_id === data.root(cid)) &&
          (search.get("hidden") === "1" || !s.hidden),
      );
      if (search.get("view") !== "all")
        return page(
          researchThemes(signals).filter((t) => nameKey(t.name).includes(q)),
          {
            company:
              data.choices.find((c) => c.id === data.root(cid))?.name ?? null,
          },
        );
      const theme = search.get("theme");
      return page(
        signals
          .filter(
            (s) =>
              (!theme || nameKey(s.theme) === nameKey(theme)) &&
              nameKey(
                [
                  s.problem,
                  s.quote,
                  s.filename,
                  s.theme,
                  data.choices.find((c) => c.id === s.company_id)?.name ?? "",
                ].join(" "),
              ).includes(q),
          )
          .map((s) => ({
            ...s,
            company:
              data.choices.find((c) => c.id === s.company_id)?.name ?? null,
          })),
        {
          company:
            data.choices.find((c) => c.id === data.root(cid))?.name ?? null,
        },
      );
    }
    throw new AppError("Page not found", 404);
  }
  await assertWritableUser(user);
  if (parts[1] === "companies" && parts[2]) {
    const cid = z.uuid().parse(parts[2]);
    if (!data.choices.some((c) => c.id === cid))
      throw new AppError("Company not found", 404);
    if (parts[3] === "merge" && req.method === "POST") {
      const input = z
        .object({ target_id: z.uuid(), version })
        .parse(await body());
      if (input.target_id === cid) throw new AppError("Choose another company");
      await transaction(async (c) => {
        await assertWritableUser(user, c);
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          user + ":companies",
        ]);
        const { rows } = await c.query(
          "SELECT * FROM customers WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
          [user, [cid, input.target_id]],
        );
        const source = rows.find((r) => r.id === cid),
          target = rows.find((r) => r.id === input.target_id);
        if (!source || !target) throw new AppError("Company not found", 404);
        if (
          source.merged_into ||
          target.merged_into ||
          source.research_version !== input.version
        )
          throw new AppError("Company changed. Refresh before merging.", 409);
        await c.query(
          "UPDATE customers SET merged_into=$1,research_version=research_version+1 WHERE user_id=$2 AND (id=$3 OR merged_into=$3)",
          [target.id, user, cid],
        );
      });
      return { id: input.target_id };
    }
    if (req.method === "PATCH") {
      const input = z
        .object({ name: companyName, version })
        .parse(await body());
      await transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          user + ":companies",
        ]);
        const { rows: existing } = await c.query(
          "SELECT id,true AS name_match FROM customers WHERE user_id=$1 AND lower(regexp_replace(trim(name),'\\s+',' ','g'))=$2 AND id<>$3 UNION SELECT company_id AS id,false AS name_match FROM research_company_aliases WHERE user_id=$1 AND name_key=$2 AND company_id<>$3",
          [user, nameKey(input.name), cid],
        );
        if (existing.some((r) => data.root(r.id) !== cid || r.name_match))
          throw new AppError(
            "That company name is already in use. Choose another name.",
            409,
          );
        const { rows } = await c.query(
          "UPDATE customers SET name=$1,research_version=research_version+1 WHERE id=$2 AND user_id=$3 AND research_version=$4 AND merged_into IS NULL RETURNING *",
          [input.name, cid, user, input.version],
        );
        if (!rows.length)
          throw new AppError("Company changed. Refresh before saving.", 409);
        const old = data.choices.find((r) => r.id === cid)!;
        for (const name of [old.name, input.name])
          await c.query(
            "INSERT INTO research_company_aliases(user_id,name_key,company_id) VALUES($1,$2,$3) ON CONFLICT(user_id,name_key) DO NOTHING",
            [user, nameKey(name), cid],
          );
      });
      return { ok: true };
    }
  }
  if (
    parts[1] === "documents" &&
    parts[2] &&
    parts[3] &&
    req.method === "PATCH"
  ) {
    const kind = kindSchema.parse(parts[2]),
      documentId = z.uuid().parse(parts[3]);
    if (!data.conversations.some((d) => d.id === documentId && d.kind === kind))
      throw new AppError("Conversation not found", 404);
    const input = z
      .object({
        company_name: z.string().trim().max(120),
        meeting_date: z.iso.date().nullable(),
        version,
      })
      .parse(await body());
    await transaction(async (c) => {
      const company = input.company_name
        ? await companyByName(c, user, input.company_name)
        : null;
      const col = kind === "source" ? "source_id" : "transcript_id";
      const result =
        input.version === 0
          ? await c.query(
              `INSERT INTO research_document_edits(user_id,${col},company_id,meeting_date) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING version`,
              [user, documentId, company?.id ?? null, input.meeting_date],
            )
          : await c.query(
              `UPDATE research_document_edits SET company_id=$1,meeting_date=$2,version=version+1 WHERE user_id=$3 AND ${col}=$4 AND version=$5 RETURNING version`,
              [
                company?.id ?? null,
                input.meeting_date,
                user,
                documentId,
                input.version,
              ],
            );
      if (!result.rowCount)
        throw new AppError("Conversation changed. Refresh before saving.", 409);
    });
    return { ok: true };
  }
  if (parts[1] === "signals" && parts[2] && req.method === "PATCH") {
    const skey = z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(parts[2]);
    if (!data.signals.some((s) => s.key === skey))
      throw new AppError("Signal not found", 404);
    const input = z
      .object({
        version,
        theme: z.string().trim().min(1).max(300).optional(),
        company_name: z.string().trim().max(120).optional(),
        hidden: z.boolean().optional(),
      })
      .parse(await body());
    await transaction(async (c) => {
      const company = input.company_name
        ? await companyByName(c, user, input.company_name)
        : null;
      const { rows } = await c.query(
        "SELECT * FROM research_signal_edits WHERE user_id=$1 AND signal_key=$2 FOR UPDATE",
        [user, skey],
      );
      const old = rows[0];
      if ((old?.version ?? 0) !== input.version)
        throw new AppError("Signal changed. Refresh before saving.", 409);
      const values = [
        user,
        skey,
        input.company_name === undefined
          ? (old?.company_id ?? null)
          : (company?.id ?? null),
        input.company_name === undefined
          ? (old?.company_override ?? false)
          : true,
        input.theme ?? old?.theme ?? null,
        input.hidden ?? old?.hidden ?? false,
      ];
      if (old)
        await c.query(
          "UPDATE research_signal_edits SET company_id=$3,company_override=$4,theme=$5,hidden=$6,version=version+1 WHERE user_id=$1 AND signal_key=$2",
          values,
        );
      else {
        const inserted = await c.query(
          "INSERT INTO research_signal_edits(user_id,signal_key,company_id,company_override,theme,hidden) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING version",
          values,
        );
        if (!inserted.rowCount)
          throw new AppError("Signal changed. Refresh before saving.", 409);
      }
    });
    return { ok: true };
  }
  throw new AppError("Page not found", 404);
}
