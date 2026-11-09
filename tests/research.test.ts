import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildResearch,
  documentLabels,
  nameKey,
  researchThemes,
  signalKey,
  type Company,
  type Conversation,
} from "../lib/research-model";
import type { Finding } from "../lib/opportunities";
const a: Company = {
  id: "a",
  name: "Acme",
  merged_into: null,
  research_version: 1,
};
const b: Company = {
  id: "b",
  name: "Beta",
  merged_into: null,
  research_version: 1,
};
const doc: Conversation = {
  id: "doc",
  kind: "source",
  filename: "Meeting.txt",
  created_at: "2026-11-08",
  header: "Company: Acme\nDate: 2026-10-10",
  role: "customer",
};
const finding: Finding = {
  id: "f",
  source_id: "doc",
  page_index: 0,
  source_start: 34,
  quote: "We need audit logs.",
  problem: "Audit history",
  consequence: "",
  customer: "Alex",
  origin: "customer",
  stance: "supports",
};
const base = () => ({
  companies: [a, b],
  aliases: [],
  sources: [doc],
  transcripts: [],
  findings: [
    { source_id: "doc", created_at: "2026-11-08", findings: [finding] },
  ],
  legacySignals: [],
  documentEdits: [],
  signalEdits: [],
});

test("company labels and dates use explicit document fields, never upload dates", () => {
  assert.deepEqual(
    documentLabels("Organization: Acme\nMeeting date: 2024-02-29"),
    { company: "Acme", date: "2024-02-29" },
  );
  assert.equal(documentLabels("Alex: We talked to Acme yesterday").company, "");
  assert.equal(documentLabels("Date: 2026-02-30").date, null);
  assert.equal(
    documentLabels("Date: 2026-11-08\nOther text").date,
    "2026-11-08",
  );
  const input = base();
  input.sources = [{ ...doc, header: "" }];
  const data = buildResearch(input);
  assert.equal(data.conversations[0].meeting_date, null);
  assert.equal(data.conversations[0].company_id, null);
  assert.equal(data.companies.length, 0);
  assert.equal(data.conversations[0].suggested_company, "Alex");
});
test("repeated analyses and legacy copies produce one conversation and quote", () => {
  const input: Parameters<typeof buildResearch>[0] = base();
  input.findings[0].findings = [finding, finding];
  input.transcripts = [
    {
      ...doc,
      id: "old",
      kind: "transcript",
      discovery_source_id: "doc",
      customer_id: "a",
    },
  ];
  input.legacySignals = [
    {
      id: "old-f",
      transcript_id: "old",
      source_start: 34,
      quote: finding.quote,
      title: "Old label",
      created_at: "2026-01-01",
      verified: true,
      sentiment: "for",
      review: "approved",
    },
  ];
  const data = buildResearch(input);
  assert.equal(data.conversations.length, 1);
  assert.equal(data.signals.length, 1);
  assert.equal(data.companies[0].conversations, 1);
  input.findings[0] = { ...input.findings[0], findings: [], extracted: true };
  assert.equal(buildResearch(input).signals.length, 0);
});
test("company merges, aliases and manual corrections preserve original findings", () => {
  const input: Parameters<typeof buildResearch>[0] = base();
  input.companies = [
    { ...a, merged_into: "b" },
    { ...b, name: "New name" },
  ];
  input.aliases = [{ name_key: "acme", company_id: "a" }];
  input.signalEdits = [
    {
      signal_key: signalKey(finding, "source"),
      theme: "Audit trails",
      hidden: false,
      version: 2,
    },
  ];
  const data = buildResearch(input);
  assert.equal(data.conversations[0].company_id, "b");
  assert.equal(data.companies[0].name, "New name");
  assert.equal(data.signals[0].theme, "Audit trails");
  assert.equal(finding.problem, "Audit history");
  assert.equal(data.signals[0].quote, finding.quote);
  input.signalEdits[0].hidden = true;
  assert.equal(researchThemes(buildResearch(input).signals).length, 0);
});
test("theme counts separate for, against and context while excluding hidden signals", () => {
  const signals = buildResearch(base()).signals;
  const rows = [
    signals[0],
    {
      ...signals[0],
      key: "two",
      theme: " audit HISTORY ",
      stance: "opposes" as const,
    },
    {
      ...signals[0],
      key: "three",
      company_id: "b",
      origin: "uncertain" as const,
    },
    { ...signals[0], key: "four", company_id: "b", hidden: true },
    { ...signals[0], key: "five", stance: "context" as const },
  ];
  const [theme] = researchThemes(rows);
  assert.equal(theme.companies, 1);
  assert.equal(theme.signals, 4);
  assert.equal(theme.supporting, 2);
  assert.equal(theme.opposing, 1);
  assert.equal(theme.context, 1);
  assert.equal(nameKey("  ACME   Inc  "), "acme inc");
});
test("context documents never become customer signals, including legacy counterparts", () => {
  const input = base();
  input.sources = [{ ...doc, role: "context" }];
  const data = buildResearch(input);
  assert.equal(data.conversations.length, 0);
  assert.equal(data.signals.length, 0);
});
test("manual company and date changes override suggestions and source dates", () => {
  const input: Parameters<typeof buildResearch>[0] = base();
  input.documentEdits = [
    {
      source_id: "doc",
      company_id: "b",
      meeting_date: "2026-09-20",
      version: 2,
    },
  ];
  const data = buildResearch(input);
  assert.equal(data.conversations[0].company_id, "b");
  assert.equal(data.conversations[0].meeting_date, "2026-09-20");
  assert.equal(data.signals[0].company_id, "b");
  assert.equal(data.companies[0].last_conversation, "2026-09-20");
});

