"use client";
import { useState } from "react";
import {
  Layers3,
  ArrowRight,
  ShieldCheck,
  FileText,
  Quote,
  Check,
  ArrowUpRight,
  Search,
  ListChecks,
  FolderOpen,
} from "lucide-react";
import { request } from "./ui";
import { DemoEntry } from "./demo";
import { WorkflowApp } from "./workflow";

export default function DiscoveryApp() {
  return (
    <WorkflowApp renderAuth={(onSuccess) => <Auth onSuccess={onSuccess} />} />
  );
}

function Auth({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("register"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="marketing-home">
      <header className="home-nav">
        <a className="brand" href="/" aria-label="Evidence home">
          <Layers3 size={27} aria-hidden="true" /> evidence.
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a
            href="#get-started"
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main className="home-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-intro">
            <span className="eyebrow">
              FROM CUSTOMER FEEDBACK TO PRODUCT DIRECTION
            </span>
            <h1 id="home-title">
              Find your next
              <br />
              <em>product opportunity.</em>
              <br />
              Show the evidence.
            </h1>
            <p>
              Turn interviews, call transcripts, and notes into up to three
              clear product opportunities—with original quotes, opposing views,
              and a practical next step.
            </p>
            <DemoEntry />
            <a
              className="text-link"
              href="#get-started"
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Start your own workspace{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p className="home-price-note">
              $10/month · All features · Your AI API key
              <br />
              AI usage billed separately by your provider.
            </p>
          </div>
          <figure
            className="home-example"
            aria-label="Illustrative example: customer feedback becomes an opportunity with evidence and a validation step"
          >
            <figcaption>
              <span className="home-live-dot" /> A LOOK INSIDE EVIDENCE{" "}
              <span>Fictional example</span>
            </figcaption>
            <div className="home-source-stack">
              <div className="home-source">
                <FileText size={17} aria-hidden="true" />
                <span>Customer interview.txt</span>
                <span>01</span>
              </div>
              <blockquote>
                <Quote size={18} aria-hidden="true" />
                “We spend Friday rebuilding the same customer report by hand.”
              </blockquote>
              <div className="home-source">
                <FileText size={17} aria-hidden="true" />
                <span>Sales call notes.docx</span>
                <span>02</span>
              </div>
            </div>
            <div className="home-transform">
              <span />
              <Layers3 size={18} aria-hidden="true" /> Find the pattern <span />
            </div>
            <div className="home-report-preview">
              <div className="home-report-top">
                <span>OPPORTUNITY 01</span>
                <span>AI draft · Review needed</span>
              </div>
              <h2>Make weekly customer reporting less manual</h2>
              <p>
                Explore whether repeat report preparation is a problem worth
                solving.
              </p>
              <div className="home-evidence-row">
                <Check size={16} aria-hidden="true" />
                <div>
                  <strong>Supporting evidence</strong>
                  <span>Time spent rebuilding the same report.</span>
                </div>
                <span className="home-citation">Source 01</span>
              </div>
              <div className="home-evidence-row challenge">
                <Search size={16} aria-hidden="true" />
                <div>
                  <strong>Direct challenge</strong>
                  <span>“Our current template works fine for us.”</span>
                </div>
                <span className="home-citation">Source 02</span>
              </div>
              <div className="home-next-step">
                <ArrowRight size={17} aria-hidden="true" />
                <div>
                  <strong>YOUR NEXT VALIDATION STEP</strong>
                  <p>
                    Watch a customer prepare a report. Find out what repeats and
                    what still needs their judgment.
                  </p>
                </div>
              </div>
            </div>
            <p className="home-example-note">
              <ShieldCheck size={14} aria-hidden="true" /> In your workspace,
              open citations to check the original passage.
            </p>
          </figure>
        </section>

        <section
          className="home-process"
          id="how-it-works"
          aria-labelledby="process-title"
        >
          <div className="home-section-heading">
            <span className="eyebrow">LESS SORTING. MORE LEARNING.</span>
            <h2 id="process-title">
              From “we heard a lot” to “here’s what to test.”
            </h2>
            <p>
              For product managers, founders, and researchers making sense of
              customer conversations.
            </p>
          </div>
          <div className="home-steps">
            <article>
              <div className="home-step-icon">
                <FolderOpen size={25} aria-hidden="true" />
                <span>01</span>
              </div>
              <h3>Bring the raw material</h3>
              <p>
                Upload interviews, documents, or a folder of transcripts. Or
                just paste your notes.
              </p>
              <span className="home-step-detail">
                TXT · MD · VTT · SRT · PDF · DOCX · PPTX
              </span>
            </article>
            <article>
              <div className="home-step-icon">
                <Search size={25} aria-hidden="true" />
                <span>02</span>
              </div>
              <h3>Turn transcripts into signals</h3>
              <p>
                Evidence extracts customer problems and opposing views as
                signals linked to original passages, then uses those findings to
                suggest product opportunities.
              </p>
              <span className="home-step-detail">
                Transcripts → Signals → Opportunities
              </span>
            </article>
            <article>
              <div className="home-step-icon">
                <ListChecks size={25} aria-hidden="true" />
                <span>03</span>
              </div>
              <h3>Choose a next step. Keep the learning.</h3>
              <p>
                Pick an opportunity, track your validation, and record what you
                learned. Add new material as discovery continues.
              </p>
              <span className="home-step-detail">
                Chosen → Testing → Reviewed
              </span>
            </article>
          </div>
        </section>

        <section className="home-value" aria-labelledby="value-title">
          <div>
            <span className="eyebrow">WHY A DEDICATED WORKSPACE?</span>
            <h2 id="value-title">
              The value is in the trail
              <br />
              behind the recommendation.
            </h2>
            <p>
              A summary is a starting point. Evidence keeps the reasoning,
              source material, and your follow-through together.
            </p>
          </div>
          <dl>
            <div>
              <dt>
                <Quote size={19} aria-hidden="true" /> Make the case with source
                quotes
              </dt>
              <dd>
                Go from an opportunity to the original passage, including
                evidence that challenges the idea.
              </dd>
            </div>
            <div>
              <dt>
                <Layers3 size={19} aria-hidden="true" /> Process once. Keep the
                signals.
              </dt>
              <dd>
                The same transcript analysis populates your searchable Signals
                library. Explore recurring themes across companies and open the
                original quotes without running another analysis.
              </dd>
            </div>
            <div>
              <dt>
                <ListChecks size={19} aria-hidden="true" /> Turn analysis into a
                decision
              </dt>
              <dd>
                Save your validation plan and learning. Export the report to
                share the reasoning with your team.
              </dd>
            </div>
          </dl>
        </section>

        <section
          className="home-start"
          id="pricing"
          aria-labelledby="pricing-title"
        >
          <div className="home-plan">
            <span className="eyebrow">ONE PLAN. ALL CURRENT FEATURES.</span>
            <h2 id="pricing-title">
              A home for your
              <br />
              customer evidence.
            </h2>
            <p className="home-plan-price">
              $10 <span>USD / month</span>
            </p>
            <p>One private workspace. One owner. Cancel anytime.</p>
            <ul>
              <li>
                <Check size={17} aria-hidden="true" /> Discovery reports with
                source passages
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Customer history and
                searchable signals
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Validation tracking and
                report history
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Markdown, print/PDF, and
                data exports
              </li>
            </ul>
            <div className="home-billing-note">
              <strong>Bring your own AI API key.</strong>
              <p>
                Connect OpenAI, Anthropic, Groq, or Gemini. Your provider bills
                AI usage separately from the $10 subscription.
              </p>
              <p>No free trial. Explore the demo before subscribing.</p>
            </div>
            <a className="text-link" href="/pricing">
              See plan limits and billing details{" "}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
          <section
            className="auth-form"
            id="get-started"
            aria-labelledby="auth-title"
          >
            <div>
              <span className="eyebrow">YOUR DISCOVERY WORKSPACE</span>
              <h2 id="auth-title">
                {mode === "register"
                  ? "Make your next discovery clearer."
                  : "Welcome back."}
              </h2>
              <p>
                {mode === "register"
                  ? "Create your account, connect an AI key, then subscribe to analyze your own material."
                  : "Sign in to your evidence workspace."}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  setBusy(true);
                  const form = new FormData(e.currentTarget);
                  try {
                    await request("auth/" + mode, {
                      ...(form.has("name") ? { name: form.get("name") } : {}),
                      email: form.get("email"),
                      password: form.get("password"),
                    });
                    await onSuccess();
                    window.scrollTo(0, 0);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {mode === "register" && (
                  <label className="field">
                    <span>Your name</span>
                    <input
                      name="name"
                      required
                      maxLength={80}
                      autoComplete="name"
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}
                <label className="field">
                  <span>Email address</span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    aria-label="Password"
                    aria-describedby="password-help"
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={128}
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                  />
                  <small id="password-help">At least 10 characters</small>
                </label>
                {error && (
                  <p role="alert" className="error-text">
                    {error}
                  </p>
                )}
                <button disabled={busy} className="button primary wide">
                  {busy
                    ? "Please wait…"
                    : mode === "register"
                      ? "Create account"
                      : "Sign in"}
                  <ArrowRight size={17} />
                </button>
              </form>
              <p className="auth-switch">
                {mode === "register" ? "Already have an account?" : "New here?"}{" "}
                <button
                  onClick={() => {
                    setMode(mode === "register" ? "login" : "register");
                    setError("");
                  }}
                >
                  {mode === "register" ? "Sign in" : "Create account"}
                </button>
              </p>
            </div>
          </section>
        </section>
        <p className="home-human-note">
          <ShieldCheck size={17} aria-hidden="true" /> AI drafts the analysis.
          You check the evidence and make the decision.
        </p>
      </main>
      <footer className="home-footer">
        <a className="brand" href="/">
          evidence.
        </a>
        <span>Better product decisions start with better evidence.</span>
        <nav aria-label="Information">
          <a href="/help">Setup guide</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </div>
  );
}
