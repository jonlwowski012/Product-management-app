import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranscript, verifyQuote } from "../lib/domain";
import { rollup, optionsValid, Evidence } from "../lib/metrics";
import { hashPassword, checkPassword, encrypt, decrypt } from "../lib/auth";
import { transcript, quote, vtt, srt } from "./fixtures/transcripts";
test("quote verification preserves punctuation, timestamp and source offsets", () => {
  for (const raw of [transcript, vtt, srt]) {
    const v = verifyQuote(raw, quote, parseTranscript(raw));
    assert.equal(v.verified, true);
    assert.equal(raw.slice(v.start!, v.end!), quote);
    assert.ok(v.timestamp);
  }
});
test("paraphrases and missing timestamps never qualify", () => {
  assert.equal(
    verifyQuote(
      transcript,
      "We need audit logs before we buy.",
      parseTranscript(transcript),
    ).verified,
    false,
  );
  const raw = "Customer: " + quote;
  assert.equal(verifyQuote(raw, quote, parseTranscript(raw)).verified, false);
});
test("repeated quote needs an explicit source location", () => {
  const raw = `[00:01] Customer: ${quote}\n[00:12] Customer: ${quote}`;
  assert.equal(verifyQuote(raw, quote, parseTranscript(raw)).verified, false);
  const at = raw.lastIndexOf(quote);
  assert.equal(verifyQuote(raw, quote, parseTranscript(raw), at).start, at);
});
const signal = (changes: Partial<Evidence> = {}): Evidence => ({
  id: "1",
  customer_id: "a",
  verified: true,
  review: "approved",
  stage: "signal",
  kind: "gap",
  sentiment: "for",
  tier: 1,
  commitments: ["pay"],
  ...changes,
});
test("demand and pay counts deduplicate accounts and repeated graph paths", () => {
  const s = signal();
  const m = rollup([
    s,
    s,
    signal({ id: "2" }),
    signal({ id: "3", customer_id: "b", tier: 4 }),
    signal({ id: "4", customer_id: "c", review: "pending" }),
    signal({ id: "5", customer_id: "d", verified: false }),
  ]);
  assert.equal(m.for, 1);
  assert.equal(m.wouldPay, 1);
  assert.equal(m.verified, 3);
});
test("opposing evidence surfaces a conflict until a human resolves it", () => {
  const ss = [
    signal(),
    signal({ id: "2", sentiment: "against", commitments: [] }),
  ];
  assert.equal(rollup(ss).mixed, 1);
  assert.equal(rollup(ss).for, 0);
  assert.equal(rollup(ss, { a: "for" }).for, 1);
  assert.equal(rollup(ss, { a: "against" }).wouldPay, 0);
});
test("human overrides cannot manufacture qualifying positive evidence", () => {
  assert.equal(rollup([signal({ sentiment: "against" })], { a: "for" }).for, 0);
  assert.equal(rollup([signal({ tier: 5 })], { a: "for" }).for, 0);
  assert.equal(rollup([signal({ kind: "strength" })]).for, 0);
});
test("fair options retain both baseline choices", () => {
  assert.equal(
    optionsValid([
      { name: "Do nothing" },
      { name: "Maintain current approach" },
    ]),
    true,
  );
  assert.equal(
    optionsValid([{ name: "Build" }, { name: "Do nothing" }]),
    false,
  );
});
test("passwords are salted and provider keys authenticated encrypted", () => {
  const a = hashPassword("a long password");
  assert.notEqual(a, hashPassword("a long password"));
  assert.ok(checkPassword("a long password", a));
  assert.equal(checkPassword("wrong password", a), false);
  process.env.APP_SECRET = "test-only-long-secret-1234567890123456";
  const value = encrypt("secret-provider-key");
  assert.ok(!value.includes("secret-provider-key"));
  assert.equal(decrypt(value), "secret-provider-key");
  assert.throws(() => decrypt(value.slice(0, -2) + "ff"));
});

test("extraction chunks preserve original offsets and reject unbounded lines", async () => {
  const { chunkRanges } = await import("../lib/job-engine");
  const raw = "[00:01] Customer: A complete speaker turn.\n".repeat(1500);
  const chunks = chunkRanges(raw);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((c) => raw.slice(c.start, c.end)).join(""), raw);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1)!.end, raw.length);
  assert.ok(chunks.every((c) => c.end - c.start <= 18000));
  assert.throws(() => chunkRanges("x".repeat(24001)), /24,000/);
});

test("UTF-8 validation preserves original BOM and rejects malformed archive text", async () => {
  const { decodeFiles } = await import("../lib/ingest");
  const text = "\uFEFF[00:02] Customer: Original punctuation stays.”";
  assert.equal(decodeFiles("source.txt", Buffer.from(text))[0].text, text);
  assert.throws(
    () => decodeFiles("bad.txt", Buffer.from([0xc3, 0x28])),
    /UTF-8/,
  );
});

test("simulation demo matches the PDF and every anonymized quote links to its excerpt", async () => {
  const { demoData } = await import("../lib/demo-data");
  const { validateReport, findingSchema } =
    await import("../lib/opportunities");
  assert.equal(
    demoData.question,
    "Is simulation as a service a good product idea?",
  );
  assert.equal(demoData.sources.length, 6);
  assert.equal(demoData.result.findings.length, 10);
  const findings = demoData.result.findings.map((f) => ({
    ...findingSchema.parse(f),
    id: f.id,
    source_start: f.source_start,
  }));
  const result = validateReport(demoData.result, findings);
  assert.deepEqual(
    result.opportunities.map((o) => o.title),
    [
      "API-First, Ephemeral Simulation Infrastructure",
      "Integrated Simulation-to-Training Pipeline",
      "Modular Entry Points to Build Trust",
    ],
  );
  for (const f of findings) {
    const source = demoData.sources.find((s) => s.id === f.source_id)!;
    assert.equal(
      source.text.slice(f.source_start, f.source_start + f.quote.length),
      f.quote,
    );
    assert.ok(source.text.includes("Selected excerpts only"));
  }
  assert.doesNotMatch(JSON.stringify(demoData), /@|https?:\/\//i);
  for (const finding of findings)
    assert.ok(
      demoData.sources.some(
        (s) => s.id === finding.source_id && s.company === finding.customer,
      ),
    );
  assert.equal(
    demoData.result.coverage.skipped_batches,
    demoData.result.analysis_warnings.length,
  );
});
