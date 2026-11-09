import type pg from "pg";
import { createHash } from "node:crypto";
import { DEMO_USER_ID, demoId } from "./demo-constants";
import { validateReport, type Finding } from "./opportunities";
export async function seedDemoReport(db: pg.Client) {
  const rid = demoId(1000);
  const {
    rows: [exists],
  } = await db.query("SELECT id FROM discovery_reports WHERE id=$1", [rid]);
  if (exists) return;
  const { rows: transcripts } = await db.query(
    "SELECT t.*,c.name AS customer FROM transcripts t JOIN customers c ON c.id=t.customer_id AND c.user_id=t.user_id WHERE t.user_id=$1 ORDER BY t.id",
    [DEMO_USER_ID],
  );
  if (!transcripts.length) return;
  const sourceIds = new Map<string, string>();
  for (const [i, t] of transcripts.entries()) {
    const sid = demoId(1100 + i);
    sourceIds.set(t.id, sid);
    await db.query(
      "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages,warnings) VALUES($1,$2,$3,$4,$5,'[]') ON CONFLICT DO NOTHING",
      [
        sid,
        DEMO_USER_ID,
        t.title + ".txt",
        createHash("sha256")
          .update(Buffer.from(t.raw_text).toString("base64"))
          .digest("hex"),
        JSON.stringify([{ label: "Original conversation", text: t.raw_text }]),
      ],
    );
  }
  const { rows: signals } = await db.query(
    "SELECT s.*,c.name AS customer,fs.feature_id FROM signals s JOIN customers c ON c.id=s.customer_id AND c.user_id=s.user_id JOIN feature_signals fs ON fs.signal_id=s.id AND fs.user_id=s.user_id WHERE s.user_id=$1 AND s.verified AND s.review='approved' AND s.stage='signal' AND s.kind='gap' ORDER BY s.id",
    [DEMO_USER_ID],
  );
  const findings: Finding[] = signals.map((s) => ({
    id: s.id,
    source_id: sourceIds.get(s.transcript_id)!,
    page_index: 0,
    source_label: "Original conversation",
    quote: s.quote,
    source_start: s.source_start,
    problem: s.title,
    consequence: "Illustrative customer statement; follow up on consequences.",
    customer: s.customer,
    origin: "customer",
    stance:
      s.sentiment === "for"
        ? "supports"
        : s.sentiment === "against"
          ? "opposes"
          : "context",
  }));
  const definitions = [
    {
      feature: 0,
      title: "Make approval changes easier to explain",
      problem:
        "Compliance and operations teams assemble change records manually when explaining approval decisions.",
      audience: "Compliance leads and operations teams",
      importance:
        "Three fictional customers support the need for audit history, while a smaller team says it is not a priority.",
      rationale:
        "Repeated problems and explicit purchasing statements make this worth further discovery. These statements are not completed purchases.",
      uncertainty:
        "Retention periods, export permissions, and the first events to capture remain uncertain.",
      next_step:
        "Interview the compliance owners about their most recent audit review and inspect the records they assembled.",
      questions: [
        "Walk me through your most recent audit review.",
        "What records did you need, and how did you gather them?",
        "What happened when a change could not be explained?",
      ],
    },
    {
      feature: 1,
      title: "Keep sensitive work accessible to the right people",
      problem:
        "Growing teams need clear approval and access boundaries, without a complex role editor.",
      audience: "Operations teams rolling out across regions or clients",
      importance:
        "Several fictional customers describe access restrictions or ownership problems; one warns against setup complexity.",
      rationale:
        "Recurring access needs span different customers, with an explicit opposing preference to test.",
      uncertainty:
        "The smallest useful set of roles and the cost of maintaining permissions are unknown.",
      next_step:
        "Ask three workspace owners to show how they assign approval rights today and where that process breaks.",
      questions: [
        "Show me the last time you changed someone's access.",
        "What went wrong or required extra work?",
        "Who reviews permissions after setup?",
      ],
    },
    {
      feature: 2,
      title: "Reduce repeated reporting work without spreading sensitive files",
      problem:
        "Some teams repeatedly export reports, while others prefer controlled dashboards and oppose automatic file delivery.",
      audience: "Finance and operations teams preparing recurring reviews",
      importance:
        "The sources contain both support and opposition, including conflicting preferences within one fictional customer.",
      rationale:
        "The conflict makes a targeted validation step more useful than committing to scheduled exports.",
      uncertainty:
        "Which delivery method meets reporting needs and the team's access policies remains unresolved.",
      next_step:
        "Compare the current reporting workflow with a shared dashboard during a customer interview before choosing a delivery method.",
      questions: [
        "Walk me through the last recurring report you prepared.",
        "Who used it and what decision did it support?",
        "What happens to the file after you send it?",
      ],
    },
  ];
  const opportunities = definitions.map(({ feature, ...o }) => {
    const linked = signals.filter(
      (s) => s.feature_id === demoId(400 + feature),
    );
    return {
      ...o,
      supporting_ids: linked
        .filter((s) => s.sentiment === "for" && s.tier <= 3)
        .map((s) => s.id),
      opposing_ids: linked
        .filter((s) => s.sentiment === "against")
        .map((s) => s.id),
      context_ids: linked
        .filter((s) => s.sentiment === "neutral" || s.tier > 3)
        .map((s) => s.id),
    };
  });
  const result = validateReport(
    {
      summary:
        "Customer conversations point to three opportunities: explaining approval changes, keeping access manageable, and reducing reporting work. Each needs focused validation. This fictional report keeps opposing views visible and offers one practical next step per opportunity.",
      opportunities,
      changes: [],
    },
    findings,
  );
  await db.query(
    "INSERT INTO discovery_reports(id,user_id,question,product_context,input_hash,result,created_at) VALUES($1,$2,'What should HarborOps explore next?','HarborOps is a fictional operations product.','public-workflow-demo-1',$3,'2026-10-28T12:00:00Z')",
    [rid, DEMO_USER_ID, JSON.stringify(result)],
  );
  for (const sid of sourceIds.values())
    await db.query(
      "INSERT INTO discovery_report_sources(user_id,report_id,source_id,role) VALUES($1,$2,$3,'customer')",
      [DEMO_USER_ID, rid, sid],
    );
}
