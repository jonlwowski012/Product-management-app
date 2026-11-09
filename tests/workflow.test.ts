import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocument, discoveryFiles } from "../lib/documents";
import AdmZip from "adm-zip";
import {
  droppedDiscoveryFiles,
  selectedDiscoveryFiles,
  prepareDiscoveryFiles,
} from "../components/discovery-files";
import {
  verifyFindings,
  validateReport,
  groundedFindingRequest,
  groundedReportSchema,
} from "../lib/opportunities";
import { pdfFixture, officeFixture } from "./fixtures/documents";
import { providerResponse, ProviderError } from "../lib/ai";
import { encrypt } from "../lib/auth";
const quote = "We need audit logs before we can buy.";
test("failed analysis batches checkpoint warnings and continue with later documents", async (t) => {
  const { analyzeChunk } = await import("../lib/reports");
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const input = JSON.parse(JSON.parse(String(init.body)).input);
      if (input[0].source_id === "bad")
        return new Response(
          JSON.stringify({ error: { message: "Private source text" } }),
          { status: 503 },
        );
      if (input[0].source_id === "malformed") return Response.json(null);
      return Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  findings: [
                    {
                      source_id: "good",
                      page_index: 0,
                      quote,
                      problem: "Auditability",
                      consequence: "Delayed purchase",
                      customer: "",
                      origin: "customer",
                      stance: "supports",
                    },
                  ],
                }),
              },
            ],
          },
        ],
      });
    },
  );
  process.env.APP_SECRET ||= "unit-test-secret-12345678901234567890";
  const oldKey = process.env.INCLUDED_AI_API_KEY;
  process.env.INCLUDED_AI_API_KEY = "fixture-key";
  t.after(() => {
    if (oldKey === undefined) delete process.env.INCLUDED_AI_API_KEY;
    else process.env.INCLUDED_AI_API_KEY = oldKey;
  });
  const chunks = ["bad", "malformed", "good"].map((source_id, chunk_index) => ({
    chunk_index,
    attempts: 0,
    completed: false,
    warning: null as string | null,
    candidates: [] as any[],
    input: [
      {
        source_id,
        filename: source_id + ".txt",
        page_index: 0,
        text: quote,
        start: 0,
        role: "customer",
      },
    ],
  }));
  const client = {
    query: async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT is_demo"))
        return { rows: [{ is_demo: false }] };
      if (sql.includes("LEFT JOIN subscriptions"))
        return { rows: [{ paid_until: new Date(Date.now() + 86400000) }] };
      if (sql === "SELECT * FROM settings WHERE user_id=$1")
        return { rows: [{ openai_key: encrypt("fixture-key") }] };
      if (sql.startsWith("UPDATE job_chunks SET attempts")) {
        chunks[args[2]].attempts = args[0];
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE job_chunks SET candidates")) {
        const chunk = chunks[args[3]];
        chunk.candidates = JSON.parse(args[0]);
        chunk.completed = true;
        chunk.warning = args[4] ?? null;
        return { rows: [] };
      }
      throw new Error("Unexpected query: " + sql);
    },
  };
  const job = {
    id: "job",
    user_id: "user",
    provider: "openai",
    model: "fixture",
    billing_mode: "byok",
  };
  for (const chunk of chunks) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = await analyzeChunk(client as any, job, chunk);
      if (!wait) break;
    }
  }
  assert.equal(chunks[0].attempts, 3);
  assert.equal(chunks[0].completed, true);
  assert.match(chunks[0].warning!, /openai.*503/);
  assert.equal(chunks[0].candidates.length, 0);
  assert.equal(chunks[1].attempts, 3);
  assert.equal(chunks[1].completed, true);
  assert.match(chunks[1].warning!, /validation/);
  assert.equal(chunks[2].completed, true);
  assert.equal(chunks[2].warning, null);
  assert.equal(chunks[2].candidates[0].quote, quote);
  assert.ok(!JSON.stringify(chunks).includes("Private source text"));
});
test("duplicate file content is removed before upload while edited copies remain", async () => {
  const warnings: string[] = [];
  const files = await prepareDiscoveryFiles(
    [
      new File([quote], "call.txt"),
      new File([quote], "copied-call.txt"),
      new File([quote + " Updated customer feedback."], "call.txt"),
    ],
    (warning) => warnings.push(warning),
  );
  assert.equal(files.length, 2);
  assert.equal(await files[1].text(), quote + " Updated customer feedback.");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /duplicate/i);
});
test("mixed discovery selections warn about unsupported files and keep supported calls", () => {
  const warnings: string[] = [];
  const files = selectedDiscoveryFiles(
    [
      new File([quote], "customer-call.txt"),
      new File(["image"], "Customer Notes — Screenshot.png.svg"),
    ],
    (warning) => warnings.push(warning),
  );
  assert.deepEqual(
    files.map((f) => f.name),
    ["customer-call.txt"],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Screenshot.png.svg/);
});
test("mixed discovery ZIPs warn about screenshots and retain valid documents", () => {
  const zip = new AdmZip();
  zip.addFile("calls/call.txt", Buffer.from(quote));
  zip.addFile("calls/screenshot.svg", Buffer.from("image"));
  const warnings: string[] = [];
  const files = discoveryFiles("calls.zip", zip.toBuffer(), (warning) =>
    warnings.push(warning),
  );
  assert.equal(files.length, 1);
  assert.equal(warnings.length, 1);
});
test("report citation choices exclude internal, uncertain and opposing findings from support", () => {
  const base = {
    source_id: "s",
    page_index: 0,
    quote,
    problem: "",
    consequence: "",
    customer: "",
    source_start: 0,
  };
  const findings = [
    {
      ...base,
      id: "support",
      origin: "customer" as const,
      stance: "supports" as const,
    },
    {
      ...base,
      id: "opposition",
      origin: "customer" as const,
      stance: "opposes" as const,
    },
    {
      ...base,
      id: "internal",
      origin: "internal" as const,
      stance: "supports" as const,
    },
    {
      ...base,
      id: "uncertain",
      origin: "uncertain" as const,
      stance: "supports" as const,
    },
  ];
  const opportunity = {
    title: "Auditability",
    problem: "",
    audience: "",
    importance: "",
    rationale: "",
    supporting_ids: ["support"],
    opposing_ids: ["opposition"],
    context_ids: ["internal", "uncertain"],
    uncertainty: "",
    next_step: "",
    questions: [],
  };
  const report = { summary: "", opportunities: [opportunity], changes: [] };
  const schema = groundedReportSchema(findings);
  assert.deepEqual(
    validateReport(schema.parse(report), findings).opportunities,
    [opportunity],
  );
  for (const id of ["internal", "uncertain", "opposition", "invented"])
    assert.equal(
      schema.safeParse({
        ...report,
        opportunities: [{ ...opportunity, supporting_ids: [id] }],
      }).success,
      false,
    );
  for (const id of ["support", "internal", "uncertain", "invented"])
    assert.equal(
      schema.safeParse({
        ...report,
        opportunities: [{ ...opportunity, opposing_ids: [id] }],
      }).success,
      false,
    );
  assert.equal(
    schema.safeParse({
      ...report,
      opportunities: [{ ...opportunity, context_ids: ["invented"] }],
    }).success,
    false,
  );
  for (const withoutSupport of [[], findings.slice(1)]) {
    const emptySchema = groundedReportSchema(withoutSupport);
    assert.equal(emptySchema.safeParse(report).success, false);
    assert.equal(
      emptySchema.safeParse({ ...report, opportunities: [] }).success,
      true,
    );
  }
});
test("grounded extraction binds verbatim quotes to the correct source and page", () => {
  const passages = [
    {
      source_id: "customer",
      page_index: 0,
      text: "[00:04] Customer: " + quote,
      start: 70,
      role: "customer",
    },
    {
      source_id: "strategy",
      page_index: 2,
      text: "Our internal roadmap says audit logs are important.",
      start: 0,
      role: "context",
    },
  ];
  const request = groundedFindingRequest(passages);
  const { schema } = request;
  const candidate = {
    passage_id: "p0",
    problem: "Auditability",
    consequence: "",
    customer: "",
    origin: "customer" as const,
    stance: "supports" as const,
  };
  const data = request.resolve({ findings: [candidate] });
  const [finding] = verifyFindings(data, passages);
  assert.equal(finding.source_start, 70);
  assert.equal(finding.quote, passages[0].text);
  assert.equal(finding.source_id, "customer");
  const [internal] = verifyFindings(
    request.resolve({ findings: [{ ...candidate, passage_id: "p1" }] }),
    passages,
  );
  assert.equal(internal.source_id, "strategy");
  assert.equal(internal.page_index, 2);
  assert.equal(internal.origin, "internal");
  assert.equal(internal.stance, "context");
  assert.throws(() =>
    request.resolve({ findings: [{ ...candidate, passage_id: "invented" }] }),
  );
  const injected = request.resolve({
    findings: [
      {
        ...candidate,
        quote: "Rewritten quote...",
        source_id: "other-source",
        page_index: 99,
      },
    ],
  });
  assert.deepEqual(injected, data);
  assert.equal(
    schema.safeParse({ findings: Array(7).fill(candidate) }).success,
    false,
  );
  assert.deepEqual(schema.parse({ findings: [] }), { findings: [] });
});
test("grounded quote choices preserve punctuation, Unicode and long unbroken passages", () => {
  for (const text of [
    "Customer: “Export it.”\r\nCustomer: I wouldn’t pay. 客户需要完整记录。",
    "Customer: " + "long customer statement ".repeat(100),
    "😀".repeat(1000),
    "a" + "😀".repeat(301),
    "Yes. No. Fine.",
  ]) {
    const request = groundedFindingRequest([
      { source_id: "s", page_index: 0, text },
    ]);
    const choices = JSON.parse(request.input)[0].quotes.map(
      (q: { text: string }) => q.text,
    ) as string[];
    assert.ok(choices.length);
    for (const quote of choices) {
      assert.ok(text.includes(quote));
      assert.ok(quote.length >= 5 && quote.length <= 600);
      assert.equal(quote.isWellFormed(), true);
    }
    assert.ok(choices.some((q) => q.endsWith(text.trim().slice(-5))));
  }
});
test("Groq schema-generation failures retry safely without exposing rejected output", async () => {
  const body = JSON.stringify({
    error: {
      code: "json_validate_failed",
      message: "Private source text and gsk_do_not_leak",
      failed_generation: "Private source text and gsk_do_not_leak",
    },
  });
  await assert.rejects(
    () => providerResponse("groq", new Response(body, { status: 400 })),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.retryable &&
      error.message.includes("structured response") &&
      !error.message.includes("Private") &&
      !error.message.includes("gsk_"),
  );
  for (const [provider, code] of [
    ["openai", "json_validate_failed"],
    ["groq", "invalid_parameter"],
  ]) {
    await assert.rejects(
      () =>
        providerResponse(
          provider,
          new Response(JSON.stringify({ error: { code } }), { status: 400 }),
        ),
      (error: unknown) => error instanceof ProviderError && !error.retryable,
    );
  }
});
test("provider rate limits preserve retry delays while billing and oversized requests fail clearly", async () => {
  for (const retry of [
    "3",
    "1.5",
    new Date(Date.now() + 10000).toUTCString(),
  ]) {
    await assert.rejects(
      () =>
        providerResponse(
          "groq",
          new Response('{"error":{"code":"rate_limit_exceeded"}}', {
            status: 429,
            headers: { "retry-after": retry },
          }),
        ),
      (error: unknown) =>
        error instanceof ProviderError &&
        error.retryable &&
        !!error.retryAfterSeconds &&
        error.retryAfterSeconds >= 2,
    );
  }
  for (const code of [
    "credit_balance_exhausted",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
  ]) {
    await assert.rejects(
      () =>
        providerResponse(
          "openai",
          new Response(
            JSON.stringify({
              error: { code, message: "secret-provider-error" },
            }),
            { status: 429 },
          ),
        ),
      (error: unknown) =>
        error instanceof ProviderError &&
        !error.retryable &&
        error.message.includes("billing") &&
        !error.message.includes("secret-provider-error"),
    );
  }
  await assert.rejects(
    () =>
      providerResponse(
        "groq",
        new Response(
          '{"error":{"message":"Request too large for model token allowance"}}',
          { status: 429 },
        ),
      ),
    (error: unknown) =>
      error instanceof ProviderError &&
      !error.retryable &&
      error.message.includes("fewer sources"),
  );
});
test("discovery ZIPs preserve separate original files and skip system metadata", async () => {
  const zip = new AdmZip();
  zip.addFile("calls/first.txt", Buffer.from(quote));
  const pdf = pdfFixture([quote]);
  zip.addFile("calls/second.pdf", pdf);
  zip.addFile("__MACOSX/._second.pdf", Buffer.from("metadata"));
  zip.addFile("calls/.DS_Store", Buffer.from("metadata"));
  const files = discoveryFiles("calls.zip", zip.toBuffer());
  assert.deepEqual(
    files.map((f) => f.name),
    ["calls — first.txt", "calls — second.pdf"],
  );
  assert.deepEqual(files[1].buffer, pdf);
  assert.ok(
    (await readDocument(files[1].name, files[1].buffer)).pages[0].text.includes(
      quote,
    ),
  );
});
test("discovery ZIPs reject unsafe archives and refuse archives with no supported documents", () => {
  for (const name of ["audio.mp4", "nested.zip"]) {
    const zip = new AdmZip();
    zip.addFile(name, Buffer.from(quote));
    assert.throws(
      () => discoveryFiles("calls.zip", zip.toBuffer()),
      /no supported/,
    );
  }
  const zip = new AdmZip();
  zip.addFile("safe/file.txt", Buffer.from(quote));
  const unsafe = Buffer.from(
    zip
      .toBuffer()
      .toString("binary")
      .replaceAll("safe/file.txt", "../x/file.txt"),
    "binary",
  );
  assert.throws(() => discoveryFiles("calls.zip", unsafe), /Unsafe/);
  zip.getEntry("safe/file.txt")!.attr = (0xa1ff << 16) >>> 0;
  assert.throws(() => discoveryFiles("calls.zip", zip.toBuffer()), /Unsafe/);
  const encrypted = new AdmZip();
  encrypted.addFile("call.txt", Buffer.from(quote));
  encrypted.getEntry("call.txt")!.header.flags |= 1;
  assert.throws(
    () => discoveryFiles("calls.zip", encrypted.toBuffer()),
    /Password-protected/,
  );
  const bomb = new AdmZip();
  bomb.addFile("large.txt", Buffer.alloc(10 * 1024 * 1024 + 1));
  assert.throws(() => discoveryFiles("calls.zip", bomb.toBuffer()), /Expanded/);
  const many = new AdmZip();
  for (let i = 0; i < 31; i++)
    many.addFile(`call-${i}.txt`, Buffer.from(quote));
  assert.throws(
    () => discoveryFiles("calls.zip", many.toBuffer()),
    /30 documents/,
  );
  assert.throws(
    () => discoveryFiles("empty.zip", new AdmZip().toBuffer()),
    /no supported/,
  );
  assert.throws(
    () => discoveryFiles("bad.zip", Buffer.from("invalid")),
    /Invalid ZIP/,
  );
});
test("folder drops read every directory batch, preserve nested names, and ignore hidden files", async () => {
  const file = (name: string, content = quote) => ({
    name,
    isFile: true,
    isDirectory: false,
    file: (done: (file: File) => void) =>
      done(new File([content], name, { type: "text/plain" })),
  });
  const directory = (name: string, batches: unknown[][]) => ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let index = 0;
      return {
        readEntries: (done: (entries: unknown[]) => void) =>
          done(batches[index++] ?? []),
      };
    },
  });
  const root = directory("calls", [
    [file("one.txt"), file(".DS_Store")],
    [directory("second", [[file("one.txt", "Different customer call")]])],
  ]);
  const files = await droppedDiscoveryFiles(
    [{ webkitGetAsEntry: () => root } as unknown as DataTransferItem],
    [],
  );
  assert.deepEqual(
    files.map((f) => f.name),
    ["calls — one.txt", "calls — second — one.txt"],
  );
  assert.equal(await files[1].text(), "Different customer call");
  const warnings: string[] = [];
  assert.deepEqual(
    selectedDiscoveryFiles([new File([quote], "call.mp4")], (message) =>
      warnings.push(message),
    ),
    [],
  );
  assert.equal(warnings.length, 1);
  const large = directory("calls", [
    Array.from({ length: 501 }, (_, i) =>
      file(`call-${i}.txt`, quote + " " + i),
    ),
  ]);
  const many = await droppedDiscoveryFiles(
    [{ webkitGetAsEntry: () => large } as unknown as DataTransferItem],
    [],
  );
  assert.equal(many.length, 501);
  const tooMany = directory("calls", [
    Array.from({ length: 1001 }, (_, i) =>
      file(`call-${i}.txt`, quote + " " + i),
    ),
  ]);
  await assert.rejects(
    () =>
      droppedDiscoveryFiles(
        [{ webkitGetAsEntry: () => tooMany } as unknown as DataTransferItem],
        [],
      ),
    /1,000/,
  );
});
test("mixed documents preserve page/slide locations and decode Office text", async () => {
  const pdf = await readDocument(
    "research.pdf",
    pdfFixture([quote, "An opposing view belongs on page two."]),
  );
  assert.equal(pdf.pages.length, 2);
  assert.ok(pdf.pages[0].text.includes(quote));
  assert.equal(pdf.pages[1].label, "Page 2");
  const slides = await readDocument(
    "strategy.pptx",
    officeFixture("pptx", ["Internal plan & constraints", quote]),
  );
  assert.equal(slides.pages[1].label, "Slide 2");
  assert.equal(slides.pages[0].text, "Internal plan & constraints");
  const doc = await readDocument(
    "notes.docx",
    officeFixture("docx", ["Customer notes", quote]),
  );
  assert.ok(doc.pages[0].text.includes(quote));
  const notes = await readDocument("notes.txt", Buffer.from(quote));
  assert.equal(notes.pages[0].text, quote);
});
test("unreadable and malformed documents produce actionable errors", async () => {
  await assert.rejects(() => readDocument("scan.pdf", pdfFixture([""])), /OCR/);
  await assert.rejects(
    () => readDocument("broken.pdf", Buffer.from("not a PDF")),
    /could not be read/,
  );
  await assert.rejects(
    () => readDocument("macro.exe", Buffer.from(quote)),
    /Use TXT/,
  );
});
test("quote verification supports untimestamped notes and enforces source boundaries", () => {
  const candidate = {
    source_id: "source",
    page_index: 0,
    quote,
    problem: "Auditability",
    consequence: "",
    customer: "",
    origin: "customer" as const,
    stance: "supports" as const,
  };
  const passages = [
    {
      source_id: "source",
      page_index: 0,
      text: quote,
      start: 0,
      role: "context",
      label: "Slide 2",
    },
  ];
  const [finding] = verifyFindings({ findings: [candidate] }, passages);
  assert.equal(finding.origin, "internal");
  assert.equal(finding.stance, "context");
  assert.equal(finding.source_label, "Slide 2");
  assert.throws(
    () =>
      verifyFindings(
        { findings: [{ ...candidate, quote: "invented quote" }] },
        passages,
      ),
    /did not match/,
  );
  assert.throws(
    () =>
      verifyFindings(
        { findings: [{ ...candidate, source_id: "another-account" }] },
        passages,
      ),
    /did not match/,
  );
  assert.throws(
    () =>
      validateReport(
        {
          summary: "",
          changes: [],
          opportunities: [
            {
              title: "",
              problem: "",
              audience: "",
              importance: "",
              rationale: "",
              supporting_ids: [finding.id],
              opposing_ids: [],
              context_ids: [],
              uncertainty: "",
              next_step: "",
              questions: [],
            },
          ],
        },
        [finding],
      ),
    /Internal context/,
  );
});

