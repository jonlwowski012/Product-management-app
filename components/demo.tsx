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
          Turn customer conversations
          <br />
          <em>into product opportunities.</em>
        </h1>
        <p>
          Follow the simulation-as-a-service story from our sales demo: explore
          three opportunities, compare the source excerpts, and see what to
          validate next. Company and product names are fictional.
        </p>
        <div className="demo-preview-grid">
          <div>
            <strong>01 · Upload transcripts</strong>
            <span>Bring interviews, call transcripts, or pasted notes.</span>
          </div>
          <div>
            <strong>02 · Find opportunities</strong>
            <span>Find recurring problems linked to source quotes.</span>
          </div>
          <div>
            <strong>03 · Get a next step</strong>
            <span>Review a practical way to validate each opportunity.</span>
          </div>
        </div>
        <p>
          <strong>Demo question:</strong> Is simulation as a service a good
          product idea?
        </p>
        <DemoEntry />
        <p className="demo-disclosure">
          <ShieldCheck size={17} /> Anonymized data. View only. A prerecorded
          snapshot with selected excerpts; complete private documents are not
          included.
        </p>
        <a href="/" className="text-link">
          Create or open my workspace
        </a>
      </section>
    </div>
  );
}