test("cleanup keys stay stable when an old transcript is uploaded through discovery", () => {
  const input: Parameters<typeof buildResearch>[0] = base();
  input.sources = [];
  input.findings = [];
  input.transcripts = [
    {
      ...doc,
      id: "old",
      kind: "transcript",
      fingerprint: "same-bytes",
      customer_id: "a",
    },
  ];
  input.legacySignals = [
    {
      id: "old-f",
      transcript_id: "old",
      source_start: 34,
      quote: finding.quote,
      title: "Old label",
      created_at: "2026-01-01",
      verified: true,
      sentiment: "for",
      review: "approved",
    },
  ];
  const old = buildResearch(input).signals[0];
  input.signalEdits = [
    { signal_key: old.key, theme: "Corrected theme", hidden: true, version: 1 },
  ];
  input.documentEdits = [
    {
      transcript_id: "old",
      company_id: "b",
      meeting_date: "2026-09-01",
      version: 2,
    },
  ];
  input.sources = [{ ...doc, fingerprint: "same-bytes" }];
  input.transcripts[0].discovery_source_id = "doc";
  input.findings = [
    { source_id: "doc", created_at: "2026-11-08", findings: [finding] },
  ];
  const updated = buildResearch(input);
  assert.equal(updated.signals[0].key, old.key);
  assert.equal(updated.signals[0].hidden, true);
  assert.equal(updated.signals[0].theme, "Corrected theme");
  assert.equal(updated.conversations[0].meeting_date, "2026-09-01");
  assert.equal(updated.conversations[0].company_id, "b");
});

test("company histories count large imports and corrected signal companies without duplicate conversations", () => {
  const input: Parameters<typeof buildResearch>[0] = base();
  input.companies = Array.from({ length: 1000 }, (_, i) => ({
    ...a,
    id: String(i),
    name: "Company " + i,
  }));
  input.sources = input.companies.map((c) => ({
    ...doc,
    id: "doc" + c.id,
    header: "Company: " + c.name,
  }));
  input.findings = input.sources.map((d) => ({
    source_id: d.id,
    created_at: "2026-11-08",
    findings: [{ ...finding, source_id: d.id }],
  }));
  const result = buildResearch(input);
  assert.equal(result.companies.length, 1000);
  assert.equal(result.companies[0].conversations, 1);
  assert.equal(result.signals.length, 1000);
  const key = result.signals.find((s) => s.company_id === "0")!.key;
  input.signalEdits = [
    {
      signal_key: key,
      company_override: true,
      company_id: "1",
      hidden: false,
      version: 1,
    },
  ];
  const updated = buildResearch(input);
  assert.equal(updated.companies.find((c) => c.id === "1")!.conversations, 2);
  assert.equal(updated.companyDocuments.get("1")!.size, 2);
});

test("saved report groupings join different problem wording and respect manual corrections", () => {
  const input: Parameters<typeof buildResearch>[0] = base();
  const second = {
    ...finding,
    id: "f2",
    source_start: 80,
    quote: "I cannot explain who changed an approval.",
    problem: "Approval visibility",
  };
  input.findings[0].findings.push(second);
  input.themeLabels = [
    { problem: finding.problem, theme: "Explain approval changes" },
    { problem: second.problem, theme: "Explain approval changes" },
  ];
  assert.equal(researchThemes(buildResearch(input).signals).length, 1);
  assert.equal(researchThemes(buildResearch(input).signals)[0].signals, 2);
  input.signalEdits = [
    {
      signal_key: signalKey(second, "source"),
      theme: "Approval ownership",
      hidden: false,
      version: 1,
    },
  ];
  assert.equal(researchThemes(buildResearch(input).signals).length, 2);
});
