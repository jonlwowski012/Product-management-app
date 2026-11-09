import pg from "pg";
import { seedDemoReport } from "./demo-report";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { parseTranscript, verifyQuote, fingerprint } from "./domain";
import {
  demoConversations,
  demoCustomers,
  demoProducts,
  demoFeatures,
  demoBriefs,
  demoOptions,
  demoTranscript,
} from "./demo-data";
import {
  DEMO_USER_ID,
  DEMO_EMAIL,
  DEMO_VERSION,
  demoId,
} from "./demo-constants";
export async function seedDemo(
  connectionString = process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL,
) {
  if (!connectionString)
    throw new Error("Set a database connection before seeding the demo");
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query("SELECT pg_advisory_lock(822741931)");
    const { rows: identities } = await db.query(
      "SELECT id,is_demo FROM users WHERE id=$1 OR email=$2 OR is_demo",
      [DEMO_USER_ID, DEMO_EMAIL],
    );
    if (identities.some((u) => u.id !== DEMO_USER_ID || !u.is_demo))
      throw new Error(
        "Demo identity conflicts with an existing account; no records were changed",
      );
    const {
      rows: [existing],
    } = await db.query("SELECT version FROM demo_dataset WHERE user_id=$1", [
      DEMO_USER_ID,
    ]);
    if (existing?.version === DEMO_VERSION) {
      await db.query("BEGIN");
      try {
        await seedDemoReport(db);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
      return { version: DEMO_VERSION, changed: false };
    }
    const { rows: oldSources } = await db.query(
      "SELECT storage_path FROM transcripts WHERE user_id=$1",
      [DEMO_USER_ID],
    );
    const originals: {
      id: string;
      raw: string;
      hash: string;
      storage: string;
      intent: string;
    }[] = [];
    for (let i = 0; i < demoConversations.length; i++) {
      const id = demoId(200 + i),
        raw = demoTranscript(i);
      const hash = createHash("sha256").update(raw).digest("hex");
      const relative = `demo/${DEMO_VERSION}/${id}-${hash}.txt`;
      const cloud = !!process.env.BLOB_READ_WRITE_TOKEN;
      if (process.env.VERCEL && !cloud)
        throw new Error("The hosted demo requires private Blob storage");
      const filename = path.resolve(process.env.DATA_DIR ?? ".data", relative);
      const intent = cloud ? "blob:" + relative : filename;
      await db.query(
        "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT DO NOTHING",
        [intent],
      );
      let storage: string;
      if (cloud) {
        const blob = await put(relative, raw, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "text/plain; charset=utf-8",
        });
        storage = "blob:" + blob.url;
      } else {
        await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        await writeFile(filename, raw, { mode: 0o600 });
        storage = filename;
      }
      originals.push({ id, raw, hash, storage, intent });
    }
    await db.query("BEGIN");
    try {
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,is_demo) VALUES($1,$2,'HarborOps demo', $3, true) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name",
        [DEMO_USER_ID, DEMO_EMAIL, randomBytes(64).toString("hex")],
      );
      for (const table of [
        "discovery_reports",
        "discovery_sources",
        "stances",
        "curation",
        "audit",
        "questions",
        "assessments",
        "jobs",
        "briefs",
        "features",
        "signals",
        "transcripts",
        "customers",
        "products",
      ])
        await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [DEMO_USER_ID]);
      await db.query(
        "INSERT INTO settings(user_id,provider,model,validation_threshold) VALUES($1,'openai','prerecorded-example',3) ON CONFLICT(user_id) DO UPDATE SET provider='openai',model='prerecorded-example',validation_threshold=3,openai_key=NULL,anthropic_key=NULL,groq_key=NULL,gemini_key=NULL",
        [DEMO_USER_ID],
      );
      for (let i = 0; i < demoProducts.length; i++)
        await db.query(
          "INSERT INTO products(id,user_id,name) VALUES($1,$2,$3)",
          [demoId(10 + i), DEMO_USER_ID, demoProducts[i]],
        );
      for (let i = 0; i < demoCustomers.length; i++) {
        const [name, segment, contact, note] = demoCustomers[i];
        await db.query(
          "INSERT INTO customers(id,user_id,name,segment,notes) VALUES($1,$2,$3,$4,$5)",
          [
            demoId(100 + i),
            DEMO_USER_ID,
            name,
            segment,
            `Fictional customer. ${contact}. ${note}`,
          ],
        );
      }
      for (let i = 0; i < demoFeatures.length; i++) {
        const f = demoFeatures[i];
        await db.query(
          "INSERT INTO features(id,user_id,title,description,product_id,stage,problem_clear,validation_met,route_chosen,technical_route) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            demoId(400 + i),
            DEMO_USER_ID,
            f.title,
            f.description,
            demoId(10 + f.product),
            i === 0 ? "feature" : "candidate",
            i !== 7,
            [0, 1, 3].includes(i),
            i === 0,
            i === 0
              ? "Append-only approval events with scoped search and controlled exports. Retention policy requires review."
              : "",
          ],
        );
      }
      let signalIndex = 0;
      const accepted: { id: string; customer: number; feature: number }[] = [];
      for (let i = 0; i < demoConversations.length; i++) {
        const t = demoConversations[i],
          original = originals[i],
          segments = parseTranscript(original.raw);
        const date = `2026-10-${String(i + 1).padStart(2, "0")}T14:00:00Z`;
        await db.query(
          "INSERT INTO transcripts(id,user_id,customer_id,title,filename,sha256,raw_text,segments,storage_path,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            original.id,
            DEMO_USER_ID,
            demoId(100 + t.customer),
            t.title,
            `demo-conversation-${i + 1}.txt`,
            original.hash,
            original.raw,
            JSON.stringify(segments),
            original.storage,
            date,
          ],
        );
        for (const statement of t.statements) {
          const id = demoId(300 + signalIndex++),
            kind = statement.kind ?? "gap";
          const verification = verifyQuote(
            original.raw,
            statement.quote,
            segments,
          );
          if (!statement.unverified && !verification.verified)
            throw new Error("Demo quote verification failed");
          const review = statement.review ?? "approved",
            tier = statement.tier ?? 2;
          const proposal = {
            title: statement.humanEdited
              ? "Audit history needed"
              : statement.title,
            quote: statement.quote,
            kind,
            sentiment: statement.sentiment ?? "for",
            tier,
            commitments: statement.commitments ?? [],
            awareness: statement.commitments?.includes("pay") ? 5 : null,
            business_purpose:
              "Illustrative discovery context; confirm with the customer.",
            constraints: "",
            buying_authority: "Requires human confirmation",
            suggested_feature: demoFeatures[statement.feature].title,
          };
          await db.query(
            "INSERT INTO signals(id,user_id,customer_id,transcript_id,source_key,title,quote,source_start,source_end,timestamp,speaker,verified,verification_reason,kind,sentiment,tier,commitments,stage,review,edited,ai_proposal,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)",
            [
              id,
              DEMO_USER_ID,
              demoId(100 + t.customer),
              original.id,
              fingerprint(statement.quote, kind),
              statement.title,
              statement.quote,
              verification.start,
              verification.end,
              verification.timestamp,
              verification.speaker,
              verification.verified,
              verification.reason,
              kind,
              proposal.sentiment,
              tier,
              proposal.commitments,
              review === "approved" ? "signal" : "guess",
              review,
              JSON.stringify(statement.humanEdited ? { title: true } : {}),
              JSON.stringify(proposal),
              date,
            ],
          );
          await db.query(
            "INSERT INTO feature_signals(user_id,feature_id,signal_id) VALUES($1,$2,$3)",
            [DEMO_USER_ID, demoId(400 + statement.feature), id],
          );
          if (review === "approved" && verification.verified)
            accepted.push({
              id,
              customer: t.customer,
              feature: statement.feature,
            });
        }
      }
      for (let i = 0; i < demoBriefs.length; i++) {
        const b = demoBriefs[i],
          id = demoId(500 + i);
        const evidence = accepted
          .filter((s) => s.feature === b.feature)
          .map((s) => s.id);
        const proposal = {
          ask: b.ask,
          problem: b.problem,
          audience: b.audience,
          capability: b.capability,
          impact: b.impact,
          options: demoOptions(b.feature),
          unknowns: b.unknowns,
          evidence_ids: evidence,
        };
        await db.query(
          "INSERT INTO briefs(id,user_id,title,ask,problem,audience,capability,impact,options,status,review_date,revisit_if,edited,ai_proposal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2026-11-15',$11,$12,$13)",
          [
            id,
            DEMO_USER_ID,
            b.title,
            b.ask,
            b.problem,
            b.audience,
            b.capability,
            b.impact,
            JSON.stringify(proposal.options),
            b.status,
            i === 3
              ? "Revisit when three customers describe a specific staffing decision and agree to a discovery follow-up."
              : "Revisit if customer evidence, scope, or implementation constraints change.",
            JSON.stringify(i === 0 ? { ask: true, impact: true } : {}),
            i === 2 ? JSON.stringify(proposal) : null,
          ],
        );
        await db.query(
          "INSERT INTO brief_features(user_id,brief_id,feature_id) VALUES($1,$2,$3)",
          [DEMO_USER_ID, id, demoId(400 + b.feature)],
        );
        if (i === 0)
          await db.query(
            "INSERT INTO brief_signals(user_id,brief_id,signal_id) VALUES($1,$2,$3)",
            [DEMO_USER_ID, id, demoId(300)],
          );
        for (let q = 0; q < b.unknowns.length; q++) {
          const answered = q === 2 && i < 3;
          await db.query(
            "INSERT INTO questions(id,user_id,brief_id,question,in_guide,status,answer) VALUES($1,$2,$3,$4,true,$5,$6)",
            [
              demoId(600 + i * 3 + q),
              DEMO_USER_ID,
              id,
              b.unknowns[q],
              answered ? "Answered" : "Open",
              answered
                ? [
                    "Start with approval changes, actor, and timestamp; validate additional event types in the pilot.",
                    "The workspace owner must approve recipients; security review is still required.",
                    "Existing roles need a migration plan reviewed by current workspace administrators.",
                  ][i]
                : "",
            ],
          );
        }
      }
      for (let i = 0; i < demoCustomers.length; i++) {
        const evidence = accepted.find(
          (s) => s.customer === i && s.feature === [0, 0, 0, 2, 2, 1, 5, 3][i],
        )!;
        await db.query(
          "INSERT INTO assessments(id,user_id,customer_id,problem,level,suggested_level,business_purpose,constraints,buying_authority,evidence_ids,confirmed) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,true)",
          [
            demoId(700 + i),
            DEMO_USER_ID,
            demoId(100 + i),
            demoFeatures[evidence.feature].title,
            [5, 5, 4, 4, 3, 4, 5, 2][i],
            "Illustrative assessment of the problem discussed in the linked conversation.",
            demoCustomers[i][3],
            demoCustomers[i][2],
            [evidence.id],
          ],
        );
      }
      for (let i = 0; i < 2; i++)
        await db.query(
          "INSERT INTO jobs(id,user_id,transcript_id,brief_id,purpose,provider,model,prompt_version,state,attempts,result,created_at,finished_at) VALUES($1,$2,$3,$4,$5,'openai','prerecorded-example','demo-1','succeeded',1,$6,'2026-10-12T14:00:00Z','2026-10-12T14:00:00Z')",
          [
            demoId(800 + i),
            DEMO_USER_ID,
            i === 0 ? demoId(200) : null,
            i === 1 ? demoId(502) : null,
            i === 0 ? "extract" : "brief",
            JSON.stringify({
              demo: true,
              description: "Prerecorded illustration, not a live provider run",
            }),
          ],
        );
      await db.query(
        "INSERT INTO curation(user_id,target_type,target_id,pinned,hidden) VALUES($1,'brief',$2,true,false)",
        [DEMO_USER_ID, demoId(500)],
      );
      for (const [i, action] of [
        "Sample conversations prepared",
        "Illustrative signals reviewed",
        "Audit-history decision approved",
      ].entries())
        await db.query(
          "INSERT INTO audit(id,user_id,action,entity_type,detail) VALUES($1,$2,$3,'demo',$4)",
          [
            demoId(900 + i),
            DEMO_USER_ID,
            action,
            JSON.stringify({ fictional: true, version: DEMO_VERSION }),
          ],
        );
      await seedDemoReport(db);
      await db.query(
        "INSERT INTO demo_dataset(user_id,version) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version,seeded_at=now()",
        [DEMO_USER_ID, DEMO_VERSION],
      );
      for (const original of originals)
        await db.query("DELETE FROM storage_deletions WHERE pathname=$1", [
          original.intent,
        ]);
      for (const source of oldSources)
        if (!originals.some((o) => o.storage === source.storage_path))
          await db.query(
            "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()) ON CONFLICT(pathname) DO UPDATE SET transcript_id=NULL,not_before=now()",
            [source.storage_path],
          );
      await db.query("COMMIT");
      return {
        version: DEMO_VERSION,
        changed: true,
        customers: demoCustomers.length,
        transcripts: originals.length,
        signals: signalIndex,
        features: demoFeatures.length,
        briefs: demoBriefs.length,
      };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(822741931)");
    await db.end();
  }
}