test("presentation citations follow actual slide order after slides are rearranged", async () => {
  const slides = await readDocument(
    "Reordered.pptx",
    officeFixture(
      "pptx",
      ["First file, second slide", "Second file, first slide"],
      [2, 1],
    ),
  );
  assert.equal(slides.pages[0].label, "Slide 1");
  assert.equal(slides.pages[0].text, "Second file, first slide");
  assert.equal(slides.pages[1].text, "First file, second slide");
});

test("browser ZIP preparation supports 501 documents, skips images, and preserves original bytes", async () => {
  const zip = new AdmZip();
  for (let i = 0; i < 501; i++)
    zip.addFile(`calls/call-${i}.txt`, Buffer.from(quote + " " + i));
  zip.addFile("calls/image.png.svg", Buffer.from("image"));
  const warnings: string[] = [];
  const files = await prepareDiscoveryFiles(
    [new File([new Uint8Array(zip.toBuffer())], "calls.zip")],
    (w) => warnings.push(w),
  );
  assert.equal(files.length, 501);
  assert.equal(warnings.length, 1);
  assert.equal(await files[0].text(), quote + " 0");
  assert.equal(await files.at(-1)!.text(), quote + " 99");
});
test("browser ZIP preparation rejects unsafe paths and preserves separate valid selections", async () => {
  const zip = new AdmZip();
  zip.addFile("safe/file.txt", Buffer.from(quote));
  const unsafe = Buffer.from(
    zip
      .toBuffer()
      .toString("binary")
      .replaceAll("safe/file.txt", "../x/file.txt"),
    "binary",
  );
  const warnings: string[] = [];
  const files = await prepareDiscoveryFiles(
    [
      new File([new Uint8Array(unsafe)], "unsafe.zip"),
      new File([quote], "valid.txt"),
    ],
    (w) => warnings.push(w),
  );
  assert.deepEqual(
    files.map((f) => f.name),
    ["valid.txt"],
  );
  assert.match(warnings[0], /Unsafe/);
});
test("large selections exceed the former 10 MB combined cap while individual documents remain bounded", async () => {
  const files = Array.from(
    { length: 11 },
    (_, i) => new File([new Uint8Array(1024 * 1024).fill(i)], `call-${i}.txt`),
  );
  const warnings: string[] = [];
  assert.equal(
    (await prepareDiscoveryFiles(files, (w) => warnings.push(w))).length,
    11,
  );
  assert.equal(warnings.length, 0);
});

