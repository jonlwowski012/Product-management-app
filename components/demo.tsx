"use client";
import { useState } from "react";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { request } from "./ui";
import { demoId } from "@/lib/demo-constants";
export function DemoEntry() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="demo-entry">
      <button
        className="button secondary wide"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await request("auth/demo", {});
            window.location.assign("/demo/reports/" + demoId(1000));
          } catch (error) {
            setError((error as Error).message);
            setBusy(false);
          }
        }}
      >
        <Play size={16} /> {busy ? "Opening the demo…" : "Explore demo"}{" "}
        <ArrowRight size={16} />
      </button>
      <p>A ready-to-explore workspace. No signup or API key needed.</p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
export function DemoWelcome() {
  return (
    <div className="demo-landing">
      <section>
        <span className="eyebrow">EVIDENCE · INTERACTIVE SALES DEMO</span>
        <h1>
          Discover the opportunity.
          <br />
          <em>Know your next step.</em>
        </h1>
        <p>
          Explore a ready-made opportunity report for HarborOps, a fictional
          product. See recurring customer problems, evidence on both sides, and
          the next questions to validate.
        </p>
        <div className="demo-preview-grid">
          <div>
            <strong>3 customers</strong>
            <span>support searchable audit history</span>
          </div>
          <div>
            <strong>2 commitments</strong>
            <span>explicitly offer to pay</span>
          </div>
          <div>
            <strong>Next steps</strong>
            <span>practical questions to validate next</span>
          </div>
        </div>
        <DemoEntry />
        <p className="demo-disclosure">
          <ShieldCheck size={17} /> Fictional data. View only. AI examples are
          prerecorded.
        </p>
        <a href="/" className="text-link">
          Create or open my workspace
        </a>
      </section>
    </div>
  );
}
