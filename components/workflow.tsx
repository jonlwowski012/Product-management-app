"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Layers3,
  ArrowRight,
  Plus,
  Upload,
  FileText,
  X,
  Check,
  ChevronDown,
  Sparkles,
  Settings,
  LogOut,
  ArrowLeft,
  Download,
  Copy,
  LoaderCircle,
} from "lucide-react";
import { importDiscoveryFiles, type ImportProgress } from "./discovery-import";
import {
  MAX_DISCOVERY_FILES,
  MAX_DISCOVERY_BYTES,
} from "@/lib/discovery-limits";
import { AppLink, DownloadLink, request, Modal, Field } from "./ui";
import { DemoWelcome } from "./demo";
import { SettingsPage } from "./settings";
import { ValidationWork, EarlierValidationWork } from "./validation-work";
import { ResearchPage, type SourceSelection } from "./research";
import type { Finding, OpportunityReport } from "@/lib/opportunities";
import { reportMarkdown } from "@/lib/opportunities";
import {
  discoveryFileFingerprint,
  uniqueSourceSelections,
} from "@/lib/source-deduplication";
import { providerName } from "@/lib/providers";
import {
  droppedDiscoveryFiles,
  prepareDiscoveryFiles,
} from "./discovery-files";

type Row = Record<string, any>;
type Selection = { id: string; role: string };
function recoveryHelp(message: string) {
  if (/credits|billing|spending|allowance/i.test(message))
    return "Check your provider's usage or billing before retrying.";
  if (/key|access|401|403/i.test(message))
    return "Check your connection in Settings before retrying.";
  if (/large|token limit|quotable|OCR/i.test(message))
    return "Review the document text or use a smaller readable document.";
  return "Retry this omitted material after checking the analysis connection; successful sources are preserved.";
}
export function WorkflowApp({
  renderAuth,
}: {
  renderAuth: (onSuccess: () => Promise<void>) => ReactNode;
}) {
  const pathname = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const demo = pathname === "/demo" || pathname.startsWith("/demo/");
  const base = demo ? "/demo" : "";
  const workspacePath = demo ? pathname.slice(5) || "/" : pathname;
  const isSettings = workspacePath === "/settings";
  const isResearch = /^\/(customers|signals)(\/|$)/.test(workspacePath);
  const isDiscovery = !isSettings && !isResearch;
  const reportId = pathname.match(/\/reports\/([^/]+)/)?.[1];
  const [meta, setMeta] = useState<Row | null>(null),
    [report, setReport] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [signedOut, setSignedOut] = useState(false),
    [error, setError] = useState("");
  const [composing, setComposing] = useState(false),
    [question, setQuestion] = useState(""),
    [notes, setNotes] = useState(""),
    [notesRole, setNotesRole] = useState("auto"),
    [files, setFiles] = useState<File[]>([]),
    [roles, setRoles] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<Selection[]>([]),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState("");
  const [source, setSource] = useState<SourceSelection | null>(null),
    [editing, setEditing] = useState<number | null>(null),
    [copied, setCopied] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const warningRef = useRef<string[]>([]);
  const formatBytes = (bytes: number) =>
    bytes < 1048576
      ? `${Math.ceil(bytes / 1024).toLocaleString()} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [visibleFiles, setVisibleFiles] = useState(25);
  const [visibleSources, setVisibleSources] = useState(50);
  const importAbort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const m = await request("flow");
    setMeta(m);
    setSignedOut(false);
    return m;
  }, []);
  async function refreshReport() {
    if (report) setReport(await request("reports/" + report.id));
  }
  useEffect(() => {
    let collapsed: HTMLDetailsElement[] = [];
    const beforePrint = () => {
      collapsed = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          ".flow-main details:not([open])",
        ),
      );
      collapsed.forEach((detail) => {
        detail.open = true;
      });
    };
    const afterPrint = () => {
      collapsed.forEach((detail) => {
        detail.open = false;
      });
      collapsed = [];
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      afterPrint();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    setEditing(null);
    void (async () => {
      try {
        const m = await request("flow");
        if (!active) return;
        setMeta(m);
        setSignedOut(false);
        const rid = !isDiscovery
          ? null
          : (reportId ?? (!params.has("new") ? m.reports[0]?.id : null));
        const r = rid ? await request("reports/" + rid) : null;
        if (!active) return;
        setReport(r);
        warningRef.current = r?.import_warnings ?? [];
        setWarnings(warningRef.current);
        setComposing(isDiscovery && !r);
        setSelected([]);
        setNotes("");
        setFiles([]);
        setRoles({});
        setQuestion(r?.question ?? "");
      } catch (e) {
        if (!active) return;
        if ((e as Error).message === "Sign in to continue") {
          setSignedOut(true);
          setMeta(null);
        } else setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, params, reportId, isDiscovery]);
  useEffect(() => {
    if (!report?.job || !["queued", "processing"].includes(report.job.state))
      return;
    let active = true;
    const timer = setInterval(() => {
      void request("reports/" + report.id)
        .then((r) => {
          if (active) {
            setReport(r);
            if (r.result) void refresh().catch(() => {});
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 1600);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [report?.id, report?.job?.state, refresh]);
  function warn(message: string) {
    warningRef.current = [...warningRef.current, message.slice(0, 1000)];
    setWarnings(warningRef.current);
  }
  async function addFiles(incoming: File[]) {
    setBusy(true);
    setStage("Preparing files…");
    setError("");
    setImportProgress(null);
    try {
      const existing = new Map<string, string>();
      for (const file of files)
        existing.set(await discoveryFileFingerprint(file), file.name);
      const saved = new Map<string, Row>(
        (meta?.sources ?? []).map((source: Row) => [source.sha256, source]),
      );
      const reused: Selection[] = [];
      const prepared = await prepareDiscoveryFiles(
        incoming,
        warn,
        (count) =>
          setStage(
            `Checking duplicates · ${count.toLocaleString()} documents ready`,
          ),
        (file, fingerprint) => {
          const previous = existing.get(fingerprint);
          if (previous) {
            warn(
              `Skipped duplicate ${file.name}: identical content to ${previous}.`,
            );
            return false;
          }
          const source = saved.get(fingerprint);
          if (source) {
            reused.push({ id: source.id, role: source.role ?? "auto" });
            warn(
              `Reused saved source ${source.filename}; duplicate ${file.name} was not uploaded.`,
            );
            return false;
          }
          existing.set(fingerprint, file.name);
          return true;
        },
      );
      const next = [...files, ...prepared];
      if (next.length > MAX_DISCOVERY_FILES)
        throw new Error("Import at most 1,000 documents at a time.");
      if (next.reduce((n, f) => n + f.size, 0) > MAX_DISCOVERY_BYTES)
        throw new Error("Combined files must be smaller than 500 MB.");
      setFiles(next);
      setSelected((current) => uniqueSourceSelections([...current, ...reused]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const sources = [...selected];
    setImportProgress(null);
    try {
      const readiness = await request("flow");
      setMeta(readiness);
      if (readiness.analysisReady === false)
        throw new Error(readiness.analysisReadiness);
      if (!files.length && notes.trim().length < 5 && !sources.length)
        throw new Error(
          "Add a file, paste at least five characters, or select a saved source.",
        );
      setStage("Importing documents…");
      if (files.length) {
        const controller = new AbortController();
        importAbort.current = controller;
        const imported = await importDiscoveryFiles(
          files,
          roles,
          meta?.uploadMode === "blob",
          controller.signal,
          setImportProgress,
          (saved) =>
            setSelected((current) =>
              uniqueSourceSelections([...current, ...saved]),
            ),
          warn,
        );
        importAbort.current = null;
        sources.push(...imported.sources);
        const remaining = files
          .map((file, index) => ({ file, index }))
          .filter(({ index }) => !imported.successful.has(index));
        setFiles(remaining.map(({ file }) => file));
        setRoles(
          Object.fromEntries(
            remaining.map(({ index }, i) => [
              i,
              roles[String(index)] ?? "auto",
            ]),
          ),
        );
        if (imported.cancelled) {
          warn(
            "Import cancelled. Completed documents are saved; remaining files can be retried.",
          );
          await refresh();
          return;
        }
      }
      if (notes.trim().length >= 5) {
        const out = await request("sources", {
          filename: "Customer notes.txt",
          content: notes,
        });
        for (const s of out.sources)
          sources.push({ id: s.id, role: notesRole });
      }
      const unique = uniqueSourceSelections(sources);
      setSelected(unique);
      if (!unique.length)
        throw new Error(
          "No documents could be imported. Review the warnings and try again.",
        );
      if (unique.length > MAX_DISCOVERY_FILES)
        throw new Error(
          "Select at most 1,000 documents per analysis. Imported documents are saved.",
        );
      setStage("Starting analysis…");
      const result = await request("reports", {
        question,
        product_context: report?.product_context ?? "",
        sources: unique,
        import_warnings:
          warningRef.current.length > 1000
            ? [
                ...warningRef.current.slice(0, 1000),
                `${warningRef.current.length - 1000} additional files were skipped.`,
              ]
            : warningRef.current,
        parent_id: report?.result ? report.id : null,
      });
      setNotes("");
      setFiles([]);
      setRoles({});
      setComposing(false);
      await refresh();
      router.push(base + "/reports/" + result.id);
      // A cached report can resolve to the current URL without a navigation.
      setReport(await request("reports/" + result.id));
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  const result = report?.result as OpportunityReport | undefined;
  if (loading)
    return (
      <div className="loading">
        <Layers3 size={30} />
        <p>Opening your discovery workspace…</p>
      </div>
    );
  if (signedOut)
    return demo ? (
      <DemoWelcome />
    ) : (
      renderAuth(async () => {
        const m = await request("flow");
        const rid = !isDiscovery
          ? null
          : (reportId ?? (!params.has("new") ? m.reports[0]?.id : null));
        const r = rid ? await request("reports/" + rid) : null;
        setMeta(m);
        setReport(r);
        setQuestion(r?.question ?? "");
        setComposing(isDiscovery && !r);
        setSignedOut(false);
        setLoading(false);
      })
    );
  if (!meta)
    return (
      <div className="loading">
        <p role="alert">{error}</p>
        <button
          className="button secondary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  function citations(
    ids: string[],
    reasons: { finding_id: string; reason: string }[] = [],
  ) {
    return ids.map((fid) => {
      const f = result?.findings.find((f) => f.id === fid);
      if (!f) return null;
      const s = report?.sources.find((s: Row) => s.id === f.source_id);
      return (
        <div className="flow-citation" key={fid}>
          <blockquote>“{f.quote}”</blockquote>
          <button
            className="text-link"
            onClick={() =>
              setSource({
                id: f.source_id,
                page: f.page_index,
                quote: f.quote,
                start: f.source_start,
              })
            }
          >
            {s?.filename ?? "Source"} · {f.source_label ?? "source passage"}{" "}
            <ArrowRight size={13} />
          </button>
          <small>
            {f.origin === "internal"
              ? "Company context"
              : f.origin === "uncertain"
                ? "Attribution needs review"
                : f.customer
                  ? "AI attribution: " + f.customer
                  : "Customer attribution needs review"}
          </small>
          {reasons.find((r) => r.finding_id === fid) && (
            <p className="flow-evidence-reason">
              <strong>Relationship to this opportunity:</strong>{" "}
              {reasons.find((r) => r.finding_id === fid)!.reason}
            </p>
          )}
        </div>
      );
    });
  }
  return (
    <div className="flow-shell">
      <header className="flow-header">
        <AppLink href="/" className="brand">
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          evidence<span className="brand-dot">.</span>
        </AppLink>
        <nav aria-label="Workspace navigation">
          <AppLink href="/?new=1" className="button secondary small-button">
            <Plus size={15} /> New discovery
          </AppLink>
          <label className="flow-history">
            <span className="sr-only">Report history</span>
            <select
              aria-label="Report history"
              value={report?.id ?? ""}
              onChange={(e) => {
                if (e.target.value)
                  router.push(base + "/reports/" + e.target.value);
              }}
            >
              <option value="" disabled>
                Report history
              </option>
              {meta.reports.map((r: Row) => (
                <option key={r.id} value={r.id}>
                  {r.question || "Discovery opportunities"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <AppLink
            href="/settings"
            className="icon-button"
            aria-label="Settings"
          >
            <Settings size={19} />
          </AppLink>
          <button
            className="icon-button"
            aria-label={demo ? "Exit demo" : "Sign out"}
            onClick={async () => {
              await request("auth/logout", {});
              window.location.assign(demo ? "/" : "/");
            }}
          >
            <LogOut size={19} />
          </button>
        </nav>
      </header>
      <nav className="flow-tabs" aria-label="Primary navigation">
        <AppLink href="/" aria-current={isDiscovery ? "page" : undefined}>
          Discovery
        </AppLink>
        <AppLink
          href="/customers"
          aria-current={
            workspacePath.startsWith("/customers") ? "page" : undefined
          }
        >
          Customers
        </AppLink>
        <AppLink
          href="/signals"
          aria-current={
            workspacePath.startsWith("/signals") ? "page" : undefined
          }
        >
          Signals
        </AppLink>
      </nav>
      <main className="flow-main">
        {demo && (
          <div className="flow-demo" aria-label="Demo workspace notice">
            <span>
              <strong>Sample workspace</strong> · Fictional data · Read only ·
              Prerecorded AI
            </span>
            <a className="text-link" href="/">
              Create my workspace <ArrowRight size={14} />
            </a>
          </div>
        )}
        {error && (
          <div className="flow-error" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {isResearch ? (
          <ResearchPage
            key={pathname + "?" + params.toString()}
            demo={demo}
            openSource={setSource}
          />
        ) : isSettings ? (
          <SettingsPage data={meta} refresh={refresh} />
        ) : (
          <>
            {warnings.length > 0 && (
              <aside
                className="flow-warnings"
                role="status"
                aria-label="Import warnings"
              >
                <strong>
                  {warnings.length} import warning
                  {warnings.length === 1 ? "" : "s"}. Supported documents will
                  continue.
                </strong>
                <details>
                  <summary>Review skipped files</summary>
                  <ul>
                    {warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </details>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    warningRef.current = [];
                    setWarnings([]);
                  }}
                >
                  Dismiss warnings
                </button>
              </aside>
            )}
            {!!report?.analysis_warnings?.length && !result && (
              <aside
                className="flow-warnings"
                role="status"
                aria-label="Analysis warnings"
              >
                <strong>
                  {report.analysis_warnings.length} source batch(es) could not
                  be analyzed.
                  {result
                    ? " This report uses the remaining material."
                    : " Other documents will continue processing."}
                </strong>
                <details>
                  <summary>Review omitted material</summary>
                  <ul>
                    {report.analysis_warnings.map(
                      (
                        warning: NonNullable<
                          OpportunityReport["analysis_warnings"]
                        >[number],
                      ) => (
                        <li key={warning.batch}>
                          Batch {warning.batch} ({warning.filenames.join(", ")}
                          ): {warning.message} This batch was omitted.
                        </li>
                      ),
                    )}
                  </ul>
                </details>
              </aside>
            )}
            {busy && (
              <section
                className="flow-import-progress"
                aria-label="Import status"
                aria-live="polite"
              >
                <strong>{stage}</strong>
                {importProgress ? (
                  <>
                    <progress
                      aria-label="Import progress"
                      max={100}
                      value={Math.round(importProgress.fraction * 100)}
                    />
                    <p>
                      {importProgress.completed.toLocaleString()} of{" "}
                      {importProgress.total.toLocaleString()} files processed ·{" "}
                      {Math.round(importProgress.fraction * 100)}%
                    </p>
                    <p>
                      {importProgress.saved.toLocaleString()} saved ·{" "}
                      {importProgress.duplicates.toLocaleString()} duplicates
                      reused · {importProgress.failed.toLocaleString()} skipped
                      · {formatBytes(importProgress.uploadedBytes)} of{" "}
                      {formatBytes(importProgress.totalBytes)} uploaded
                    </p>
                    {importProgress.active.length > 0 && (
                      <small>
                        Processing: {importProgress.active.join(", ")}
                      </small>
                    )}
                  </>
                ) : (
                  <progress aria-label="Preparing files" />
                )}
                <small>
                  Keep this tab open until importing finishes. Analysis
                  continues in the background afterward.
                </small>
                {importAbort.current && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => importAbort.current?.abort()}
                  >
                    Cancel import
                  </button>
                )}
              </section>
            )}
            {composing && (
              <section className="flow-composer">
                <div className="flow-intro">
                  <span className="eyebrow">LESS SORTING. MORE DISCOVERY.</span>
                  <h1>
                    {report
                      ? "What have you learned since?"
                      : "Turn customer conversations into product opportunities."}
                  </h1>
                  <p>
                    Add your customer conversations and documents. Get the
                    strongest opportunities, the evidence on both sides, and
                    what to validate next.
                  </p>
                </div>
                <ol className="flow-steps" aria-label="Discovery steps">
                  <li>
                    <span>1</span> Upload transcripts
                  </li>
                  <li>
                    <span>2</span> Find opportunities
                  </li>
                  <li>
                    <span>3</span> Get a next step
                  </li>
                </ol>
                {!demo && (
                  <aside
                    className={
                      "flow-readiness" +
                      (meta.analysisReady === false ? " needs-attention" : "")
                    }
                    aria-label="Analysis readiness"
                  >
                    <strong>
                      {meta.analysisReady === false
                        ? "Analysis needs setup"
                        : "Ready to analyze"}
                    </strong>
                    <p>{meta.analysisReadiness}</p>
                    {meta.analysisReady === false && (
                      <AppLink href="/settings" className="text-link">
                        Open Settings
                      </AppLink>
                    )}
                  </aside>
                )}
                <form onSubmit={analyze} className="flow-input">
                  <fieldset disabled={busy || demo}>
                    <Field
                      label="What are you trying to learn?"
                      hint="Optional. Leave blank to discover the strongest recurring problems."
                    >
                      <input
                        value={question}
                        maxLength={500}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Which onboarding problems should we solve first?"
                      />
                    </Field>
                    <div
                      className="flow-drop"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        if (busy || demo) return;
                        setBusy(true);
                        setStage("Scanning files and folders…");
                        try {
                          await addFiles(
                            await droppedDiscoveryFiles(
                              Array.from(e.dataTransfer.items),
                              Array.from(e.dataTransfer.files),
                              warn,
                              (count) =>
                                setStage(
                                  `Scanning folder · ${count.toLocaleString()} entries checked`,
                                ),
                            ),
                          );
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusy(false);
                          setStage("");
                        }
                      }}
                    >
                      <Upload size={27} />
                      <strong>Drop your discovery material here</strong>
                      <span>
                        Files, ZIPs, or folders of transcripts and documents
                      </span>
                      <div className="button-row">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => input.current?.click()}
                        >
                          Choose files
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => folderInput.current?.click()}
                        >
                          Choose folder
                        </button>
                      </div>
                      <input
                        ref={input}
                        type="file"
                        multiple
                        accept=".txt,.md,.markdown,.vtt,.srt,.pdf,.docx,.pptx,.zip"
                        aria-label="Discovery files"
                        className="sr-only"
                        onChange={(e) => {
                          void addFiles(Array.from(e.target.files ?? []));
                          e.target.value = "";
                        }}
                      />
                      <input
                        ref={folderInput}
                        type="file"
                        multiple
                        {...{ webkitdirectory: "" }}
                        aria-label="Discovery folder"
                        className="sr-only"
                        onChange={(e) => {
                          void addFiles(Array.from(e.target.files ?? []));
                          e.target.value = "";
                        }}
                      />
                      <small>
                        Up to 1,000 documents · 500 MB combined · 10 MB per
                        document · TXT, Markdown, VTT, SRT, PDF, DOCX, PPTX · No
                        audio or video; scanned files need OCR
                      </small>
                    </div>
                    {files.length > 0 && (
                      <div className="flow-files">
                        <p>
                          {files.length.toLocaleString()} documents selected ·{" "}
                          {(
                            files.reduce((n, f) => n + f.size, 0) / 1048576
                          ).toFixed(1)}{" "}
                          MB
                        </p>
                        {files.slice(0, visibleFiles).map((f, i) => (
                          <div className="flow-file" key={i}>
                            <FileText size={17} />
                            <span>{f.name}</span>
                            <select
                              aria-label={"Source type for " + f.name}
                              value={roles[String(i)] ?? "auto"}
                              onChange={(e) =>
                                setRoles({ ...roles, [i]: e.target.value })
                              }
                            >
                              <option value="auto">
                                Identify automatically
                              </option>
                              <option value="customer">
                                Customer material
                              </option>
                              <option value="context">Company context</option>
                            </select>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={"Remove " + f.name}
                              onClick={() => {
                                setFiles(files.filter((_, n) => n !== i));
                                setRoles(
                                  Object.fromEntries(
                                    Object.entries(roles)
                                      .filter(([k]) => Number(k) !== i)
                                      .map(([k, v]) => [
                                        Number(k) > i ? Number(k) - 1 : k,
                                        v,
                                      ]),
                                  ),
                                );
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        {files.length > visibleFiles && (
                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => setVisibleFiles((n) => n + 25)}
                          >
                            Show more files ({files.length - visibleFiles}{" "}
                            remaining)
                          </button>
                        )}
                      </div>
                    )}
                    <Field label="Or paste customer notes">
                      <textarea
                        rows={4}
                        value={notes}
                        maxLength={500000}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Paste a transcript, interview notes, or customer feedback. No special formatting needed."
                      />
                    </Field>
                    {notes && (
                      <Field label="Notes source type">
                        <select
                          value={notesRole}
                          onChange={(e) => setNotesRole(e.target.value)}
                        >
                          <option value="auto">Identify automatically</option>
                          <option value="customer">Customer material</option>
                          <option value="context">Company context</option>
                        </select>
                      </Field>
                    )}
                    {selected.length > 0 && (
                      <section
                        className="flow-saved"
                        aria-label="Included sources"
                      >
                        <h2>Included sources ({selected.length})</h2>
                        <p>
                          These saved documents will be included in this
                          analysis.
                        </p>
                        {selected.slice(0, visibleSources).map((item) => (
                          <div className="flow-file" key={item.id}>
                            <FileText size={17} />
                            <span>
                              {meta.sources.find((s: Row) => s.id === item.id)
                                ?.filename ?? "Saved document"}
                            </span>
                            <select
                              aria-label={
                                "Source type for saved " +
                                (meta.sources.find((s: Row) => s.id === item.id)
                                  ?.filename ?? "document")
                              }
                              value={item.role}
                              onChange={(e) =>
                                setSelected(
                                  selected.map((s) =>
                                    s.id === item.id
                                      ? { ...s, role: e.target.value }
                                      : s,
                                  ),
                                )
                              }
                            >
                              <option value="auto">
                                Identify automatically
                              </option>
                              <option value="customer">
                                Customer material
                              </option>
                              <option value="context">Company context</option>
                            </select>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={
                                "Remove saved " +
                                (meta.sources.find((s: Row) => s.id === item.id)
                                  ?.filename ?? "document")
                              }
                              onClick={() =>
                                setSelected(
                                  selected.filter((s) => s.id !== item.id),
                                )
                              }
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        {selected.length > visibleSources && (
                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => setVisibleSources((n) => n + 50)}
                          >
                            Show more included sources
                          </button>
                        )}
                      </section>
                    )}
                    <div className="flow-submit">
                      <button
                        className="button primary"
                        disabled={busy || demo || meta.analysisReady === false}
                        type="submit"
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={18} />
                        ) : (
                          <Sparkles size={18} />
                        )}{" "}
                        {busy
                          ? stage
                          : report
                            ? "Update opportunities"
                            : "Find opportunities"}
                        <ArrowRight size={17} />
                      </button>
                      {!report && !demo && (
                        <a href="/demo" className="text-link">
                          Try with sample data
                        </a>
                      )}
                      {report && (
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => setComposing(false)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    <p className="flow-reassurance">
                      Analysis sends source text to{" "}
                      {providerName(meta.analysisProvider)}. Company context
                      stays separate from customer evidence.
                    </p>
                    {!meta.hasOwnKey && !demo && (
                      <p className="flow-allowance">
                        <AppLink href="/settings">
                          Connect your own API key in Settings
                        </AppLink>
                        . AI usage is billed directly by your provider,
                        separately from Evidence’s $10/month subscription.
                      </p>
                    )}
                  </fieldset>
                </form>
              </section>
            )}
            {!composing && report && !result && (
              <section className="flow-progress" aria-live="polite">
                <div className="flow-progress-icon">
                  {report.job?.state === "failed" ? (
                    <FileText size={30} />
                  ) : (
                    <LoaderCircle size={30} className="spin" />
                  )}
                </div>
                <span className="eyebrow">FROM SOURCES TO OPPORTUNITIES</span>
                <p className="flow-analysis-label" role="status">
                  {report.job?.state === "failed"
                    ? "Needs attention"
                    : "Analyzing"}
                </p>
                <h1>
                  {report.job?.state === "failed"
                    ? "Your analysis needs attention"
                    : report.recovery_of
                      ? "Retrying omitted material…"
                      : report.job?.total &&
                          report.job.completed === report.job.total
                        ? report.job.reduction_total >
                          report.job.reduction_completed
                          ? "Organizing the evidence…"
                          : "Preparing your report…"
                        : "Finding recurring problems…"}
                </h1>
                <p>
                  {report.job?.state === "failed"
                    ? report.job.error
                    : "You can leave this page. Your report will be saved here when it is ready."}
                </p>
                {report.recovery_of && (
                  <p>
                    Your earlier report and validation work are saved.{" "}
                    <AppLink
                      href={"/reports/" + report.recovery_of}
                      className="text-link"
                    >
                      Open the previous report
                    </AppLink>
                  </p>
                )}
                {report.job?.state !== "failed" && report.job?.error && (
                  <p>
                    {report.job.error} Your completed source batches are saved
                    while the provider retries.
                  </p>
                )}
                {report.job?.total > 0 && (
                  <>
                    <p>
                      {report.job.completed.toLocaleString()} of{" "}
                      {report.job.total.toLocaleString()} source batches
                      processed
                    </p>
                    {report.job.completed < report.job.total ? (
                      <>
                        <span className="flow-progress-steps">
                          Step 1 of 3 · Reading sources ·{" "}
                          {Math.round(
                            (report.job.completed / report.job.total) * 100,
                          )}
                          %
                        </span>
                        <progress
                          aria-label="Source analysis progress"
                          max={report.job.total}
                          value={report.job.completed}
                        />
                      </>
                    ) : report.job.reduction_total >
                      report.job.reduction_completed ? (
                      <>
                        <span className="flow-progress-steps">
                          Step 2 of 3 · Organizing evidence · Pass{" "}
                          {report.job.reduction_pass}
                        </span>
                        <progress
                          aria-label="Evidence aggregation progress"
                          max={report.job.reduction_total}
                          value={report.job.reduction_completed}
                        />
                        <p>
                          {report.job.reduction_completed} of{" "}
                          {report.job.reduction_total} evidence groups saved
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="flow-progress-steps">
                          Step 3 of 3 · Preparing report
                        </span>
                        <progress aria-label="Preparing report" />
                      </>
                    )}
                  </>
                )}
                <div className="button-row">
                  {report.job?.state === "failed" && (
                    <button
                      className="button primary"
                      disabled={busy || demo || !report.job.can_retry}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await request("reports/" + report.id + "/retry", {});
                          setReport(await request("reports/" + report.id));
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Retry analysis
                    </button>
                  )}
                  <button
                    className="button secondary"
                    onClick={() => {
                      setComposing(true);
                      setSelected(
                        report.sources.map((s: Row) => ({
                          id: s.id,
                          role: s.role,
                        })),
                      );
                    }}
                  >
                    Review sources
                  </button>
                </div>
                <EarlierValidationWork
                  report={report}
                  saved={refreshReport}
                  demo={demo}
                />
              </section>
            )}
            {result && !composing && (
              <section className="flow-report">
                <div className="flow-report-heading">
                  <div>
                    <span className="eyebrow">
                      YOUR NEXT PRODUCT OPPORTUNITIES
                    </span>
                    <h1>Your discovery opportunities</h1>
                    {report?.question && <p>{report.question}</p>}
                  </div>
                  <button
                    className="button secondary"
                    disabled={demo}
                    onClick={() => {
                      setSelected(
                        report!.sources.map((s: Row) => ({
                          id: s.id,
                          role: s.role,
                        })),
                      );
                      setComposing(true);
                    }}
                  >
                    {" "}
                    <Plus size={16} /> Add more material
                  </button>
                </div>
                <div className="flow-summary">
                  <span className="flow-draft">
                    {demo
                      ? "Prerecorded sample"
                      : "AI draft · review interpretations"}
                  </span>
                  <div
                    className={
                      "flow-analysis-status " + report!.analysis_status
                    }
                    role="status"
                    aria-label="Analysis status"
                  >
                    <strong>
                      {report!.analysis_status === "partial"
                        ? "Partial analysis"
                        : report!.analysis_status === "needs_attention"
                          ? "Needs attention"
                          : report!.analysis_status === "analyzing"
                            ? "Analyzing"
                            : report!.analysis_status === "coverage_unknown"
                              ? "Coverage not recorded"
                              : "Complete"}
                    </strong>
                    {result.coverage ? (
                      <span>
                        {result.coverage.analyzed_sources ?? "Unknown number"}{" "}
                        of {result.coverage.sources} sources fully analyzed
                      </span>
                    ) : (
                      <span>
                        Coverage was not recorded for this saved report.
                      </span>
                    )}
                  </div>
                  {report!.analysis_status === "partial" && (
                    <div className="flow-recovery">
                      <p>
                        Some material is missing from this draft. Review the
                        omitted files before relying on its conclusions.
                      </p>
                      {report!.can_recover && !demo && (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              const next = await request(
                                "reports/" + report!.id + "/retry-omitted",
                                {},
                              );
                              await refresh();
                              router.push(base + "/reports/" + next.id);
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Retry omitted material
                        </button>
                      )}
                      <small>
                        Recovery reuses successful work and keeps this report.
                        Your provider may charge for retried material.
                      </small>
                      {report!.recovery_attempts >= 3 && (
                        <p>
                          Three recovery attempts have been used. Check the
                          omitted files and your connection in Settings before
                          starting a new discovery.
                        </p>
                      )}
                      {!!report!.analysis_warnings?.length && (
                        <details aria-label="Analysis warnings">
                          <summary>Review omitted material</summary>
                          <ul>
                            {report!.analysis_warnings.map((w: Row) => (
                              <li key={w.batch}>
                                <strong>{w.filenames.join(", ")}</strong>:{" "}
                                {w.message} {recoveryHelp(w.message)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                  <details className="flow-summary-detail">
                    <summary>Read the analysis summary</summary>
                    <p>{result.summary}</p>
                  </details>
                  {result.coverage && (
                    <small>
                      {result.coverage.analyzed_sources ??
                        result.coverage.sources}{" "}
                      of {result.coverage.sources.toLocaleString()} sources were
                      fully analyzed. This report uses{" "}
                      {result.coverage.selected_findings.toLocaleString()}{" "}
                      representative passages selected from{" "}
                      {result.coverage.verified_findings.toLocaleString()}{" "}
                      source-matched findings. These examples are not a count of
                      customer demand.
                    </small>
                  )}
                  <div className="flow-summary-bottom">
                    <span>
                      {result.opportunities.length}{" "}
                      {result.opportunities.length === 1
                        ? "opportunity"
                        : "opportunities"}{" "}
                      · {report!.sources.length}{" "}
                      {report!.sources.length === 1 ? "source" : "sources"} ·{" "}
                      {new Date(report!.created_at).toLocaleDateString()}
                    </span>
                    <div className="button-row">
                      <button
                        className="text-link"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              reportMarkdown(
                                result,
                                report!.question,
                                report!.sources,
                                report!.validation_work,
                              ),
                            );
                            setCopied(true);
                          } catch {
                            setError(
                              "Copy unavailable in this browser. Use Download report instead.",
                            );
                          }
                        }}
                      >
                        {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                        {copied ? "Copied" : "Copy report"}
                      </button>
                      <DownloadLink
                        className="text-link"
                        href={"/api/reports/" + report!.id + "/export"}
                      >
                        <Download size={15} /> Download report
                      </DownloadLink>
                      <button
                        className="text-link"
                        onClick={() => window.print()}
                      >
                        Print / PDF
                      </button>
                    </div>
                  </div>
                </div>
                {!!result.opportunities.length && (
                  <section
                    className="flow-overview"
                    aria-label="Opportunity overview"
                  >
                    <h2>Choose a problem to explore</h2>
                    <div>
                      {result.opportunities.map((o, index) => (
                        <a href={"#opportunity-" + o.id} key={o.id ?? index}>
                          <span className="eyebrow">
                            Opportunity {index + 1}
                          </span>
                          <h3>{o.title}</h3>
                          <p className="flow-overview-problem">{o.problem}</p>
                          <small>
                            {
                              new Set(
                                o.supporting_ids.map(
                                  (id) =>
                                    result.findings.find((f) => f.id === id)
                                      ?.source_id,
                                ),
                              ).size
                            }{" "}
                            supporting sources · {o.opposing_ids.length}{" "}
                            {result.evidence_version === 2
                              ? "direct challenges"
                              : "challenges or risks"}
                            {result.evidence_version === 2 && (
                              <> · {o.risk_ids?.length ?? 0} risks</>
                            )}
                          </small>
                          <p className="flow-overview-next">
                            <strong>Next:</strong> {o.next_step}
                          </p>
                          <span className="text-link">
                            Review this opportunity <ArrowRight size={14} />
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}
                <EarlierValidationWork
                  report={report!}
                  saved={refreshReport}
                  demo={demo}
                />
                {result.changes.length > 0 && (
                  <div className="flow-changes">
                    <strong>What changed</strong>
                    {result.changes.map((c, i) => (
                      <p key={i}>{c}</p>
                    ))}
                  </div>
                )}
                {!result.opportunities.length && (
                  <div className="flow-empty">
                    <h2>More customer evidence is needed</h2>
                    <p>
                      Add interviews or attributed customer notes. Internal
                      plans help provide context, but cannot establish customer
                      demand.
                    </p>
                  </div>
                )}
                {result.opportunities.map((o, index) => (
                  <article
                    className="flow-opportunity"
                    data-testid="opportunity-card"
                    key={o.id ?? index}
                    id={"opportunity-" + o.id}
                  >
                    <div className="flow-opportunity-title">
                      <span className="flow-number">0{index + 1}</span>
                      <div>
                        <h2>{o.title}</h2>
                        <p>{o.audience}</p>
                      </div>
                      {!demo && (
                        <button
                          className="text-link"
                          onClick={() => setEditing(index)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editing === index ? (
                      <OpportunityEdit
                        opportunity={o}
                        save={async (values) => {
                          await request(
                            "reports/" + report!.id + "/edit",
                            { ...values, index, version: report!.version },
                            "PATCH",
                          );
                          setReport(await request("reports/" + report!.id));
                          setEditing(null);
                        }}
                        cancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <p className="flow-problem">{o.problem}</p>
                        <details className="flow-more">
                          <summary>Why explore this opportunity?</summary>
                          <p>
                            <strong>Why it matters:</strong> {o.importance}
                          </p>
                          <p className="flow-rationale">
                            <strong>Why explore this:</strong> {o.rationale}
                          </p>
                        </details>
                        <div
                          className="flow-quote-preview"
                          aria-label="Example customer evidence"
                        >
                          <span className="eyebrow">From the source</span>
                          {citations(
                            o.supporting_ids.slice(0, 1),
                            o.evidence_reasons,
                          )}
                        </div>
                        <div className="flow-next">
                          <span className="eyebrow">
                            YOUR NEXT VALIDATION STEP
                          </span>
                          <p>{o.next_step}</p>
                          {o.questions.length > 0 && (
                            <details>
                              <summary>Questions to ask</summary>
                              <ul>
                                {o.questions.map((q, i) => (
                                  <li key={i}>{q}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                        <p className="flow-uncertainty">
                          <strong>Still uncertain:</strong> {o.uncertainty}
                        </p>
                        {o.id && (
                          <ValidationWork
                            key={
                              report!.id +
                              o.id +
                              (report!.validation_work?.find(
                                (w: Row) =>
                                  w.report_id === report!.id &&
                                  w.opportunity_id === o.id,
                              )?.version ?? 0)
                            }
                            reportId={report!.id}
                            opportunity={o}
                            work={report!.validation_work?.find(
                              (w: Row) =>
                                w.report_id === report!.id &&
                                w.opportunity_id === o.id,
                            )}
                            saved={refreshReport}
                            demo={demo}
                          />
                        )}
                      </>
                    )}
                    <details className="flow-evidence">
                      <summary>
                        View evidence{" "}
                        <span>
                          {
                            new Set(
                              o.supporting_ids.map(
                                (id) =>
                                  result.findings.find((f) => f.id === id)
                                    ?.source_id,
                              ),
                            ).size
                          }{" "}
                          supporting sources · {o.opposing_ids.length}{" "}
                          {result.evidence_version === 2
                            ? "direct challenges"
                            : "challenges and risks"}{" "}
                          · {o.risk_ids?.length ?? 0} risks
                        </span>
                        <ChevronDown size={17} />
                      </summary>
                      <div className="flow-evidence-columns">
                        <div>
                          <h3>Supporting customer evidence</h3>
                          {citations(o.supporting_ids, o.evidence_reasons)}
                        </div>
                        <div>
                          <h3>
                            {result.evidence_version === 2
                              ? "Direct challenges"
                              : "Challenges and risks (legacy classification)"}
                          </h3>
                          {o.opposing_ids.length ? (
                            citations(o.opposing_ids, o.evidence_reasons)
                          ) : (
                            <p>
                              No direct challenges found in these sources. This
                              is not proof of agreement.
                            </p>
                          )}
                        </div>
                      </div>
                      {!!o.risk_ids?.length && (
                        <div className="flow-context">
                          <h3>Risks and constraints</h3>
                          {citations(o.risk_ids, o.evidence_reasons)}
                        </div>
                      )}
                      {o.context_ids.length > 0 && (
                        <div className="flow-context">
                          <h3>Company context & uncertain attribution</h3>
                          {citations(o.context_ids, o.evidence_reasons)}
                        </div>
                      )}
                      <small>
                        Source passages match the uploaded text. AI
                        interpretations and customer attribution need your
                        review. Repeated sources are not additional customers.
                      </small>
                    </details>
                  </article>
                ))}
                <details className="flow-source-list">
                  <summary>
                    Sources & reading limitations ({report!.sources.length})
                  </summary>
                  {report!.sources.map((s: Row) => (
                    <div key={s.id}>
                      <button
                        className="text-link"
                        onClick={() => setSource({ id: s.id, page: 0 })}
                      >
                        <FileText size={16} />
                        {s.filename}
                      </button>
                      <small>
                        {s.role === "context"
                          ? "Company context"
                          : s.role === "customer"
                            ? "Customer material"
                            : "AI identified source type"}
                      </small>
                      {s.warnings.map((w: string, i: number) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  ))}
                </details>
                <div className="flow-report-end">
                  <p>
                    New conversations can change the picture. Add material to
                    update this report.
                  </p>
                  <button
                    className="text-link"
                    disabled={demo}
                    onClick={() => {
                      setSelected(
                        report!.sources.map((s: Row) => ({
                          id: s.id,
                          role: s.role,
                        })),
                      );
                      setComposing(true);
                    }}
                  >
                    Add new sources <ArrowRight size={15} />
                  </button>
                  <AppLink className="text-link" href="/?new=1">
                    Start a separate discovery
                  </AppLink>
                </div>
              </section>
            )}
          </>
        )}
        <footer className="flow-footer">
          <span>Customer words. Clearer opportunities.</span>
          <AppLink href="/settings">Settings</AppLink>
        </footer>
      </main>
      {source && (
        <SourceViewer
          source={source}
          change={setSource}
          close={() => setSource(null)}
        />
      )}
    </div>
  );
}
function OpportunityEdit({
  opportunity,
  save,
  cancel,
}: {
  opportunity: Row;
  save: (v: Row) => Promise<void>;
  cancel: () => void;
}) {
  const [values, setValues] = useState({
      title: opportunity.title,
      problem: opportunity.problem,
      uncertainty: opportunity.uncertainty,
      next_step: opportunity.next_step,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="flow-edit"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await save(values);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {(
          [
            ["title", "Opportunity title", 150],
            ["problem", "Problem", 1200],
            ["next_step", "Next validation step", 1000],
            ["uncertainty", "Uncertainty", 1000],
          ] as const
        ).map(([key, label, max]) => (
          <Field key={key} label={label}>
            <textarea
              required={key === "title"}
              rows={key === "title" ? 1 : 3}
              maxLength={max}
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </Field>
        ))}
        <div className="button-row">
          <button className="button primary">
            {busy ? "Saving…" : "Save opportunity"}
          </button>
          <button type="button" className="button ghost" onClick={cancel}>
            Cancel
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  );
}
function SourceViewer({
  source,
  change,
  close,
}: {
  source: SourceSelection;
  change: (s: any) => void;
  close: () => void;
}) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const legacy = source.kind === "transcript";
    const offset =
      legacy && source.quote && source.start !== undefined
        ? Math.max(0, source.start - 500)
        : source.page * 20000;
    void request(
      legacy
        ? `transcripts/${source.id}?offset=${offset}`
        : `sources/${source.id}?page=${source.page}`,
    )
      .then((d) => {
        if (active)
          setData(
            legacy
              ? {
                  filename: d.title,
                  page: {
                    label: `Original text · characters ${offset + 1}–${offset + d.raw_text.length}`,
                    text: d.raw_text,
                  },
                  total: Math.ceil(d.source_total / 20000),
                  offset,
                  warnings: [],
                }
              : d,
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [source.id, source.page, source.kind, source.quote, source.start]);
  let at = source.quote && data ? data.page.text.indexOf(source.quote) : -1;
  const quoteStart =
    source.start === undefined ? undefined : source.start - (data?.offset ?? 0);
  if (
    quoteStart !== undefined &&
    source.quote &&
    data?.page.text.slice(quoteStart, quoteStart + source.quote.length) ===
      source.quote
  )
    at = quoteStart;
  return (
    <Modal title="Source passage" onClose={close}>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p>Loading source…</p>
      ) : (
        <>
          <h3>{data.filename}</h3>
          <DownloadLink
            className="text-link"
            href={
              "/api/" +
              (source.kind === "transcript" ? "transcripts/" : "sources/") +
              source.id +
              "/download"
            }
          >
            <Download size={15} /> Download original
          </DownloadLink>
          <div className="flow-source-paging">
            <button
              className="button secondary"
              disabled={source.page === 0}
              onClick={() =>
                change({ ...source, page: source.page - 1, quote: undefined })
              }
            >
              Previous
            </button>
            <strong>{data.page.label}</strong>
            <button
              className="button secondary"
              disabled={source.page + 1 >= data.total}
              onClick={() =>
                change({ ...source, page: source.page + 1, quote: undefined })
              }
            >
              Next
            </button>
          </div>
          <p className="flow-source-text">
            {at >= 0 ? (
              <>
                {data.page.text.slice(0, at)}
                <mark>
                  {data.page.text.slice(at, at + source.quote!.length)}
                </mark>
                {data.page.text.slice(at + source.quote!.length)}
              </>
            ) : (
              data.page.text || "No readable text on this page."
            )}
          </p>
          {data.warnings.map((w: string, i: number) => (
            <p className="flow-allowance" key={i}>
              {w}
            </p>
          ))}
        </>
      )}
    </Modal>
  );
}