test("large evidence aggregation preserves original IDs, disagreement and category constraints across passes", async () => {
  const {
    evidenceGroups,
    evidenceSelectionSchema,
    selectedEvidence,
    FINAL_EVIDENCE_CHARACTERS,
  } = await import("../lib/evidence-reduction");
  const original = Array.from({ length: 501 }, (_, i) => ({
    id: String(i),
    source_id: "source-" + i,
    page_index: 0,
    quote,
    problem: "A meaningful recurring customer problem ".repeat(5),
    consequence: "Delayed adoption",
    customer: "Customer " + i,
    source_start: 17,
    origin: i % 5 === 0 ? ("internal" as const) : ("customer" as const),
    stance: i % 7 === 0 ? ("opposes" as const) : ("supports" as const),
  }));
  let findings: import("../lib/opportunities").Finding[] = original;
  let passes = 0;
  while (evidenceGroups(findings).length) {
    const groups = evidenceGroups(findings);
    assert.deepEqual(groups.flat(), findings);
    findings = groups.flatMap((group) => {
      const schema = evidenceSelectionSchema(group);
      const properties = (schema.toJSONSchema() as any).properties;
      const supporting_ids = group
        .filter((f) => f.origin === "customer" && f.stance === "supports")
        .slice(0, properties.supporting_ids.maxItems)
        .map((f) => f.id);
      const opposing_ids = group
        .filter((f) => f.origin === "customer" && f.stance === "opposes")
        .slice(0, properties.opposing_ids.maxItems)
        .map((f) => f.id);
      const context_ids = group
        .filter((f) => f.origin !== "customer")
        .slice(0, properties.context_ids.maxItems)
        .map((f) => f.id);
      const selection = schema.parse({
        supporting_ids,
        opposing_ids,
        context_ids,
      });
      assert.equal(
        schema.safeParse({ ...selection, supporting_ids: ["unknown"] }).success,
        false,
      );
      return selectedEvidence(group, [
        ...selection.supporting_ids,
        ...selection.opposing_ids,
        ...selection.context_ids,
      ]);
    });
    assert.ok(++passes < 8);
  }
  assert.ok(JSON.stringify(findings).length <= FINAL_EVIDENCE_CHARACTERS);
  assert.ok(
    findings.some((f) => f.origin === "customer" && f.stance === "opposes"),
  );
  for (const finding of findings)
    assert.strictEqual(
      original.find((f) => f.id === finding.id),
      finding,
    );
  assert.throws(() => selectedEvidence(original, ["unknown"]), /verified/);
});
test("501 long calls prepare more than 1,000 durable Groq chunks without losing original offsets", async () => {
  const { prepareAnalysis } = await import("../lib/reports");
  const sources = Array.from({ length: 501 }, (_, i) => ({
    id: "source-" + i,
    filename: `call-${i}.txt`,
    role: "customer",
    pages: [
      {
        label: "Original text",
        text: ("Customer statement " + i + ". ").repeat(900),
      },
    ],
  }));
  const inputs: any[][] = [];
  const client = {
    query: async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT count(*)::int AS count,max(chunk_index)"))
        return { rows: [{ count: 0, last: null }] };
      if (sql.startsWith("SELECT * FROM discovery_reports"))
        return { rows: [{ id: "report", parent_id: null }] };
      if (sql.startsWith("SELECT s.*,rs.role")) return { rows: sources };
      if (sql.startsWith("INSERT INTO job_chunks")) {
        inputs.push(...JSON.parse(args[1]).map((row: any) => row.input));
        return { rows: [] };
      }
      throw new Error("Unexpected query in source preparation");
    },
  };
  const count = await prepareAnalysis(client as any, {
    id: "job",
    user_id: "user",
    report_id: "report",
    provider: "groq",
  });
  assert.equal(count, inputs.length);
  assert.ok(count > 1000);
  for (const input of inputs)
    for (const passage of input) {
      const source = sources.find((s) => s.id === passage.source_id)!;
      assert.equal(
        source.pages[0].text.slice(
          passage.start,
          passage.start + passage.text.length,
        ),
        passage.text,
      );
    }
});

