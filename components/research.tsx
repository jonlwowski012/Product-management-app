"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileText,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { AppLink, Field, Form, Modal, Panel, Submit, request } from "./ui";

type Row = Record<string, any>;
function closeActions(element: HTMLElement) {
  const menu = element.closest("details");
  menu?.removeAttribute("open");
  menu?.querySelector("summary")?.focus();
}
export type SourceSelection = {
  id: string;
  page: number;
  quote?: string;
  start?: number;
  kind?: "source" | "transcript";
};
const date = (value?: string | null) =>
  value
    ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not recorded";
export function ResearchPage({
  demo,
  openSource,
}: {
  demo: boolean;
  openSource: (source: SourceSelection) => void;
}) {
  const pathname = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const path = demo ? pathname.slice(5) : pathname;
  const customerPage = path.startsWith("/customers");
  const companyId = customerPage ? path.split("/")[2] : null;
  const pending = customerPage && params.get("needsCompany") === "1";
  const all = params.get("view") === "all";
  const [data, setData] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{
    type: "document" | "signal" | "rename" | "merge";
    row: Row;
  } | null>(null);
  const query = new URLSearchParams(params.toString());
  query.delete("needsCompany");
  const endpoint =
    "library/" +
    (customerPage
      ? companyId
        ? "companies/" + companyId
        : pending
          ? "documents"
          : "companies"
      : "signals") +
    "?" +
    query.toString();
  const load = useCallback(async () => {
    const result = await request(endpoint);
    setData(result);
  }, [endpoint]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setEditing(null);
    setMessage("");
    void request(endpoint)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
  useEffect(() => {
    if (data?.merged_into)
      router.replace((demo ? "/demo" : "") + "/customers/" + data.merged_into);
  }, [data?.merged_into, demo, router]);
  const navigate = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes))
      v === null ? next.delete(k) : next.set(k, v);
    router.push(pathname + (next.size ? "?" + next.toString() : ""));
  };
  const mutate = async (url: string, body: unknown) => {
    if (demo) throw new Error("The demo is read only.");
    await request(url, body, "PATCH");
    await load();
    setMessage("Saved");
  };
  const conversation = (d: Row) => (
    <article
      className="research-conversation"
      key={d.kind + d.id}
      data-testid="conversation-row"
    >
      <FileText size={20} aria-hidden="true" />
      <div className="research-grow">
        <h3>{d.filename}</h3>
        <p>
          {date(d.meeting_date)}{" "}
          {!d.meeting_date && <small> · Added {date(d.created_at)}</small>}
        </p>
        {d.needs_company && (
          <small>
            {d.suggested_company
              ? `Suggested name: ${d.suggested_company} · confirm this is a company`
              : "Company not identified"}
          </small>
        )}
      </div>
      <div className="button-row">
        <button
          className="button ghost small-button"
          onClick={() => openSource({ id: d.id, kind: d.kind, page: 0 })}
        >
          Open notes
        </button>
        <button
          className={
            d.needs_company
              ? "button primary small-button"
              : "button secondary small-button"
          }
          disabled={demo}
          onClick={() => setEditing({ type: "document", row: d })}
        >
          {d.needs_company ? "Confirm company" : "Edit details"}
        </button>
      </div>
    </article>
  );
  return (
    <section className="research-page">
      {(companyId || pending) && (
        <AppLink href="/customers" className="text-link">
          <ArrowLeft size={16} /> All customers
        </AppLink>
      )}
      <div className="research-heading">
        <div>
          <span className="eyebrow">
            {customerPage
              ? "YOUR CUSTOMER CONVERSATIONS"
              : "WHAT CUSTOMERS ARE TELLING YOU"}
          </span>
          <h1>
            {customerPage
              ? companyId
                ? (data?.company?.name ?? "Company")
                : pending
                  ? "Confirm companies"
                  : "Customers"
              : params.get("theme") || "Signals"}
          </h1>
          <p>
            {customerPage
              ? companyId
                ? "Your conversations and what you have learned."
                : pending
                  ? "Link these conversations to a company. Everything else is already available."
                  : "See who you have talked to and when."
              : "Explore recurring problems, then follow each signal back to the original words."}
          </p>
        </div>
        {companyId && data?.company && !demo && (
          <details className="research-actions">
            <summary aria-label="Company actions">
              <MoreHorizontal size={20} /> Actions
            </summary>
            <button
              onClick={(e) => {
                closeActions(e.currentTarget);
                setEditing({ type: "rename", row: data.company });
              }}
            >
              Rename company
            </button>
            <button
              onClick={(e) => {
                closeActions(e.currentTarget);
                setEditing({ type: "merge", row: data.company });
              }}
            >
              Merge companies
            </button>
          </details>
        )}
        {!companyId && customerPage && !pending && (
          <AppLink href="/?new=1" className="button secondary">
            Add material <ArrowRight size={16} />
          </AppLink>
        )}
      </div>
      {!customerPage && (
        <>
          <nav className="research-tabs" aria-label="Signal views">
            <button
              className={!all ? "active" : ""}
              aria-pressed={!all}
              onClick={() =>
                navigate({ view: null, theme: null, hidden: null })
              }
            >
              Themes
            </button>
            <button
              className={all ? "active" : ""}
              aria-pressed={all}
              onClick={() => navigate({ view: "all", theme: null })}
            >
              All signals
            </button>
          </nav>
          {params.get("company") && data?.company && (
            <div className="research-filter">
              Company: {data.company}{" "}
              <button
                className="text-link"
                onClick={() => navigate({ company: null })}
              >
                Clear company filter
              </button>
            </div>
          )}
          {all && (
            <label className="checkbox research-hidden">
              <input
                type="checkbox"
                defaultChecked={params.get("hidden") === "1"}
                onChange={(e) =>
                  navigate({ hidden: e.target.checked ? "1" : null })
                }
              />{" "}
              Show hidden signals
            </label>
          )}
        </>
      )}
      {!companyId && (
        <form
          key={pathname + params.toString()}
          className="research-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({
              q: String(new FormData(e.currentTarget).get("q") ?? "") || null,
            });
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input
            name="q"
            aria-label={
              customerPage
                ? pending
                  ? "Search conversations"
                  : "Search companies"
                : all
                  ? "Search signals"
                  : "Search themes"
            }
            defaultValue={params.get("q") ?? ""}
            placeholder={
              customerPage
                ? pending
                  ? "Search notes…"
                  : "Search companies…"
                : all
                  ? "Search signals, quotes, or companies…"
                  : "Search themes…"
            }
          />
          <button className="button secondary small-button">Search</button>
        </form>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              void load().catch((e) => setError(e.message));
            }}
          >
            Try again
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="research-saved">
          {message}
        </p>
      )}
      {loading && !data ? (
        <p role="status">Loading {customerPage ? "customers" : "signals"}…</p>
      ) : (
        data &&
        !data.merged_into && (
          <>
            {customerPage &&
              !companyId &&
              !pending &&
              data.needs_company > 0 && (
                <div className="research-callout">
                  <Building2 size={20} />
                  <span>
                    {data.needs_company} conversation
                    {data.needs_company === 1 ? " needs" : "s need"} a company.
                  </span>
                  <AppLink
                    href="/customers?needsCompany=1"
                    className="text-link"
                  >
                    Confirm companies <ArrowRight size={16} />
                  </AppLink>
                </div>
              )}
            {companyId && (
              <Panel
                title="What we have learned"
                subtitle="Themes from this company’s current, visible signals."
              >
                {data.themes?.length ? (
                  <div className="research-learnings">
                    {data.themes.map((t: Row) => (
                      <AppLink
                        key={t.name}
                        href={
                          "/signals?view=all&company=" +
                          companyId +
                          "&theme=" +
                          encodeURIComponent(t.name)
                        }
                      >
                        <strong>{t.name}</strong>
                        <span>
                          {t.signals} signal{t.signals === 1 ? "" : "s"}{" "}
                          <ArrowRight size={15} />
                        </span>
                      </AppLink>
                    ))}
                  </div>
                ) : (
                  <p>
                    Analyze this company’s conversations to see its recurring
                    problems here.
                  </p>
                )}
                <AppLink
                  className="text-link"
                  href={"/signals?view=all&company=" + companyId}
                >
                  See all company signals <ArrowRight size={16} />
                </AppLink>
              </Panel>
            )}
            {companyId && (
              <h2 className="research-section-title">Conversation history</h2>
            )}
            {!data.items.length ? (
              <div className="research-empty">
                <FileText size={28} />
                <h2>
                  {params.get("q")
                    ? "No matches"
                    : customerPage
                      ? companyId
                        ? "No conversations linked yet"
                        : pending
                          ? "All companies are confirmed"
                          : "No customer conversations yet"
                      : "No signals here yet"}
                </h2>
                <p>
                  {params.get("q")
                    ? "Try another search."
                    : customerPage && pending
                      ? "New conversations will appear here if their company is unclear."
                      : "Add transcripts or meeting notes and analyze them to populate this view."}
                </p>
                {!params.get("q") && !pending && (
                  <AppLink href="/?new=1" className="button primary">
                    Add material <ArrowRight size={16} />
                  </AppLink>
                )}
              </div>
            ) : (
              <>
                <p className="research-count">
                  {data.total}{" "}
                  {customerPage
                    ? companyId || pending
                      ? "conversations"
                      : "companies"
                    : all
                      ? "signals"
                      : "themes"}
                </p>
                {customerPage ? (
                  companyId || pending ? (
                    <div className="research-list">
                      {data.items.map(conversation)}
                    </div>
                  ) : (
                    <div className="research-list">
                      {data.items.map((c: Row) => (
                        <AppLink
                          className="research-company"
                          href={"/customers/" + c.id}
                          key={c.id}
                          data-testid="company-row"
                        >
                          <span className="research-company-icon">
                            <Building2 size={22} />
                          </span>
                          <div className="research-grow">
                            <h2>{c.name}</h2>
                            <p>
                              {c.conversations} conversation
                              {c.conversations === 1 ? "" : "s"} · {c.signals}{" "}
                              signal{c.signals === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="research-last">
                            <span>Latest dated conversation</span>
                            <strong>{date(c.last_conversation)}</strong>
                            {c.missing_dates > 0 && (
                              <small>
                                {c.missing_dates} date
                                {c.missing_dates === 1 ? "" : "s"} missing
                              </small>
                            )}
                          </div>
                          <ArrowRight size={18} />
                        </AppLink>
                      ))}
                    </div>
                  )
                ) : all ? (
                  <div className="research-list">
                    {data.items.map((s: Row) => (
                      <article
                        className={
                          "research-signal" + (s.hidden ? " is-hidden" : "")
                        }
                        key={s.key}
                        data-testid="research-signal"
                      >
                        <div className="research-signal-heading">
                          <div>
                            <span
                              className={
                                "badge " +
                                (s.stance === "opposes"
                                  ? "red"
                                  : s.stance === "supports"
                                    ? "green"
                                    : "neutral")
                              }
                            >
                              {s.hidden
                                ? "Hidden"
                                : s.origin === "uncertain"
                                  ? "Attribution uncertain"
                                  : s.stance === "opposes"
                                    ? "Against theme"
                                    : s.stance === "supports"
                                      ? "For theme"
                                      : s.stance === "risk"
                                        ? "Risk or constraint"
                                        : s.stance === "context"
                                          ? "Context"
                                          : "Customer observation"}
                            </span>
                            <h2>{s.problem || s.theme}</h2>
                          </div>
                          {!demo && (
                            <details className="research-actions">
                              <summary aria-label={"Actions for " + s.problem}>
                                <MoreHorizontal size={20} /> Actions
                              </summary>
                              <button
                                onClick={(e) => {
                                  closeActions(e.currentTarget);
                                  setEditing({ type: "signal", row: s });
                                }}
                              >
                                Edit company or theme
                              </button>
                              <Form
                                onSubmit={(form) => {
                                  closeActions(form);
                                  return mutate("library/signals/" + s.key, {
                                    version: s.version,
                                    hidden: !s.hidden,
                                  });
                                }}
                              >
                                <button type="submit">
                                  {s.hidden ? "Restore signal" : "Hide signal"}
                                </button>
                              </Form>
                            </details>
                          )}
                        </div>
                        <p className="research-signal-meta">
                          {s.company_id ? (
                            <AppLink href={"/customers/" + s.company_id}>
                              {s.company}
                            </AppLink>
                          ) : (
                            <AppLink href="/customers?needsCompany=1">
                              Company not confirmed
                            </AppLink>
                          )}{" "}
                          · {date(s.meeting_date)}
                        </p>
                        {s.consequence && <p>{s.consequence}</p>}
                        <blockquote data-stance={s.stance}>
                          {s.quote}
                        </blockquote>
                        <div className="research-signal-footer">
                          <span>Theme: {s.theme}</span>
                          <button
                            className="text-link"
                            onClick={() =>
                              openSource({
                                id: s.source_id,
                                kind: s.kind,
                                page:
                                  s.kind === "transcript"
                                    ? Math.floor(s.source_start / 20000)
                                    : s.page_index,
                                quote: s.quote,
                                start: s.source_start,
                              })
                            }
                          >
                            {s.filename} <ArrowRight size={15} />
                          </button>
                        </div>
                        {!s.verified && (
                          <small>
                            Check this quote against the original notes.
                          </small>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="research-theme-grid">
                    {data.items.map((t: Row) => (
                      <AppLink
                        className="research-theme"
                        key={t.name}
                        href={
                          "/signals?view=all&theme=" +
                          encodeURIComponent(t.name) +
                          (params.get("company")
                            ? "&company=" + params.get("company")
                            : "")
                        }
                        data-testid="theme-card"
                      >
                        <span className="eyebrow">
                          RECURRING CUSTOMER FEEDBACK
                        </span>
                        <h2>{t.name}</h2>
                        <p>
                          {t.companies} linked compan
                          {t.companies === 1 ? "y" : "ies"} · {t.signals} signal
                          {t.signals === 1 ? "" : "s"}
                        </p>
                        <div className="research-theme-counts">
                          <span className="badge green">
                            {t.supporting} for
                          </span>
                          <span className="badge red">
                            {t.opposing} against
                          </span>
                          {t.context > 0 && (
                            <span className="badge">{t.context} context</span>
                          )}
                          {t.risks > 0 && (
                            <span className="badge">{t.risks} risks</span>
                          )}
                        </div>
                        <span className="text-link">
                          Explore signals <ArrowRight size={16} />
                        </span>
                      </AppLink>
                    ))}
                  </div>
                )}
                {data.next !== null && (
                  <button
                    className="button secondary research-more"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const more = await request(
                          endpoint + "&offset=" + data.next,
                        );
                        setData({
                          ...more,
                          items: [...data.items, ...more.items],
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Show more
                  </button>
                )}
              </>
            )}
            {!customerPage && (
              <p className="research-note">
                Quotes retain their original wording. Themes group matching
                problem labels; interpretations and company attribution may need
                correction. Company counts exclude unconfirmed names and hidden
                signals.
              </p>
            )}
          </>
        )
      )}
      {editing && (
        <Modal
          title={
            editing.type === "document"
              ? "Conversation details"
              : editing.type === "signal"
                ? "Edit signal"
                : editing.type === "rename"
                  ? "Rename company"
                  : "Merge companies"
          }
          onClose={() => setEditing(null)}
        >
          <ResearchEdit
            editing={editing}
            save={async (values) => {
              if (editing.type === "merge") {
                const result = await request(
                  "library/companies/" + editing.row.id + "/merge",
                  {
                    target_id: values.target_id,
                    version: editing.row.research_version,
                  },
                );
                setEditing(null);
                router.push((demo ? "/demo" : "") + "/customers/" + result.id);
                return;
              }
              const row = editing.row;
              const url =
                editing.type === "rename"
                  ? "library/companies/" + row.id
                  : editing.type === "document"
                    ? "library/documents/" + row.kind + "/" + row.id
                    : "library/signals/" + row.key;
              await mutate(url, {
                ...values,
                version:
                  editing.type === "rename"
                    ? row.research_version
                    : row.version,
              });
              setEditing(null);
            }}
            cancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </section>
  );
}
function CompanyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void request("library/options?q=" + encodeURIComponent(value))
        .then((r) => {
          if (active) setOptions(r.items);
        })
        .catch(() => {});
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value]);
  return (
    <Field
      label="Company"
      hint="Choose an existing company or type its name. Leave blank if unknown."
    >
      <input
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        list="research-company-options"
        autoComplete="off"
      />
      <datalist id="research-company-options">
        {options.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </Field>
  );
}
function ResearchEdit({
  editing,
  save,
  cancel,
}: {
  editing: { type: string; row: Row };
  save: (values: Row) => Promise<void>;
  cancel: () => void;
}) {
  const { row, type } = editing;
  const [name, setName] = useState(
    type === "document"
      ? row.company_name || row.suggested_company || ""
      : type === "signal"
        ? row.company || ""
        : row.name,
  );
  const [theme, setTheme] = useState(row.theme ?? ""),
    [search, setSearch] = useState(""),
    [options, setOptions] = useState<Row[]>([]),
    [themes, setThemes] = useState<Row[]>([]);
  useEffect(() => {
    if (type !== "signal") return;
    let active = true;
    const timer = setTimeout(() => {
      void request("library/signals?q=" + encodeURIComponent(theme))
        .then((r) => {
          if (active) setThemes(r.items);
        })
        .catch(() => {});
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [type, theme]);
  useEffect(() => {
    if (type !== "merge") return;
    let active = true;
    const timer = setTimeout(() => {
      void request("library/options?q=" + encodeURIComponent(search))
        .then((r) => {
          if (active) setOptions(r.items.filter((c: Row) => c.id !== row.id));
        })
        .catch(() => {});
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [type, search, row.id]);
  return (
    <Form
      onSubmit={async (form) => {
        const f = new FormData(form);
        await save(
          type === "rename"
            ? { name }
            : type === "merge"
              ? { target_id: f.get("target") }
              : type === "document"
                ? { company_name: name, meeting_date: f.get("date") || null }
                : {
                    ...(name !== (row.company ?? "")
                      ? { company_name: name }
                      : {}),
                    theme,
                  },
        );
      }}
    >
      {type === "merge" ? (
        <>
          <p>
            Move {row.name}’s conversations and signals into another company.
            Original notes and report history are preserved.
          </p>
          <Field label="Find a company">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company names…"
            />
          </Field>
          <Field label="Merge into">
            <select name="target" required defaultValue="">
              <option value="" disabled>
                Choose a company
              </option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : type === "rename" ? (
        <Field label="Company name">
          <input
            value={name}
            required
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      ) : (
        <CompanyField value={name} onChange={setName} />
      )}
      {type === "document" && (
        <Field
          label="Conversation date"
          hint="Use the actual meeting date. Leave blank if it was not recorded."
        >
          <input
            name="date"
            type="date"
            defaultValue={row.meeting_date ?? ""}
          />
        </Field>
      )}
      {type === "signal" && (
        <Field
          label="Theme"
          hint="Choose an existing theme or type a new one to group related signals."
        >
          <input
            value={theme}
            list="research-theme-options"
            autoComplete="off"
            maxLength={300}
            required
            onChange={(e) => setTheme(e.target.value)}
          />
          <datalist id="research-theme-options">
            {themes.map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>
        </Field>
      )}
      <div className="button-row">
        <Submit>{type === "merge" ? "Merge companies" : "Save changes"}</Submit>
        <button type="button" className="button ghost" onClick={cancel}>
          Cancel
        </button>
      </div>
    </Form>
  );
}
