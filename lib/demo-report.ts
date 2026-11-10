import type pg from "pg";
import { createHash } from "node:crypto";
import { DEMO_USER_ID, demoId } from "./demo-constants";
import { demoData } from "./demo-data";
import { findingSchema, validateReport } from "./opportunities";

export async function seedDemoReport(db: pg.Client) {
  const findings = demoData.result.findings.map((f) => ({
    ...findingSchema.parse(f),
    id: f.id,
    source_start: f.source_start,
    source_label: f.source_label,
  }));
  for (const f of findings) {
    const source = demoData.sources.find((s) => s.id === f.source_id);
    if (
      source?.text.slice(f.source_start, f.source_start + f.quote.length) !==
      f.quote
    )
      throw new Error(
        "Demo quote does not match its anonymized source excerpt",
      );
  }
  const result = {
    ...validateReport(demoData.result, findings),
    coverage: demoData.result.coverage,
    analysis_warnings: demoData.result.analysis_warnings,
  };
  const companies = [...new Set(demoData.sources.map((s) => s.company))];
  for (const [i, company] of companies.entries())
    await db.query(
      "INSERT INTO customers(id,user_id,name,segment,notes) VALUES($1,$2,$3,'','Fictional company name in an anonymized sales-demo snapshot.')",
      [demoId(100 + i), DEMO_USER_ID, company],
    );
  for (const source of demoData.sources)
    await db.query(
      "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages,warnings,role) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        source.id,
        DEMO_USER_ID,
        source.filename,
        createHash("sha256")
          .update(Buffer.from(source.text).toString("base64"))
          .digest("hex"),
        JSON.stringify([{ label: "Anonymized excerpts", text: source.text }]),
        JSON.stringify([
          "Selected anonymized excerpts only. The complete private original is not included.",
        ]),
        source.role,
      ],
    );
  await db.query(
    "INSERT INTO discovery_reports(id,user_id,question,product_context,input_hash,result,created_at) VALUES($1,$2,$3,$4,$5,$6,'2026-11-08T19:35:20Z')",
    [
      demoId(1000),
      DEMO_USER_ID,
      demoData.question,
      demoData.provenance,
      "public-simulation-demo-v2",
      JSON.stringify(result),
    ],
  );
  for (const source of demoData.sources)
    await db.query(
      "INSERT INTO discovery_report_sources(user_id,report_id,source_id,role) VALUES($1,$2,$3,$4)",
      [DEMO_USER_ID, demoId(1000), source.id, source.role],
    );
}
