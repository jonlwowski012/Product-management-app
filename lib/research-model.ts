import { createHash } from "node:crypto";
import type { Finding } from "./opportunities";

export type Company = {
  id: string;
  name: string;
  merged_into: string | null;
  research_version: number;
};
export type Conversation = {
  id: string;
  kind: "source" | "transcript";
  filename: string;
  created_at: string;
  header: string;
  fingerprint?: string;
  role: string;
  customer_id?: string;
  discovery_source_id?: string;
  company_id?: string | null;
  meeting_date?: string | null;
  version?: number;
  suggested_company?: string;
  needs_company?: boolean;
};
export type Signal = Finding & {
  key: string;
  kind: "source" | "transcript";
  company_id: string | null;
  theme: string;
  hidden: boolean;
  version: number;
  created_at: string;
  filename: string;
  meeting_date: string | null;
  verified: boolean;
};
export const nameKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
export function documentLabels(header: string) {
  const company =
    header
      .match(
        /^(?:company|organisation|organization|account)\s*:\s*([^\r\n]{1,120})$/im,
      )?.[1]
      .trim() ?? "";
  const rawDate = header.match(
    /^(?:meeting date|interview date|date)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/im,
  )?.[1];
  const date =
    rawDate &&
    !Number.isNaN(Date.parse(rawDate)) &&
    new Date(rawDate).toISOString().slice(0, 10) === rawDate
      ? rawDate
      : null;
  return { company, date };
}
export function signalKey(f: Finding, kind: string, fingerprint?: string) {
  return createHash("sha256")
    .update(
      [
        fingerprint ?? kind + "/" + f.source_id,
        f.page_index,
        f.source_start,
        f.quote,
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 32);
}
export function buildResearch(input: {
  companies: Company[];
  aliases: { name_key: string; company_id: string }[];
  sources: Conversation[];
  transcripts: Conversation[];
  findings: {
    source_id: string;
    created_at: string;
    findings: Finding[];
    extracted?: boolean;
  }[];
  legacySignals: Record<string, any>[];
  documentEdits: Record<string, any>[];
  signalEdits: Record<string, any>[];
  themeLabels?: { problem: string; theme: string }[];
}) {
  const companies = new Map(input.companies.map((c) => [c.id, c]));
  const root = (id?: string | null): string | null => {
    const seen = new Set<string>();
    while (id && companies.get(id)?.merged_into && !seen.has(id)) {
      seen.add(id);
      id = companies.get(id)!.merged_into;
    }
    return id && companies.has(id) && !seen.has(id) ? id : null;
  };
  const names = new Map(
    input.companies.map((c) => [nameKey(c.name), root(c.id)]),
  );
  for (const a of input.aliases) names.set(a.name_key, root(a.company_id));
  const documentEdits = new Map(
    input.documentEdits.map((e) => [
      e.source_id ? "source/" + e.source_id : "transcript/" + e.transcript_id,
      e,
    ]),
  );
  const signalEdits = new Map(input.signalEdits.map((e) => [e.signal_key, e]));
  const documents = new Map<string, Conversation>();
  const canonical = new Map<string, string>();
  for (const source of input.sources)
    documents.set("source/" + source.id, { ...source });
  for (const t of input.transcripts) {
    const sourceKey = "source/" + t.discovery_source_id;
    if (t.discovery_source_id && documents.has(sourceKey)) {
      canonical.set(t.id, sourceKey);
      const doc = documents.get(sourceKey)!;
      if (
        !documentEdits.has(sourceKey) &&
        documentEdits.has("transcript/" + t.id)
      )
        documentEdits.set(sourceKey, {
          ...documentEdits.get("transcript/" + t.id),
          version: 0,
        });
      if (!doc.customer_id) doc.customer_id = t.customer_id;
    } else {
      canonical.set(t.id, "transcript/" + t.id);
      documents.set("transcript/" + t.id, { ...t });
    }
  }
  const findingNames = new Map(
    input.findings.map((r) => [
      r.source_id,
      [
        ...new Set(
          r.findings
            .filter(
              (f) =>
                f.origin === "customer" &&
                f.customer &&
                !/^(customer(?: in source)?|unknown|uncertain|anonymous|interviewee|participant|speaker)(?: \d+)?$/i.test(
                  f.customer.trim(),
                ),
            )
            .map((f) => f.customer),
        ),
      ],
    ]),
  );
  for (const [key, doc] of documents) {
    const edit = documentEdits.get(key);
    const labels = documentLabels(doc.header ?? "");
    const candidates = findingNames.get(doc.id) ?? [];
    const known = [
      ...new Set(candidates.map((n) => names.get(nameKey(n))).filter(Boolean)),
    ];
    doc.company_id = edit
      ? root(edit.company_id)
      : (root(doc.customer_id) ??
        names.get(nameKey(labels.company)) ??
        (known.length === 1 ? known[0] : null));
    doc.meeting_date = edit ? edit.meeting_date : labels.date;
    doc.version = edit?.version ?? 0;
    doc.suggested_company =
      labels.company || (candidates.length === 1 ? candidates[0] : "");
    doc.needs_company = !doc.company_id && doc.role !== "context";
  }
  const linkedThemes = new Map(
    input.legacySignals
      .filter((s) => s.theme)
      .map((s) => [s.id, s.theme as string]),
  );
  const reportThemes = new Map(
    (input.themeLabels ?? []).map((t) => [nameKey(t.problem), t.theme]),
  );
  const signals = new Map<string, Signal>();
  const add = (
    f: Finding,
    key: string,
    created: string,
    verified = true,
    hidden = false,
  ) => {
    const doc = documents.get(key);
    if (!doc || doc.role === "context" || f.origin === "internal") return;
    const sourceFinding = { ...f, source_id: doc.id };
    const skey = signalKey(sourceFinding, doc.kind, doc.fingerprint);
    if (signals.has(skey)) return;
    const edit = signalEdits.get(skey);
    const companyId = edit?.company_override
      ? root(edit.company_id)
      : (doc.company_id ?? null);
    signals.set(skey, {
      ...sourceFinding,
      key: skey,
      kind: doc.kind,
      company_id: companyId,
      // Reuse saved synthesis groupings; manual corrections remain authoritative.
      theme:
        edit?.theme ||
        linkedThemes.get(f.id) ||
        reportThemes.get(nameKey(f.problem)) ||
        f.problem ||
        "Other feedback",
      hidden: edit?.hidden ?? hidden,
      version: edit?.version ?? 0,
      created_at: created,
      filename: doc.filename,
      meeting_date: doc.meeting_date ?? null,
      verified,
    });
  };
  for (const row of input.findings)
    for (const f of row.findings)
      add(f, "source/" + row.source_id, row.created_at);
  const extracted = new Set(
    input.findings
      .filter((r) => r.extracted)
      .map((r) => "source/" + r.source_id),
  );
  for (const s of input.legacySignals) {
    const key = canonical.get(s.transcript_id);
    if (!key || extracted.has(key)) continue;
    add(
      {
        id: s.id,
        source_id: s.transcript_id,
        page_index: 0,
        source_start: s.source_start ?? 0,
        quote: s.quote,
        problem: s.title,
        consequence: "",
        customer: "",
        origin: "customer",
        stance:
          s.sentiment === "against"
            ? "opposes"
            : s.sentiment === "for"
              ? "supports"
              : "context",
        source_label: s.timestamp ? "At " + s.timestamp : "Original text",
      },
      key,
      s.created_at,
      s.verified,
      s.review === "dismissed",
    );
  }
  const allSignals = [...signals.values()].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || a.key.localeCompare(b.key),
  );
  const conversations = [...documents.values()]
    .filter((d) => d.role !== "context")
    .map(({ header: _header, ...doc }) => doc);
  const conversationsByKey = new Map(
    conversations.map((d) => [d.kind + "/" + d.id, d]),
  );
  const companyDocuments = new Map<string, Set<string>>();
  const visibleSignals = new Map<string, number>();
  const link = (company: string, key: string) => {
    const keys = companyDocuments.get(company) ?? new Set<string>();
    keys.add(key);
    companyDocuments.set(company, keys);
  };
  for (const d of conversations)
    if (d.company_id) link(d.company_id, d.kind + "/" + d.id);
  for (const s of allSignals)
    if (s.company_id && !s.hidden) {
      link(s.company_id, s.kind + "/" + s.source_id);
      visibleSignals.set(
        s.company_id,
        (visibleSignals.get(s.company_id) ?? 0) + 1,
      );
    }
  const companyRows = input.companies
    .filter((c) => !c.merged_into)
    .map((c) => {
      const docs = [...(companyDocuments.get(c.id) ?? [])].flatMap((key) => {
        const doc = conversationsByKey.get(key);
        return doc ? [doc] : [];
      });
      const dates = docs
        .flatMap((d) => (d.meeting_date ? [d.meeting_date] : []))
        .sort();
      return {
        ...c,
        conversations: docs.length,
        last_conversation: dates.at(-1) ?? null,
        missing_dates: docs.filter((d) => !d.meeting_date).length,
        signals: visibleSignals.get(c.id) ?? 0,
      };
    })
    .filter((c) => c.conversations || c.signals)
    .sort(
      (a, b) =>
        (b.last_conversation ?? "").localeCompare(a.last_conversation ?? "") ||
        a.name.localeCompare(b.name),
    );
  return {
    companies: companyRows,
    choices: input.companies.filter((c) => !c.merged_into),
    conversations,
    signals: allSignals,
    root,
    companyDocuments,
  };
}
export function researchThemes(signals: Signal[]) {
  const groups = new Map<
    string,
    {
      name: string;
      signals: number;
      companies: Set<string>;
      supporting: number;
      opposing: number;
      context: number;
      risks: number;
    }
  >();
  for (const s of signals.filter((s) => !s.hidden)) {
    const key = nameKey(s.theme);
    const group = groups.get(key) ?? {
      name: s.theme,
      signals: 0,
      companies: new Set<string>(),
      supporting: 0,
      opposing: 0,
      context: 0,
      risks: 0,
    };
    group.signals++;
    if (
      s.company_id &&
      s.origin === "customer" &&
      s.verified &&
      s.stance !== "risk"
    )
      group.companies.add(s.company_id);
    if (s.stance === "opposes") group.opposing++;
    if (s.stance === "supports") group.supporting++;
    if (s.stance === "context") group.context++;
    if (s.stance === "risk") group.risks++;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, companies: g.companies.size }))
    .sort(
      (a, b) =>
        b.companies - a.companies ||
        b.signals - a.signals ||
        a.name.localeCompare(b.name),
    );
}
