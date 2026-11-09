import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findingSchema,
  preciseReportSchema,
  groundedReportSchema,
  validateReport,
  reportMarkdown,
  type Finding,
} from "../lib/opportunities";
import {
  evidenceSelectionSchema,
  selectedEvidence,
} from "../lib/evidence-reduction";
import {
  opportunityId,
  validationWorkInput,
} from "../lib/discovery-experience";

const findings: Finding[] = [
  {
    id: "need",
    quote: "We want to trigger simulation runs through an API.",
    origin: "customer",
    stance: "supports",
  },
  {
    id: "disagreement",
    quote: "We do not need an API; manual runs are sufficient for our team.",
    origin: "customer",
    stance: "opposes",
  },
  {
    id: "maintenance",
    quote: "We have to move workloads when nodes are removed for maintenance.",
    origin: "customer",
    stance: "risk",
  },
  {
    id: "snapshot",
    quote: "Snapshots cannot include the customer's network buffers.",
    origin: "customer",
    stance: "risk",
  },
  {
    id: "strategy",
    quote: "Our internal roadmap says automation is important.",
    origin: "internal",
    stance: "context",
  },
  {
    id: "unknown",
    quote: "An unidentified attendee mentioned they might need an API.",
    origin: "uncertain",
    stance: "context",
  },
].map((f, i) => ({
  ...f,
  source_id: "source-" + i,
  page_index: 0,
  source_start: 0,
  problem: "Simulation workflow",
  consequence: "Manual work",
  customer: f.origin === "customer" ? "Example company" : "",
})) as Finding[];
const opportunity = {
  title: "API-triggered simulation",
  problem: "Manual runs interrupt the workflow.",
  audience: "Simulation engineers",
  importance: "Reduce manual handoffs.",
  rationale: "Customers describe the workflow.",
  supporting_ids: ["need"],
  opposing_ids: ["disagreement"],
  risk_ids: ["maintenance", "snapshot"],
  context_ids: ["strategy", "unknown"],
  evidence_reasons: [
    {
      finding_id: "disagreement",
      reason: "This team explicitly rejects the API need for this workflow.",
    },
    {
      finding_id: "maintenance",
      reason:
        "Maintenance affects delivery reliability; it does not contradict the need for API-triggered runs.",
    },
    {
      finding_id: "snapshot",
      reason:
        "Capturing runtime state is a technical constraint when recovering simulation jobs.",
    },
  ],
  uncertainty: "Frequency is unknown.",
  next_step: "Interview an infrastructure engineer.",
  questions: [],
};
test("opportunity evidence distinguishes direct disagreement, operational risks, and internal or uncertain context", () => {
  findings.forEach((f) => findingSchema.parse(f));
  const raw = preciseReportSchema.parse({
    summary: "A draft hypothesis.",
    opportunities: [opportunity],
    changes: [],
  });
  const report = validateReport(raw, findings);
  assert.equal(report.evidence_version, 2);
  assert.deepEqual(report.opportunities[0].risk_ids, [
    "maintenance",
    "snapshot",
  ]);
  assert.equal(
    groundedReportSchema(findings, true).safeParse(raw).success,
    true,
  );
  for (const id of ["maintenance", "snapshot", "strategy", "unknown"])
    assert.throws(
      () =>
        validateReport(
          {
            ...raw,
            opportunities: [
              {
                ...opportunity,
                supporting_ids: [id],
                risk_ids: opportunity.risk_ids.filter((x) => x !== id),
                context_ids: opportunity.context_ids.filter((x) => x !== id),
              },
            ],
          },
          findings,
        ),
      /Internal context/,
    );
  assert.throws(
    () =>
      validateReport(
        {
          ...raw,
          opportunities: [
            {
              ...opportunity,
              opposing_ids: ["maintenance"],
              risk_ids: ["snapshot"],
            },
          ],
        },
        findings,
      ),
    /Internal context/,
  );
  assert.throws(
    () =>
      validateReport(
        { ...raw, opportunities: [{ ...opportunity, evidence_reasons: [] }] },
        findings,
      ),
    /Explain how/,
  );
  assert.throws(
    () =>
      validateReport(
        { ...raw, opportunities: [{ ...opportunity, risk_ids: ["need"] }] },
        findings,
      ),
    /multiple evidence/,
  );
  const markdown = reportMarkdown(
    {
      ...report,
      coverage: {
        sources: 6,
        batches: 6,
        analyzed_sources: 2,
        verified_findings: 6,
        selected_findings: 6,
      },
    },
    "Simulation",
    [],
  );
  assert.match(markdown, /Partial analysis/);
  assert.match(markdown, /2 of 6 sources fully analyzed/);
  assert.match(markdown, /Direct challenges/);
  assert.match(markdown, /Risks and constraints/);
  assert.match(markdown, /Maintenance affects delivery reliability/);
});
test("risk findings survive evidence reduction without being counted as direct opposition", () => {
  const schema = evidenceSelectionSchema(findings).required({ risk_ids: true });
  const ids = schema.parse({
    supporting_ids: ["need"],
    opposing_ids: ["disagreement"],
    risk_ids: ["maintenance"],
    context_ids: ["strategy"],
  });
  const selected = selectedEvidence(findings, [
    ...ids.supporting_ids,
    ...ids.opposing_ids,
    ...ids.risk_ids,
    ...ids.context_ids,
  ]);
  assert.strictEqual(
    selected.find((f) => f.id === "maintenance"),
    findings[2],
  );
  assert.equal(
    schema.safeParse({ ...ids, opposing_ids: ["maintenance"] }).success,
    false,
  );
});
test("validation decisions have stable report-scoped identities and require human learning before review", () => {
  assert.equal(opportunityId("report-a", 0), opportunityId("report-a", 0));
  assert.notEqual(opportunityId("report-a", 0), opportunityId("report-b", 0));
  const input = {
    version: 0,
    status: "reviewed",
    activity: "Interview",
    learning: "",
    outcome: "supported",
  };
  assert.equal(validationWorkInput.safeParse(input).success, false);
  assert.equal(
    validationWorkInput.safeParse({
      ...input,
      learning: "The customer described the same issue.",
    }).success,
    true,
  );
});
