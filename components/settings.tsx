"use client";
import { useState } from "react";
import { Download, ArrowLeft } from "lucide-react";
import {
  AppLink,
  DownloadLink,
  Field,
  Form,
  Submit,
  Panel,
  Badge,
  request,
} from "./ui";
import {
  groqDefaultModel,
  geminiDefaultModel,
  providerName,
} from "@/lib/providers";

const defaultModels: Record<string, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-5-20250929",
  groq: groqDefaultModel,
  gemini: geminiDefaultModel,
};

type Row = Record<string, any>;
export function SettingsPage({
  data,
  refresh,
}: {
  data: Row;
  refresh: () => Promise<unknown>;
}) {
  const [provider, setProvider] = useState(data.settings.provider);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [background, setBackground] = useState(
    data.settings.product_context ?? "",
  );
  const [backgroundSaved, setBackgroundSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const hasKey = data.settings[`has_${provider}_key`];
  const deletePanel = (
    <Panel title="Delete account">
      <p>
        This immediately disables your account, removes saved API keys, cancels
        subscriptions, and permanently deletes your workspace. Private file
        cleanup is retried if storage is unavailable. Export your data first.
        Backup copies expire under the retention policy.
      </p>
      <Form
        onSubmit={async () => {
          await request("account/delete", {
            password: deletePassword,
            confirmation: deleteConfirmation,
          });
          window.location.assign("/");
        }}
      >
        <Field label="Password to delete account">
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </Field>
        <Field label="Type DELETE to confirm">
          <input
            required
            pattern="DELETE"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
          />
        </Field>
        <Submit>
          {data.user.deletion_requested_at
            ? "Retry account deletion"
            : "Permanently delete account"}
        </Submit>
      </Form>
    </Panel>
  );
  if (data.user.deletion_requested_at)
    return (
      <section className="flow-settings stack">
        <h1>Account deletion in progress</h1>
        <p>
          Your workspace is disabled. If cancellation or cleanup was
          interrupted, retry below. Maintenance also retries automatically.
        </p>
        {deletePanel}
        <Form
          onSubmit={async () => {
            await request("auth/logout", {});
            window.location.assign("/");
          }}
        >
          <Submit>Sign out</Submit>
        </Form>
      </section>
    );
  return (
    <section className="flow-settings stack">
      <AppLink href="/" className="text-link">
        <ArrowLeft size={16} /> Back to discovery
      </AppLink>
      <div>
        <h1>Settings</h1>
        <p>Your account and analysis connection.</p>
      </div>
      <Panel title="Your account">
        <p>
          <strong>{data.user.name}</strong>
          <br />
          {data.user.email}
        </p>
        <DownloadLink className="button secondary" href="/api/export">
          <Download size={16} /> Export my data
        </DownloadLink>
      </Panel>
      <Panel
        title="About your product"
        subtitle="Optional background for new discoveries."
      >
        <Form
          onSubmit={async () => {
            setBackgroundSaved(false);
            await request(
              "settings/product-background",
              {
                product_context: background,
                previous: data.settings.product_context ?? "",
              },
              "PATCH",
            );
            await refresh();
            setBackgroundSaved(true);
          }}
        >
          <Field
            label="Product background"
            hint="Describe your product, who it serves, and any constraints. This guides analysis and never counts as customer evidence."
          >
            <textarea
              rows={5}
              maxLength={3000}
              value={background}
              placeholder="We help small teams manage projects. Our users are team leads. Solutions should work without dedicated administrators."
              disabled={data.user.is_demo}
              onChange={(e) => {
                setBackground(e.target.value);
                setBackgroundSaved(false);
              }}
            />
          </Field>
          <p>
            You can edit or clear this background for each discovery. Saved
            reports keep their original background.
          </p>
          {!data.user.is_demo && <Submit>Save product background</Submit>}
          {backgroundSaved && <p role="status">Product background saved</p>}
        </Form>
      </Panel>
      {!data.user.is_demo && (
        <Panel
          title="Subscription"
          subtitle="$10/month · all features · no free trial"
        >
          <p>
            Bring your own AI API key. Your provider bills AI usage separately.
            Cancel anytime; paid access continues through the end of your
            billing period.
          </p>
          <p aria-live="polite">
            {data.billing?.active
              ? "Your subscription is active."
              : "Connect an AI provider, then subscribe to start discovery."}
          </p>
          {data.billing?.paidUntil && (
            <p>
              Paid access through{" "}
              {new Date(data.billing.paidUntil).toLocaleDateString()}.{" "}
              {data.billing.cancelAtPeriodEnd
                ? "Cancellation is scheduled."
                : ""}
            </p>
          )}
          {!data.billing?.active && data.billing?.readUntil && (
            <p>
              Read and export your saved work until{" "}
              {new Date(data.billing.readUntil).toLocaleDateString()}; it is
              scheduled for deletion afterward.
            </p>
          )}
          <Form
            onSubmit={async () => {
              const result = await request(
                data.billing?.active ? "billing/portal" : "billing/checkout",
                {},
              );
              window.location.assign(result.url);
            }}
          >
            <Submit>
              {data.billing?.active
                ? "Manage subscription"
                : "Subscribe for $10/month"}
            </Submit>
          </Form>
          {data.billing?.hasCustomer && !data.billing?.active && (
            <Form
              onSubmit={async () => {
                window.location.assign(
                  (await request("billing/portal", {})).url,
                );
              }}
            >
              <Submit>Manage billing</Submit>
            </Form>
          )}
          <Form
            onSubmit={async () => {
              await request("billing/refresh", {});
              await refresh();
            }}
          >
            <Submit>Refresh payment status</Submit>
          </Form>
          <p>
            After paid access ends, you have 30 days to read and export your
            work. AI provider charges are outside this subscription.
          </p>
        </Panel>
      )}
      <Panel
        title="Analysis"
        subtitle={
          data.user.is_demo
            ? "The demo uses fictional sources and prerecorded results."
            : "Turn customer material into opportunities."
        }
      >
        <p>
          {data.user.is_demo
            ? "Create your own workspace to analyze your material."
            : data.hasOwnKey
              ? `Analysis uses your ${providerName(data.settings.provider)} connection. Usage follows your provider account’s plan.`
              : "Connect your own AI provider below. Evidence stores your material and sends relevant source text to your selected provider."}
        </p>
        {!data.user.is_demo && (
          <>
            <Form
              onSubmit={async () => {
                setMessage("");
                await request(
                  "settings",
                  {
                    provider,
                    model:
                      provider === data.settings.provider
                        ? data.settings.model
                        : defaultModels[provider],
                    validation_threshold: data.settings.validation_threshold,
                    ...(key.trim() ? { api_key: key.trim() } : {}),
                  },
                  "PATCH",
                );
                setKey("");
                await refresh();
                setMessage("Connection saved");
              }}
            >
              <Field label="AI provider">
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setKey("");
                    setMessage("");
                  }}
                >
                  <option value="groq">Groq</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </Field>
              <Badge tone={hasKey ? "green" : "amber"}>
                {hasKey ? "Connected · key encrypted" : "Not connected"}
              </Badge>
              <Field
                label={hasKey ? "Replace API key" : "API key"}
                hint="Your key is checked before saving and stored encrypted. Provider charges and data terms apply."
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  required={!hasKey}
                  minLength={8}
                  maxLength={500}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={
                    hasKey
                      ? "Leave blank to keep your saved key"
                      : "Paste your provider API key"
                  }
                />
              </Field>
              <Submit>Save connection</Submit>
            </Form>
            {hasKey && (
              <Form
                onSubmit={async () => {
                  setMessage("");
                  await request("settings/" + provider, undefined, "DELETE");
                  await refresh();
                  setMessage("API key removed");
                }}
              >
                <button type="submit" className="button danger small-button">
                  Remove saved key
                </button>
              </Form>
            )}
            {message && <p role="status">{message}</p>}
          </>
        )}
      </Panel>
      {!data.user.is_demo && (
        <Panel title="Account security">
          <Form
            onSubmit={async () => {
              await request("account/password", {
                current_password: currentPassword,
                password: newPassword,
              });
              window.location.assign("/");
            }}
          >
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Submit>Change password and sign out everywhere</Submit>
          </Form>
          <Form
            onSubmit={async () => {
              await request("account/sessions", undefined, "DELETE");
              window.location.assign("/");
            }}
          >
            <Submit>Sign out all devices</Submit>
          </Form>
        </Panel>
      )}
      {!data.user.is_demo && deletePanel}
    </section>
  );
}