test("dense findings shrink on every aggregation pass while retaining opposing and internal evidence", async () => {
  const {
    evidenceGroups,
    evidenceSelectionSchema,
    selectedEvidence,
    MAX_REDUCTION_LEVELS,
  } = await import("../lib/evidence-reduction");
  let findings: import("../lib/opportunities").Finding[] = Array.from(
    { length: 501 },
    (_, i) => ({
      id: String(i),
      source_id: "source-" + i,
      page_index: 0,
      quote: '"'.repeat(600),
      problem: "\\".repeat(300),
      consequence: '"'.repeat(300),
      customer: '"'.repeat(100),
      source_start: 0,
      origin: i % 3 === 2 ? "internal" : "customer",
      stance: i % 3 === 1 ? "opposes" : "supports",
    }),
  );
  let passes = 0;
  while (evidenceGroups(findings).length) {
    const before = findings.length;
    findings = evidenceGroups(findings).flatMap((group) => {
      const schema = evidenceSelectionSchema(group);
      const properties = (schema.toJSONSchema() as any).properties;
      const data = schema.parse({
        supporting_ids: group
          .filter((f) => f.origin === "customer" && f.stance === "supports")
          .slice(0, properties.supporting_ids.maxItems)
          .map((f) => f.id),
        opposing_ids: group
          .filter((f) => f.origin === "customer" && f.stance === "opposes")
          .slice(0, properties.opposing_ids.maxItems)
          .map((f) => f.id),
        context_ids: group
          .filter((f) => f.origin !== "customer" || f.stance === "context")
          .slice(0, properties.context_ids.maxItems)
          .map((f) => f.id),
      });
      return selectedEvidence(group, [
        ...data.supporting_ids,
        ...data.opposing_ids,
        ...data.context_ids,
      ]);
    });
    assert.ok(findings.length < before, "Dense aggregation must make progress");
    assert.ok(++passes <= MAX_REDUCTION_LEVELS);
  }
  assert.ok(
    findings.some((f) => f.origin === "customer" && f.stance === "opposes"),
  );
  assert.ok(findings.some((f) => f.origin === "internal"));
});

