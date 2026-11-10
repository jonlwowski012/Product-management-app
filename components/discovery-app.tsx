"use client";
import { useState } from "react";
import { AGREEMENT_VERSION } from "@/lib/user-agreement";
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
              MAKE SENSE OF YOUR CUSTOMER CONVERSATIONS
            </span>
            <h1 id="home-title">
              What should you
              <br />
              <em>build next?</em>
            </h1>
            <p>
              You’ve got interviews, call transcripts, and a pile of notes.
              Evidence helps you spot the problems that keep coming up, see who
              said what, and decide what to test next.
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
              $10/month · All features · Bring your own AI API key
              <br />
              AI usage billed separately by your provider.
            </p>
          </div>
          <figure
            className="home-example"
            aria-label="Illustrative example: customer feedback becomes an opportunity with evidence and a validation step"
          >
            <figcaption>
              <span className="home-live-dot" /> HERE’S WHAT THAT LOOKS LIKE{" "}
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
              <h2>Weekly reporting keeps eating up Fridays</h2>
              <p>
                One customer loses time to this every week. Another is happy
                with their template. It needs a closer look.
              </p>
              <div className="home-evidence-row">
                <Check size={16} aria-hidden="true" />
                <div>
                  <strong>Supporting evidence</strong>
                  <span>The same reporting work comes back every Friday.</span>
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
                  <strong>WHAT TO TRY NEXT</strong>
                  <p>
                    Watch a customer prepare a report. Find out what repeats and
                    what still needs their judgment.
                  </p>
                </div>
              </div>
            </div>
            <p className="home-example-note">
              <ShieldCheck size={14} aria-hidden="true" /> Open a quote in your
              workspace to read it in context.
            </p>
          </figure>
        </section>

        <section
          className="home-process"
          id="how-it-works"
          aria-labelledby="process-title"
        >
          <div className="home-section-heading">
            <span className="eyebrow">AFTER THE INTERVIEWS</span>
            <h2 id="process-title">Make sense of what you’ve heard.</h2>
            <p>
              For product managers, founders, and researchers deciding what to
              explore next.
            </p>
          </div>
          <div className="home-steps">
            <article>
              <div className="home-step-icon">
                <FolderOpen size={25} aria-hidden="true" />
                <span>01</span>
              </div>
              <h3>Drop in your transcripts</h3>
              <p>
                Upload interview transcripts, call notes, or documents you
                already have. A whole folder works too. Or just paste your
                notes.
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
              <h3>Pull out the useful signals</h3>
              <p>
                Evidence picks out customer problems and disagreements, with a
                link to the original words. Those signals become the starting
                point for up to three product opportunities.
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
              <h3>Pick something to test</h3>
              <p>
                Choose an opportunity, try the suggested next step, and write
                down what you learn. Come back with more conversations as you
                go.
              </p>
              <span className="home-step-detail">
                Chosen → Testing → Reviewed
              </span>
            </article>
          </div>
        </section>

        <section className="home-value" aria-labelledby="value-title">
          <div>
            <span className="eyebrow">MORE THAN A SUMMARY</span>
            <h2 id="value-title">
              Have an answer to
              <br />
              “why this idea?”
            </h2>
            <p>
              You shouldn’t have to dig through old transcripts to explain a
              product decision. Keep the quotes, the doubts, and what you
              learned in one place.
            </p>
          </div>
          <dl>
            <div>
              <dt>
                <Quote size={19} aria-hidden="true" /> See what they actually
                said
              </dt>
              <dd>
                Check the original words behind an opportunity, including the
                feedback that doesn’t fit. You decide whether the idea holds up.
              </dd>
            </div>
            <div>
              <dt>
                <Layers3 size={19} aria-hidden="true" /> Find the useful bits
                again
              </dt>
              <dd>
                When you analyze a transcript, its findings are saved as
                searchable signals. Browse themes across companies and check the
                quotes without analyzing the transcript again.
              </dd>
            </div>
            <div>
              <dt>
                <ListChecks size={19} aria-hidden="true" /> Remember what you
                tried
              </dt>
              <dd>
                Save what you plan to test and what you learn along the way.
                Share a report so your team can see how you reached your
                decision.
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
            <span className="eyebrow">WHAT YOUR $10 GETS YOU</span>
            <h2 id="pricing-title">
              Keep your customer
              <br />
              research together.
            </h2>
            <p className="home-plan-price">
              $10 <span>USD / month</span>
            </p>
            <p>One private workspace. One owner. Cancel anytime.</p>
            <ul>
              <li>
                <Check size={17} aria-hidden="true" /> Reports with quotes you
                can check
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Customer history and
                searchable signals
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> A record of your tests,
                learning, and past reports
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
                  ? "Create your workspace."
                  : "Welcome back."}
              </h2>
              <p>
                {mode === "register"
                  ? "Create an account, connect your AI API key, and subscribe when you’re ready to work with your own transcripts."
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
                      ...(mode === "register"
                        ? {
                            agreement_accepted: form.has("agreement"),
                            agreement_version: AGREEMENT_VERSION,
                          }
                        : {}),
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
                {mode === "register" && (
                  <div className="signup-agreement">
                    <input
                      id="signup-agreement"
                      name="agreement"
                      type="checkbox"
                      required
                      aria-labelledby="signup-agreement-label"
                    />
                    <label
                      id="signup-agreement-label"
                      htmlFor="signup-agreement"
                    >
                      I agree to the{" "}
                      <a href="/terms" target="_blank" rel="noopener">
                        User Agreement
                      </a>{" "}
                      and acknowledge the{" "}
                      <a href="/privacy" target="_blank" rel="noopener">
                        Privacy and data handling notice
                      </a>
                      . I am at least 18 and authorized to enter this agreement.
                    </label>
                    <p>
                      Includes warranty disclaimers, liability limits, and an
                      indemnity for business use. Links open in a new tab.
                    </p>
                  </div>
                )}
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
          You read the quotes and make the call.
        </p>
      </main>
      <footer className="home-footer">
        <a className="brand" href="/">
          evidence.
        </a>
        <span>For the questions that come after the customer call.</span>
        <nav aria-label="Information">
          <a href="/help">Setup guide</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </div>
  );
}
