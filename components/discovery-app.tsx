"use client";
import { useState } from "react";
import { Layers3, ArrowRight, ShieldCheck } from "lucide-react";
import { request, Badge } from "./ui";
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
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand">
          <Layers3 size={30} /> evidence.
        </div>
        <Badge tone="light">PRODUCT DISCOVERY, GROUNDED.</Badge>
        <h1>
          Find your next
          <br />
          product
          <br />
          <em>opportunity.</em>
        </h1>
        <p>
          Turn conversations, notes, and documents into clear opportunities,
          supporting evidence, and your next validation step.
        </p>
        <p>
          <strong>$10/month. All features. Bring your own AI API key.</strong>
          <br />
          Your AI provider bills usage separately. Explore the demo before
          subscribing; there is no free trial.
        </p>
        <div className="auth-proof">
          <ShieldCheck />
          <span>
            Verifiable quotes. Human decisions.
            <br />
            One simple discovery workflow.
          </span>
        </div>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">YOUR DISCOVERY WORKSPACE</span>
          <h2>
            {mode === "register"
              ? "Make your next discovery clearer."
              : "Welcome back."}
          </h2>
          <p>
            {mode === "register"
              ? "Create your private account to get started."
              : "Sign in to your evidence workspace."}
          </p>
          <DemoEntry />
          <p>
            <a href="/pricing">Pricing</a> · <a href="/help">Setup guide</a> ·{" "}
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
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
    </div>
  );
}
