import { NextRequest, NextResponse, after } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ingestFiles, decodeFiles } from "@/lib/ingest";
import { originalStream } from "@/lib/storage";
import {
  query,
  transaction,
  owned,
  AppError,
  id,
  audit,
  assertWritableUser,
  assertReadableUser,
} from "@/lib/db";
import { checkout, portal, reconcile } from "@/lib/billing";
import {
  changePassword,
  revokeSessions,
  deleteAccount,
  accountRateLimit,
} from "@/lib/accounts";
import {
  requireUser,
  currentUser,
  register,
  newSession,
  checkPassword,
  signOut,
  encrypt,
  startDemo,
} from "@/lib/auth";
import { bootstrap } from "@/lib/read";
import { resourcePage, workspaceMetadata } from "@/lib/paging";
import { verifyQuote, fingerprint, optionsValid } from "@/lib/domain";
import { testKey, optionSchema, listModels, credentials } from "@/lib/ai";
import { enqueue } from "@/lib/jobs";
import { providerIds } from "@/lib/providers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const uuid = z.string().uuid();
const text = (max = 500) => z.string().trim().min(1).max(max);
const optionalText = (max = 5000) => z.string().max(max);
async function boundedBody(req: NextRequest) {
  const max = 12 * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max)
    throw new AppError("Request is too large", 413);
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new AppError("Request is too large", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function body(req: NextRequest) {
  const bytes = await boundedBody(req);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AppError("Invalid JSON body");
  }
}
async function invalidateAssessments(user: string) {
  await query(
    `UPDATE assessments a SET confirmed=false WHERE a.user_id=$1 AND a.confirmed AND EXISTS
 (SELECT 1 FROM unnest(a.evidence_ids) AS e(id) LEFT JOIN signals s ON s.id=e.id AND s.user_id=a.user_id
 WHERE s.id IS NULL OR s.review<>'approved' OR NOT s.verified OR s.stage<>'signal' OR s.customer_id<>a.customer_id)`,
    [user],
  );
}
function originCheck(req: NextRequest) {
  if (req.method === "GET") return;
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== process.env.APP_URL
  )
    throw new AppError("Cross-origin request rejected", 403);
}
function versionCheck(record: Record<string, unknown>, version: number) {
  if (record.version !== version)
    throw new AppError(
      "This record changed. Refresh before saving your edits.",
      409,
    );
}
async function validIds(table: string, ids: string[], user: string) {
  for (const value of ids) await owned(table, value, user);
}
async function authRoute(req: NextRequest, route: string, demo: boolean) {
  if (route === "auth/demo" && req.method === "POST") return startDemo(req);
  if (req.method === "GET") return { user: await currentUser(demo) };
  if (route === "auth/logout") {
    await signOut(demo);
    return { ok: true };
  }
  if (demo)
    throw new AppError(
      "The demo workspace is read only. Create your own workspace to make changes.",
      403,
    );
  if (!["auth/login", "auth/register"].includes(route) || req.method !== "POST")
    throw new AppError("Route not found", 404);
  const address = (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown"
  ).slice(0, 256);
  await accountRateLimit("auth-ip:" + address, 100);
  const input = z
    .object({
      email: z.email().max(254),
      password: z.string().min(10).max(128),
      name: text(80).optional(),
    })
    .parse(await body(req));
  const identity = input.email.toLowerCase();
  const attemptIdentity = await accountRateLimit("auth-email:" + identity, 10);
  if (route === "auth/register") {
    try {
      const user = await register(
        identity,
        input.name ?? "Product builder",
        input.password,
      );
      return { id: user };
    } catch (e) {
      if ((e as { code: string }).code === "23505")
        throw new AppError("An account with this email already exists", 409);
      throw e;
    }
  }
  const [user] = await query(
    "SELECT * FROM users WHERE email=$1 AND NOT is_demo",
    [identity],
  );
  if (!user || !checkPassword(input.password, user.password_hash))
    throw new AppError("Email or password is incorrect", 401);
  await newSession(user.id, false, user.password_hash);
  await query("DELETE FROM auth_attempts WHERE identity=$1", [attemptIdentity]);
  return { ok: true };
}
async function ingest(req: NextRequest, user: string) {
  let title = "",
    customer = "",
    files: { name: string; text: string }[] = [];
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const bytes = await boundedBody(req);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": req.headers.get("content-type")! },
    }).formData();
    customer = uuid.parse(form.get("customer_id"));
    title = String(form.get("title") ?? "");
    let total = 0;
    const uploaded = form.getAll("files");
    if (!uploaded.length || uploaded.length > 30)
      throw new AppError("Select between 1 and 30 files");
    for (const value of uploaded) {
      if (!(value instanceof File)) throw new AppError("Invalid upload");
      if (value.size > 10 * 1024 * 1024)
        throw new AppError("Each upload must be smaller than 10 MB");
      const buffer = Buffer.from(await value.arrayBuffer());
      const decoded = decodeFiles(value.name, buffer);
      total += decoded.reduce((n, f) => n + Buffer.byteLength(f.text), 0);
      if (total > 10 * 1024 * 1024)
        throw new AppError("Combined uploads exceed 10 MB");
      files.push(...decoded);
    }
  } else {
    const input = z
      .object({
        title: text(200),
        customer_id: uuid,
        content: z.string().min(5).max(2000000),
      })
      .parse(await body(req));
    title = input.title;
    customer = input.customer_id;
    files = [{ name: title + ".txt", text: input.content }];
  }
  return ingestFiles(user, customer, title, files);
}
const signalInput = z.object({
  title: text(200),
  quote: z.string().min(5).max(5000),
  customer_id: uuid,
  sentiment: z.enum(["for", "against", "neutral"]),
  tier: z.number().int().min(1).max(5),
  kind: z.enum(["gap", "strength"]),
  commitments: z.array(z.enum(["buy", "pilot", "pay"])).max(3),
  source_start: z.number().int().min(0).optional(),
  stage: z.enum(["guess", "signal"]).optional(),
  review: z.enum(["pending", "approved", "dismissed"]).optional(),
});
async function handle(req: NextRequest, parts: string[]) {
  originCheck(req);
  const demo = parts[0] === "demo";
  if (demo) parts = parts.slice(1);
  const route = parts.join("/");
  if (parts[0] === "auth") return authRoute(req, route, demo);
  const identity = await requireUser(demo);
  if (demo && req.method !== "GET")
    throw new AppError(
      "The demo workspace is read only. Create your own workspace to make changes.",
      403,
    );
  const user = identity.id;
  if (["billing", "settings"].includes(parts[0]) && req.method !== "GET")
    await accountRateLimit(parts[0] + ":" + user, 30);
  if (
    identity.deletion_requested_at &&
    route === "flow" &&
    req.method === "GET"
  )
    return {
      user: identity,
      reports: [],
      sources: [],
      settings: { provider: "openai" },
    };
  if (identity.deletion_requested_at && route !== "account/delete")
    throw new AppError(
      "Account deletion is in progress. Retry deletion in Settings or contact support.",
      403,
    );
  if (route === "account/password" && req.method === "POST") {
    const input = z
      .object({
        current_password: z.string().min(1).max(128),
        password: z.string().min(10).max(128),
      })
      .parse(await body(req));
    await changePassword(user, input.current_password, input.password);
    await signOut();
    return { ok: true };
  }
  if (route === "account/sessions" && req.method === "DELETE") {
    await revokeSessions(user);
    await signOut();
    return { ok: true };
  }
  if (route === "account/delete" && req.method === "POST") {
    const input = z
      .object({
        password: z.string().min(1).max(128),
        confirmation: z.literal("DELETE"),
      })
      .parse(await body(req));
    await deleteAccount(user, input.password);
    await signOut();
    return { ok: true };
  }
  if (route === "billing/checkout" && req.method === "POST")
    return checkout(user);
  if (route === "billing/portal" && req.method === "POST") return portal(user);
  if (route === "billing/refresh" && req.method === "POST")
    return reconcile(user);
  if (
    !demo &&
    req.method !== "GET" &&
    parts[0] !== "settings" &&
    parts[0] !== "account"
  )
    await assertWritableUser(user);
  if (
    !demo &&
    req.method === "GET" &&
    !["flow", "settings", "account"].includes(parts[0])
  )
    await assertReadableUser(user);
  if (parts[0] === "library") {
    const { researchApi } = await import("@/lib/research");
    return researchApi(req, parts, user, () => body(req));
  }
  if (["flow", "sources", "reports"].includes(parts[0])) {
    if (
      req.method === "GET" &&
      !demo &&
      (process.env.VERCEL || process.env.JOB_RUNNER === "workflow")
    )
      after(async () => {
        const { recoverJobs } = await import("@/lib/dispatch");
        await recoverJobs(user).catch(() => {});
      });
    const { reportApi } = await import("@/lib/report-api");
    const result = await reportApi(
      req,
      parts,
      user,
      () => body(req),
      () => boundedBody(req),
    );
    return route === "flow" ? { ...result, user: identity } : result;
  }
  if (route === "bootstrap" && req.method === "GET") {
    if (!demo && (process.env.VERCEL || process.env.JOB_RUNNER === "workflow"))
      after(async () => {
        const { recoverJobs } = await import("@/lib/dispatch");
        await recoverJobs(user).catch(() => {});
      });
    if (req.nextUrl.searchParams.has("paged"))
      return { ...(await workspaceMetadata(user)), user: identity };
    const data = { ...(await bootstrap(user)), user: identity };
    if (Buffer.byteLength(JSON.stringify(data)) > 3000000)
      throw new AppError("Use paged bootstrap for this workspace", 413);
    return data;
  }
  if (parts[0] === "workspace" && parts[1] && req.method === "GET")
    return resourcePage(
      user,
      parts[1],
      Number(req.nextUrl.searchParams.get("offset") ?? 0),
      req.nextUrl.searchParams.get("q") ?? "",
    );
  if (route === "export" && req.method === "GET") {
    const data = await bootstrap(user);
    const [
      reports,
      sources,
      reportSources,
      companyAliases,
      documentEdits,
      signalEdits,
      validationWork,
    ] = await Promise.all([
      query("SELECT * FROM discovery_reports WHERE user_id=$1", [user]),
      query(
        "SELECT id,filename,sha256,pages,warnings,role,created_at FROM discovery_sources WHERE user_id=$1",
        [user],
      ),
      query("SELECT * FROM discovery_report_sources WHERE user_id=$1", [user]),
      query("SELECT * FROM research_company_aliases WHERE user_id=$1", [user]),
      query("SELECT * FROM research_document_edits WHERE user_id=$1", [user]),
      query("SELECT * FROM research_signal_edits WHERE user_id=$1", [user]),
      query("SELECT * FROM discovery_validation_work WHERE user_id=$1", [user]),
    ]);
    Object.assign(data, {
      reports,
      sources,
      reportSources,
      companyAliases,
      documentEdits,
      signalEdits,
      validationWork,
    });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (s: string) =>
          controller.enqueue(new TextEncoder().encode(s));
        try {
          send(
            JSON.stringify({ ...data, transcripts: undefined }).slice(0, -1) +
              ',"transcripts":[',
          );
          let offset = 0,
            first = true;
          while (true) {
            const rows = await query(
              "SELECT id,customer_id,title,filename,sha256,raw_text,segments,created_at FROM transcripts WHERE user_id=$1 ORDER BY id LIMIT 1 OFFSET $2",
              [user, offset],
            );
            if (!rows.length) break;
            const serialized = JSON.stringify(rows[0]);
            if (!first) send(",");
            first = false;
            const bytes = new TextEncoder().encode(serialized);
            for (let at = 0; at < bytes.length; at += 16384)
              controller.enqueue(bytes.slice(at, at + 16384));
            offset++;
          }
          send("]}");
          controller.close();
        } catch {
          controller.error(new Error("Export interrupted; retry the download"));
        }
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="evidence-export.json"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (route === "settings/models" && req.method === "POST") {
    const input = z
      .object({
        provider: z.enum(providerIds),
        api_key: z.string().trim().min(8).max(500).optional(),
      })
      .parse(await body(req));
    const key = input.api_key ?? (await credentials(user, input.provider));
    return { models: await listModels(input.provider, key) };
  }
  if (route === "settings" && req.method === "PATCH") {
    const input = z
      .object({
        provider: z.enum(providerIds),
        model: text(120).regex(/^[a-zA-Z0-9._:/-]+$/),
        validation_threshold: z.number().int().min(1).max(100),
        api_key: z.string().trim().min(8).max(500).optional(),
      })
      .parse(await body(req));
    if (input.api_key) {
      await testKey(input.provider, input.api_key);
      await query(
        `UPDATE settings SET ${input.provider}_key=$1 WHERE user_id=$2`,
        [encrypt(input.api_key), user],
      );
    }
    await query(
      "UPDATE settings SET provider=$1,model=$2,validation_threshold=$3,updated_at=now() WHERE user_id=$4",
      [input.provider, input.model, input.validation_threshold, user],
    );
    await audit(user, "AI settings updated", "settings", null, {
      provider: input.provider,
      model: input.model,
    });
    return { ok: true };
  }
  if (parts[0] === "settings" && req.method === "DELETE") {
    const provider = z.enum(providerIds).parse(parts[1]);
    await query(`UPDATE settings SET ${provider}_key=NULL WHERE user_id=$1`, [
      user,
    ]);
    await audit(user, "Provider key removed", "settings", null, { provider });
    return { ok: true };
  }
  if (route === "settings/test" && req.method === "POST") {
    const input = z
      .object({
        provider: z.enum(providerIds),
        api_key: z.string().min(8).max(500),
      })
      .parse(await body(req));
    await testKey(input.provider, input.api_key);
    return { ok: true };
  }
  if (route === "customers" && req.method === "POST") {
    const input = z
      .object({
        name: text(120),
        segment: text(80),
        notes: optionalText().default(""),
      })
      .parse(await body(req));
    const cid = id();
    await query(
      "INSERT INTO customers(id,user_id,name,segment,notes) VALUES($1,$2,$3,$4,$5)",
      [cid, user, input.name, input.segment, input.notes],
    );
    return { id: cid };
  }
  if (parts[0] === "customers" && parts[1] && req.method === "PATCH") {
    const cid = uuid.parse(parts[1]);
    await owned("customers", cid, user);
    const input = z
      .object({ name: text(120), segment: text(80), notes: optionalText() })
      .parse(await body(req));
    await query(
      "UPDATE customers SET name=$1,segment=$2,notes=$3 WHERE id=$4 AND user_id=$5",
      [input.name, input.segment, input.notes, cid, user],
    );
    return { ok: true };
  }
  if (route === "products" && req.method === "POST") {
    const input = z.object({ name: text(120) }).parse(await body(req));
    const pid = id();
    await query("INSERT INTO products(id,user_id,name) VALUES($1,$2,$3)", [
      pid,
      user,
      input.name,
    ]);
    return { id: pid };
  }
  if (route === "transcripts" && req.method === "POST")
    return ingest(req, user);
  if (parts[0] === "transcripts" && parts[1]) {
    const tid = uuid.parse(parts[1]);
    const t = await owned("transcripts", tid, user);
    if (req.method === "GET") {
      if (parts[2] === "download")
        return new NextResponse(
          await originalStream(t.storage_path, t.raw_text),
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": 'attachment; filename="transcript.txt"',
            },
          },
        );
      const total = t.raw_text.length;
      const requested = Number(req.nextUrl.searchParams.get("start") ?? 0);
      if (!Number.isSafeInteger(requested) || requested < 0)
        throw new AppError("Invalid source offset");
      const start = Math.min(requested, Math.max(0, total - 1)),
        end = Math.min(total, start + 20000);
      const { storage_path: _, raw_text, segments, ...safe } = t;
      return {
        ...safe,
        raw_text: raw_text.slice(start, end),
        segments: segments.filter(
          (s: { start: number; end: number }) => s.end > start && s.start < end,
        ),
        source_start: start,
        source_end: end,
        source_total: total,
      };
    }
    if (req.method === "DELETE") {
      await transaction(async (c) => {
        const { rows } = await c.query(
          "SELECT id FROM signals WHERE transcript_id=$1 AND user_id=$2",
          [tid, user],
        );
        const ids = rows.map((s) => s.id);
        await c.query(
          "UPDATE assessments SET confirmed=false,evidence_ids=ARRAY(SELECT unnest(evidence_ids) EXCEPT SELECT unnest($1::uuid[])) WHERE user_id=$2 AND evidence_ids && $1::uuid[]",
          [ids, user],
        );
        await c.query(
          "INSERT INTO storage_deletions(pathname) VALUES($1) ON CONFLICT DO NOTHING",
          [t.storage_path],
        );
        await c.query("DELETE FROM transcripts WHERE id=$1 AND user_id=$2", [
          tid,
          user,
        ]);
      });
      await audit(
        user,
        "Transcript and supporting evidence removed",
        "transcript",
        tid,
      );
      return { ok: true };
    }
    if (parts[2] === "extract" && req.method === "POST")
      return { id: await enqueue(user, "extract", tid) };
  }
  if (route === "signals" && req.method === "POST") {
    const raw = await body(req);
    const input = signalInput.extend({ transcript_id: uuid }).parse(raw);
    const t = await owned("transcripts", input.transcript_id, user);
    await owned("customers", input.customer_id, user);
    const v = verifyQuote(
      t.raw_text,
      input.quote,
      t.segments,
      input.source_start,
    );
    if (input.review === "approved" && !v.verified)
      throw new AppError(v.reason);
    const sid = id();
    await query(
      "INSERT INTO signals(id,user_id,customer_id,transcript_id,source_key,title,quote,source_start,source_end,timestamp,speaker,verified,verification_reason,kind,sentiment,tier,commitments,stage,review,edited) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
      [
        sid,
        user,
        input.customer_id,
        t.id,
        fingerprint(input.quote, input.kind),
        input.title,
        input.quote,
        v.start,
        v.end,
        v.timestamp,
        v.speaker,
        v.verified,
        v.reason,
        input.kind,
        input.sentiment,
        input.tier,
        input.commitments,
        input.review === "approved" ? "signal" : (input.stage ?? "guess"),
        input.review ?? "pending",
        JSON.stringify(
          Object.fromEntries(Object.keys(input).map((k) => [k, true])),
        ),
      ],
    );
    await audit(user, "Signal created", "signal", sid);
    return { id: sid };
  }
  if (route === "signals/bulk" && req.method === "POST") {
    const input = z
      .object({
        ids: z.array(uuid).min(1).max(100),
        action: z.enum(["approve", "dismiss", "reassign"]),
        customer_id: uuid.optional(),
      })
      .parse(await body(req));
    if (input.action === "reassign") {
      if (!input.customer_id) throw new AppError("Select a customer");
      await owned("customers", input.customer_id, user);
    }
    await transaction(async (c) => {
      const { rows } = await c.query(
        "SELECT * FROM signals WHERE id=ANY($1::uuid[]) AND user_id=$2 FOR UPDATE",
        [input.ids, user],
      );
      if (rows.length !== new Set(input.ids).size)
        throw new AppError("Record not found", 404);
      if (input.action === "approve" && rows.some((s) => !s.verified))
        throw new AppError(
          "Every selected quote must be verified before approval",
        );
      if (input.action === "reassign")
        await c.query(
          "UPDATE signals SET customer_id=$1,edited=edited||'{\"customer_id\":true}'::jsonb,version=version+1 WHERE id=ANY($2::uuid[]) AND user_id=$3",
          [input.customer_id, input.ids, user],
        );
      else
        await c.query(
          "UPDATE signals SET review=$1,stage=CASE WHEN $1='approved' THEN 'signal' ELSE stage END,edited=edited||'{\"review\":true,\"stage\":true}'::jsonb,version=version+1 WHERE id=ANY($2::uuid[]) AND user_id=$3",
          [
            input.action === "approve" ? "approved" : "dismissed",
            input.ids,
            user,
          ],
        );
    });
    await invalidateAssessments(user);
    await audit(user, `Signals ${input.action}`, "signal", null, {
      count: input.ids.length,
    });
    return { ok: true };
  }
  if (parts[0] === "signals" && parts[1] && req.method === "PATCH") {
    const sid = uuid.parse(parts[1]);
    const s = await owned("signals", sid, user);
    const input = signalInput
      .extend({ version: z.number().int() })
      .parse(await body(req));
    versionCheck(s, input.version);
    await owned("customers", input.customer_id, user);
    const t = await owned("transcripts", s.transcript_id, user);
    const v = verifyQuote(
      t.raw_text,
      input.quote,
      t.segments,
      input.source_start ?? s.source_start ?? undefined,
    );
    const review = input.review ?? s.review;
    if (review === "approved" && !v.verified) throw new AppError(v.reason);
    const edited = {
      ...s.edited,
      ...Object.fromEntries(
        Object.keys(input)
          .filter((k) => k !== "version")
          .map((k) => [k, true]),
      ),
    };
    const rows = await query(
      "UPDATE signals SET title=$1,quote=$2,customer_id=$3,sentiment=$4,tier=$5,kind=$6,commitments=$7,source_start=$8,source_end=$9,timestamp=$10,speaker=$11,verified=$12,verification_reason=$13,review=$14,stage=$15,edited=$16,version=version+1 WHERE id=$17 AND user_id=$18 AND version=$19 RETURNING id",
      [
        input.title,
        input.quote,
        input.customer_id,
        input.sentiment,
        input.tier,
        input.kind,
        input.commitments,
        v.start,
        v.end,
        v.timestamp,
        v.speaker,
        v.verified,
        v.reason,
        review,
        review === "approved" ? "signal" : (input.stage ?? s.stage),
        JSON.stringify(edited),
        sid,
        user,
        input.version,
      ],
    );
    if (!rows.length)
      throw new AppError("This record changed. Refresh before saving.", 409);
    await invalidateAssessments(user);
    await audit(user, "Signal reviewed", "signal", sid, { review });
    return { ok: true };
  }
  if (route === "features" && req.method === "POST") {
    const input = z
      .object({
        title: text(200),
        description: optionalText().default(""),
        product_id: uuid.nullable().default(null),
        signal_ids: z.array(uuid).max(200).default([]),
      })
      .parse(await body(req));
    if (input.product_id) await owned("products", input.product_id, user);
    await validIds("signals", input.signal_ids, user);
    const fid = id();
    await transaction(async (c) => {
      await c.query(
        "INSERT INTO features(id,user_id,title,description,product_id) VALUES($1,$2,$3,$4,$5)",
        [fid, user, input.title, input.description, input.product_id],
      );
      for (const sid of new Set(input.signal_ids))
        await c.query(
          "INSERT INTO feature_signals(user_id,feature_id,signal_id) VALUES($1,$2,$3)",
          [user, fid, sid],
        );
    });
    await audit(user, "Feature candidate created", "feature", fid);
    return { id: fid };
  }
  if (parts[0] === "features" && parts[1] && req.method === "PATCH") {
    const fid = uuid.parse(parts[1]);
    const f = await owned("features", fid, user);
    const input = z
      .object({
        title: text(200),
        description: optionalText(),
        product_id: uuid.nullable(),
        stage: z.enum(["candidate", "feature"]),
        problem_clear: z.boolean(),
        validation_met: z.boolean(),
        route_chosen: z.boolean(),
        technical_route: optionalText(),
        signal_ids: z.array(uuid).max(200),
        version: z.number().int(),
      })
      .parse(await body(req));
    versionCheck(f, input.version);
    if (input.product_id) await owned("products", input.product_id, user);
    await validIds("signals", input.signal_ids, user);
    const data = await bootstrap(user);
    const linked = data.signals.filter((s) => input.signal_ids.includes(s.id));
    const { rollup } = await import("@/lib/domain");
    const overrides = await query(
      "SELECT customer_id,stance FROM stances WHERE user_id=$1 AND target_type='feature' AND target_id=$2",
      [user, fid],
    );
    const metrics = rollup(
      linked as Parameters<typeof rollup>[0],
      Object.fromEntries(overrides.map((x) => [x.customer_id, x.stance])),
    );
    if (
      input.validation_met &&
      metrics.for < data.settings.validation_threshold
    )
      throw new AppError(
        `Validation needs ${data.settings.validation_threshold} confirmed customers; currently ${metrics.for}`,
      );
    if (input.route_chosen && !input.technical_route.trim())
      throw new AppError("Describe the chosen technical route");
    if (
      input.stage === "feature" &&
      !(input.problem_clear && input.validation_met && input.route_chosen)
    )
      throw new AppError("Complete all readiness checks before promotion");
    await transaction(async (c) => {
      const result = await c.query(
        "UPDATE features SET title=$1,description=$2,product_id=$3,stage=$4,problem_clear=$5,validation_met=$6,route_chosen=$7,technical_route=$8,version=version+1 WHERE id=$9 AND user_id=$10 AND version=$11 RETURNING id",
        [
          input.title,
          input.description,
          input.product_id,
          input.stage,
          input.problem_clear,
          input.validation_met,
          input.route_chosen,
          input.technical_route,
          fid,
          user,
          input.version,
        ],
      );
      if (!result.rowCount)
        throw new AppError("This record changed. Refresh before saving.", 409);
      await c.query(
        "DELETE FROM feature_signals WHERE feature_id=$1 AND user_id=$2",
        [fid, user],
      );
      for (const sid of new Set(input.signal_ids))
        await c.query(
          "INSERT INTO feature_signals(user_id,feature_id,signal_id) VALUES($1,$2,$3)",
          [user, fid, sid],
        );
    });
    await audit(user, "Feature updated", "feature", fid, {
      stage: input.stage,
    });
    return { ok: true };
  }
  if (route === "stances" && req.method === "POST") {
    const input = z
      .object({
        target_type: z.enum(["feature", "brief"]),
        target_id: uuid,
        customer_id: uuid,
        stance: z.enum(["for", "against", "neutral"]),
      })
      .parse(await body(req));
    await owned(
      input.target_type === "feature" ? "features" : "briefs",
      input.target_id,
      user,
    );
    await owned("customers", input.customer_id, user);
    const data = await bootstrap(user);
    const target = (
      input.target_type === "feature" ? data.features : data.briefs
    ).find((x) => x.id === input.target_id)!;
    if (
      !data.signals.some(
        (s) =>
          target.signal_ids.includes(s.id) &&
          s.customer_id === input.customer_id,
      )
    )
      throw new AppError("Customer has no evidence linked to this item");
    await query(
      "INSERT INTO stances(user_id,target_type,target_id,customer_id,stance) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,target_type,target_id,customer_id) DO UPDATE SET stance=EXCLUDED.stance",
      [
        user,
        input.target_type,
        input.target_id,
        input.customer_id,
        input.stance,
      ],
    );
    await audit(
      user,
      "Customer stance confirmed",
      input.target_type,
      input.target_id,
      { customer: input.customer_id, stance: input.stance },
    );
    return { ok: true };
  }
  if (route === "assessments" && req.method === "POST") {
    const input = z
      .object({
        customer_id: uuid,
        problem: text(200),
        level: z.number().int().min(1).max(5).nullable(),
        suggested_level: z
          .number()
          .int()
          .min(1)
          .max(5)
          .nullable()
          .default(null),
        business_purpose: optionalText(),
        constraints: optionalText(),
        buying_authority: optionalText(),
        evidence_ids: z.array(uuid).max(100),
        confirmed: z.boolean(),
      })
      .parse(await body(req));
    await owned("customers", input.customer_id, user);
    await validIds("signals", input.evidence_ids, user);
    if (input.confirmed && !input.evidence_ids.length)
      throw new AppError(
        "Link verified evidence before confirming this assessment",
      );
    if (input.confirmed && !input.level)
      throw new AppError("Choose an awareness level");
    for (const sid of input.evidence_ids) {
      const s = await owned("signals", sid, user);
      if (
        s.customer_id !== input.customer_id ||
        (input.confirmed && (!s.verified || s.review !== "approved"))
      )
        throw new AppError(
          "Assessment evidence must be approved and belong to this customer",
        );
    }
    const aid = id();
    await query(
      "INSERT INTO assessments(id,user_id,customer_id,problem,level,suggested_level,business_purpose,constraints,buying_authority,evidence_ids,confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id,customer_id,problem) DO UPDATE SET level=EXCLUDED.level,suggested_level=EXCLUDED.suggested_level,business_purpose=EXCLUDED.business_purpose,constraints=EXCLUDED.constraints,buying_authority=EXCLUDED.buying_authority,evidence_ids=EXCLUDED.evidence_ids,confirmed=EXCLUDED.confirmed",
      [
        aid,
        user,
        input.customer_id,
        input.problem,
        input.level,
        input.suggested_level,
        input.business_purpose,
        input.constraints,
        input.buying_authority,
        input.evidence_ids,
        input.confirmed,
      ],
    );
    await audit(
      user,
      "Problem awareness assessed",
      "customer",
      input.customer_id,
      {
        problem: input.problem,
        level: input.level,
        confirmed: input.confirmed,
      },
    );
    return { id: aid };
  }
  if (route === "briefs" && req.method === "POST") {
    const input = z
      .object({
        title: text(200),
        feature_ids: z.array(uuid).max(100).default([]),
        signal_ids: z.array(uuid).max(200).default([]),
      })
      .parse(await body(req));
    await validIds("features", input.feature_ids, user);
    await validIds("signals", input.signal_ids, user);
    const bid = id();
    await transaction(async (c) => {
      await c.query("INSERT INTO briefs(id,user_id,title) VALUES($1,$2,$3)", [
        bid,
        user,
        input.title,
      ]);
      for (const fid of new Set(input.feature_ids))
        await c.query(
          "INSERT INTO brief_features(user_id,brief_id,feature_id) VALUES($1,$2,$3)",
          [user, bid, fid],
        );
      for (const sid of new Set(input.signal_ids))
        await c.query(
          "INSERT INTO brief_signals(user_id,brief_id,signal_id) VALUES($1,$2,$3)",
          [user, bid, sid],
        );
    });
    await audit(user, "Decision brief created", "brief", bid);
    return { id: bid };
  }
  if (parts[0] === "briefs" && parts[1]) {
    const bid = uuid.parse(parts[1]);
    const b = await owned("briefs", bid, user);
    if (parts[2] === "draft" && req.method === "POST")
      return { id: await enqueue(user, "brief", bid) };
    if (parts[2] === "accept-draft" && req.method === "POST") {
      if (!b.ai_proposal) throw new AppError("No AI draft is available");
      const p = b.ai_proposal;
      const options = optionsValid(p.options) ? p.options : b.options;
      const values = [
        "ask",
        "problem",
        "audience",
        "capability",
        "impact",
        "options",
      ].map((k) => (b.edited[k] ? b[k] : k === "options" ? options : p[k]));
      await transaction(async (c) => {
        const r = await c.query(
          "UPDATE briefs SET ask=$1,problem=$2,audience=$3,capability=$4,impact=$5,options=$6,ai_proposal=NULL,version=version+1 WHERE id=$7 AND user_id=$8 AND version=$9 RETURNING id",
          [
            ...values.slice(0, 5),
            JSON.stringify(values[5]),
            bid,
            user,
            b.version,
          ],
        );
        if (!r.rowCount)
          throw new AppError(
            "Brief changed. Refresh before accepting this draft.",
            409,
          );
        for (const q of p.unknowns ?? [])
          await c.query(
            "INSERT INTO questions(id,user_id,brief_id,question) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,brief_id,question) DO NOTHING",
            [id(), user, bid, q],
          );
      });
      await audit(
        user,
        "AI draft accepted; human fields preserved",
        "brief",
        bid,
      );
      return { ok: true };
    }
    if (req.method === "PATCH") {
      const input = z
        .object({
          title: text(200),
          ask: optionalText(500),
          problem: optionalText(),
          audience: optionalText(1000),
          capability: optionalText(1000),
          impact: optionalText(1000),
          options: z.array(optionSchema).min(2).max(4),
          status: z.enum([
            "Draft",
            "In Review",
            "Approved",
            "Shelved",
            "Rejected",
          ]),
          review_date: z.iso.date().nullable(),
          revisit_if: optionalText(1000),
          feature_ids: z.array(uuid).max(100),
          signal_ids: z.array(uuid).max(200),
          version: z.number().int(),
        })
        .parse(await body(req));
      versionCheck(b, input.version);
      if (!optionsValid(input.options))
        throw new AppError(
          "Keep both Do nothing and Maintain current approach options",
        );
      await validIds("features", input.feature_ids, user);
      await validIds("signals", input.signal_ids, user);
      const edited = { ...b.edited };
      for (const k of [
        "ask",
        "problem",
        "audience",
        "capability",
        "impact",
        "options",
      ])
        if (!isDeepStrictEqual(input[k as keyof typeof input], b[k]))
          edited[k] = true;
      await transaction(async (c) => {
        const r = await c.query(
          "UPDATE briefs SET title=$1,ask=$2,problem=$3,audience=$4,capability=$5,impact=$6,options=$7,status=$8,review_date=$9,revisit_if=$10,edited=$11,version=version+1 WHERE id=$12 AND user_id=$13 AND version=$14 RETURNING id",
          [
            input.title,
            input.ask,
            input.problem,
            input.audience,
            input.capability,
            input.impact,
            JSON.stringify(input.options),
            input.status,
            input.review_date,
            input.revisit_if,
            JSON.stringify(edited),
            bid,
            user,
            input.version,
          ],
        );
        if (!r.rowCount)
          throw new AppError("This brief changed. Refresh before saving.", 409);
        await c.query(
          "DELETE FROM brief_features WHERE brief_id=$1 AND user_id=$2",
          [bid, user],
        );
        await c.query(
          "DELETE FROM brief_signals WHERE brief_id=$1 AND user_id=$2",
          [bid, user],
        );
        for (const fid of new Set(input.feature_ids))
          await c.query(
            "INSERT INTO brief_features(user_id,brief_id,feature_id) VALUES($1,$2,$3)",
            [user, bid, fid],
          );
        for (const sid of new Set(input.signal_ids))
          await c.query(
            "INSERT INTO brief_signals(user_id,brief_id,signal_id) VALUES($1,$2,$3)",
            [user, bid, sid],
          );
      });
      await audit(
        user,
        b.status !== input.status
          ? `Decision: ${input.status}`
          : "Brief updated",
        "brief",
        bid,
        {
          previous_status: b.status,
          status: input.status,
          revisit_if: input.revisit_if,
        },
      );
      return { ok: true };
    }
  }
  if (route === "questions" && req.method === "POST") {
    const input = z
      .object({ brief_id: uuid.nullable().default(null), question: text(500) })
      .parse(await body(req));
    if (input.brief_id) await owned("briefs", input.brief_id, user);
    const qid = id();
    const rows = await query(
      "INSERT INTO questions(id,user_id,brief_id,question) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,brief_id,question) DO UPDATE SET question=EXCLUDED.question RETURNING id",
      [qid, user, input.brief_id, input.question],
    );
    return { id: rows[0].id };
  }
  if (parts[0] === "questions" && parts[1] && req.method === "PATCH") {
    const qid = uuid.parse(parts[1]);
    await owned("questions", qid, user);
    const input = z
      .object({
        in_guide: z.boolean(),
        status: z.enum(["Open", "Answered"]),
        answer: optionalText(),
      })
      .parse(await body(req));
    if (input.status === "Answered" && !input.answer.trim())
      throw new AppError("Add an answer before marking this question answered");
    await query(
      "UPDATE questions SET in_guide=$1,status=$2,answer=$3 WHERE id=$4 AND user_id=$5",
      [input.in_guide, input.status, input.answer, qid, user],
    );
    return { ok: true };
  }
  if (route === "curation" && req.method === "POST") {
    const input = z
      .object({
        target_type: z.enum(["feature", "signal"]),
        target_id: uuid,
        pinned: z.boolean(),
        hidden: z.boolean(),
      })
      .parse(await body(req));
    await owned(
      input.target_type === "feature" ? "features" : "signals",
      input.target_id,
      user,
    );
    await query(
      "INSERT INTO curation(user_id,target_type,target_id,pinned,hidden) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,target_type,target_id) DO UPDATE SET pinned=EXCLUDED.pinned,hidden=EXCLUDED.hidden",
      [user, input.target_type, input.target_id, input.pinned, input.hidden],
    );
    return { ok: true };
  }
  if (
    parts[0] === "jobs" &&
    parts[1] &&
    parts[2] === "retry" &&
    req.method === "POST"
  ) {
    const jid = uuid.parse(parts[1]);
    const job = await owned("jobs", jid, user);
    if (job.state !== "failed")
      throw new AppError("Only failed jobs can be retried");
    return {
      id: await enqueue(user, job.purpose, job.transcript_id ?? job.brief_id),
    };
  }
  throw new AppError("Route not found", 404);
}
async function routeHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const result = await handle(req, (await context.params).path);
    if (result instanceof Response) return result;
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if ((e as { code: string }).code === "23505")
      return NextResponse.json(
        { error: "This record already exists" },
        { status: 409 },
      );
    console.error(
      "Request failed",
      e instanceof Error ? e.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Request failed. Try again; your saved records are unchanged." },
      { status: 500 },
    );
  }
}
export {
  routeHandler as GET,
  routeHandler as POST,
  routeHandler as PATCH,
  routeHandler as DELETE,
};
