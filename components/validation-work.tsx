"use client";
import { useState } from "react";
import { AppLink, Field, request } from "./ui";

type Row = Record<string, any>;
export function ValidationWork({
  reportId,
  opportunity,
  work,
  saved,
  demo,
}: {
  reportId: string;
  opportunity: Row;
  work?: Row;
  saved: () => Promise<void>;
  demo: boolean;
}) {
  const [status, setStatus] = useState(work?.status ?? "chosen");
  const [activity, setActivity] = useState(
    work?.activity ?? opportunity.next_step ?? "",
  );
  const [learning, setLearning] = useState(work?.learning ?? "");
  const [outcome, setOutcome] = useState(work?.outcome ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(choosing = false) {
    setBusy(true);
    setError("");
    try {
      await request(
        `reports/${reportId}/validation/${opportunity.id}`,
        {
          version: work?.version ?? 0,
          status: choosing ? "chosen" : status,
          activity,
          learning,
          outcome: !choosing && status === "reviewed" ? outcome || null : null,
        },
        "PATCH",
      );
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!work)
    return (
      <div className="flow-choose">
        <button
          type="button"
          className="button primary"
          disabled={demo || busy}
          onClick={() => void save(true)}
        >
          {busy ? "Saving…" : "Choose this opportunity"}
        </button>
        <small>Save a validation plan and record what you learn.</small>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <details className="flow-validation" open>
      <summary>
        Your validation plan ·{" "}
        {work.status === "chosen"
          ? "Chosen"
          : work.status === "testing"
            ? "Testing"
            : "Reviewed"}
      </summary>
      <div className="flow-validation-print">
        <p>
          <strong>Activity:</strong> {work.activity || "Not recorded"}
        </p>
        <p>
          <strong>Learning:</strong> {work.learning || "Not recorded"}
        </p>
        {work.outcome && (
          <p>
            <strong>Your conclusion:</strong> {work.outcome}
          </p>
        )}
        <small>Human-recorded validation work</small>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || demo}>
          <div className="flow-validation-fields">
            <Field label="Validation status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="chosen">Chosen</option>
                <option value="testing">Testing</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </Field>
            <Field label="What will you do?">
              <textarea
                value={activity}
                maxLength={2000}
                rows={3}
                onChange={(e) => setActivity(e.target.value)}
              />
            </Field>
            <Field label="What did you learn?">
              <textarea
                value={learning}
                maxLength={5000}
                rows={3}
                required={status === "reviewed"}
                onChange={(e) => setLearning(e.target.value)}
                placeholder="Record what happened and what remains uncertain."
              />
            </Field>
            {status === "reviewed" && (
              <Field label="Your conclusion">
                <select
                  value={outcome}
                  required
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="">Choose a conclusion</option>
                  <option value="supported">Supported</option>
                  <option value="challenged">Challenged</option>
                  <option value="inconclusive">Inconclusive</option>
                </select>
              </Field>
            )}
          </div>
          <button type="submit" className="button secondary">
            {busy ? "Saving…" : "Save validation work"}
          </button>
        </fieldset>
        <small>
          These are your conclusions, kept separately from AI drafts. New
          analyses do not overwrite them.
        </small>
        <p role="status">
          Saved · {new Date(work.updated_at).toLocaleString()}
        </p>
        {error && (
          <p role="alert">
            {error}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => void saved()}
            >
              Reload saved work
            </button>
          </p>
        )}
      </form>
    </details>
  );
}

export function EarlierValidationWork({
  report,
  saved,
  demo,
}: {
  report: Row;
  saved: () => Promise<void>;
  demo: boolean;
}) {
  const earlier = (report.validation_work ?? []).filter(
    (w: Row) => w.report_id !== report.id,
  );
  if (!earlier.length) return null;
  return (
    <details className="flow-earlier-work" aria-label="Earlier validation work">
      <summary>Your earlier validation work ({earlier.length})</summary>
      <p>
        These choices belong to earlier reports. Review them alongside the new
        findings; they are never reassigned to a new opportunity automatically.
      </p>
      {earlier.map((w: Row) => (
        <article key={w.report_id + w.opportunity_id}>
          <h3>{w.opportunity.title}</h3>
          <AppLink
            href={`/reports/${w.report_id}#opportunity-${w.opportunity_id}`}
            className="text-link"
          >
            Open original opportunity
          </AppLink>
          <ValidationWork
            key={w.report_id + w.opportunity_id + w.version}
            reportId={w.report_id}
            opportunity={{ ...w.opportunity, id: w.opportunity_id }}
            work={w}
            saved={saved}
            demo={demo}
          />
        </article>
      ))}
    </details>
  );
}