test("file fingerprints match stored source checksums and exclude filenames", async () => {
  const { discoveryFileFingerprint, uniqueSourceSelections } =
    await import("../lib/source-deduplication");
  const { createHash } = await import("node:crypto");
  for (const bytes of [
    Buffer.from(quote),
    Buffer.from("Customer — café 😀"),
    Buffer.from(Array.from({ length: 70000 }, (_, i) => i % 256)),
  ]) {
    const a = new File([new Uint8Array(bytes)], "first.txt");
    const b = new File([new Uint8Array(bytes)], "renamed.txt");
    assert.equal(
      await discoveryFileFingerprint(a),
      createHash("sha256").update(bytes.toString("base64")).digest("hex"),
    );
    assert.equal(
      await discoveryFileFingerprint(a),
      await discoveryFileFingerprint(b),
    );
  }
  assert.deepEqual(
    uniqueSourceSelections([
      { id: "same", role: "context" },
      { id: "same", role: "auto" },
      { id: "same", role: "customer" },
      { id: "other", role: "auto" },
    ]),
    [
      { id: "same", role: "context" },
      { id: "other", role: "auto" },
    ],
  );
});
test("saved and previously selected files can be reused before upload", async () => {
  const { discoveryFileFingerprint } =
    await import("../lib/source-deduplication");
  const saved = new File([quote], "already-saved.txt");
  const digest = await discoveryFileFingerprint(saved);
  const reused: string[] = [];
  const files = await prepareDiscoveryFiles(
    [
      new File([quote], "renamed-copy.txt"),
      new File([quote + " Different."], "different.txt"),
    ],
    () => {},
    () => {},
    (file, hash) => {
      if (hash === digest) {
        reused.push(file.name);
        return false;
      }
      return true;
    },
  );
  assert.deepEqual(reused, ["renamed-copy.txt"]);
  assert.deepEqual(
    files.map((f) => f.name),
    ["different.txt"],
  );
});
