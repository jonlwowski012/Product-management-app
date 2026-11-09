# Evidence — Product Discovery

A private, user-owned discovery app with one default workflow: **upload transcripts → find opportunities → get a next step**. Paste notes or upload transcripts, PDFs, DOCX documents, and PPTX slides. Evidence produces up to three problem-oriented opportunities, with supporting passages, direct challenges, separate risks and context, uncertainty, and a practical validation step. Choose an opportunity, track your validation, and record what you learned. CRM is outside this release.

Apply migrations through **015** with `npm run db:migrate` before running this version. Existing reports, sources, reviewed fields, recovery snapshots, and human validation work are retained.

## Simple discovery workflow

The workspace has three focused views: **Discovery**, **Customers**, and **Signals**, plus basic Settings. Add files or paste notes, then select **Find opportunities**. The same analysis populates company history and the signal library. Settings contains account details, data export, and a basic provider connection. Feature planning, decision briefs, executive dashboards, product configuration, model selection, and technical run history remain outside the interface. Older links to removed screens return to discovery; previously saved records remain available. Sources already in a report appear automatically when updating it, and duplicate files are reused without uploading again.

- Drop files, a ZIP, or a folder (including subfolders), or use Choose files / Choose folder. Text-based TXT/Markdown/VTT/SRT/PDF/DOCX/PPTX documents become separate sources with private original downloads and content deduplication. Unsupported files (including screenshots, recordings, and nested ZIPs) produce warnings while valid documents continue; hidden system files are ignored. Import up to **1,000 documents**, **500 MB combined after expansion**, **10 MB per document**, and **25 million extracted text characters per report** (subject to workspace capacity and provider limits). ZIPs expand locally and documents upload through a four-file queue, with file/byte progress, per-file errors, and cancellation that preserves completed sources. Keep the tab open during import; analysis then runs in the background. At most 200 PDF pages or presentation slides per file. Images, charts, comments, and speaker notes are not interpreted. Scanned PDFs require OCR; unreadable pages are disclosed.
- Large analyses checkpoint both source extraction and evidence aggregation. Representative passages are selected by original finding IDs, preserving disagreements and keeping internal context separate. Reports disclose the number of sources analyzed and how many verified findings were shortlisted; selected examples are not demand counts. Analysis progress distinguishes reading, organizing evidence, and final report generation. Both Workflow and local-worker runners use these checkpoints.
- Exact file copies are removed from file, ZIP, and folder selections before upload. Matching saved sources are selected automatically without another upload; edited files and sources owned by other users remain separate. Checksums ignore filenames and file-selection timestamps. Existing originals and historical report citations retain their IDs. Duplicate source selections are analyzed once, with explicit company-context classification taking precedence over customer or automatic classification.
- Exact source passage matching uses page/slide/text locations, including untimestamped notes. Source matching does not validate an AI interpretation or customer identity; reports remain clearly labeled drafts.
- Company context and uncertain attribution cannot count as supporting or opposing customer evidence. Users can mark any source as company context. Automatic attribution is a model judgment and requires review.
- Source originals stay private. Citations open the matching passage, with original downloads and page navigation.
- Background jobs checkpoint source analysis and persist reports. Updates reuse findings from unchanged sources, create report history, and describe changes. Repeating unchanged input returns the saved report without another allowance charge.
- Inline opportunity edits use optimistic concurrency. Copy/download Markdown or use the print layout to save a PDF.
- Discovery checks the analysis connection and subscription before importing new material. The report opens with analysis status, source coverage, a short opportunity overview, and a visible sample quote. Detailed summaries and rationale remain available on demand.
- Partial analysis is labeled prominently, including when every selected finding fits in the final report. **Retry omitted material** creates a linked report, copies successful source checkpoints, and retries only omitted batches. The original report, its edits, and validation work remain readable. Recovery has a shared limit of three attempts and does not reserve another included report allowance; external provider usage still applies. Fix connection, quota, or unreadable-file issues before retrying. Recovery uses the original provider/model; changed text belongs in a new discovery.
- New reports distinguish **Direct challenges** from **Risks and constraints** and explain each citation relative to the opportunity. Internal and uncertain material cannot establish customer demand. Historical reports retain their original classification and are labeled **Challenges and risks (legacy classification)** rather than silently reinterpreted.
- **Choose this opportunity** saves a human validation plan with Chosen, Testing, or Reviewed status. Reviewed work requires recorded learning and a Supported, Challenged, or Inconclusive conclusion. Saves use optimistic concurrency. New reports show earlier work linked to its original opportunity; the app does not automatically transfer conclusions to a newly generated idea. Markdown, print/PDF, private account export, and database backups include saved work.
- A fictional, read-only demo opens directly to a three-opportunity report. No provider calls are made in the demo.

### Release acceptance

Automated checks use synthetic notes and a local provider double. They cover separate challenge/risk categories, source ownership, partial recovery with checkpoint reuse, concurrent recovery requests and attempt limits, retained edits and learning, allowance checks, exports, backup/restore, read-only demo boundaries, and mobile layouts. They do not establish real model quality or first-time-user comprehension.

Before promoting this change, run one controlled analysis in a dedicated synthetic account using an approved live provider connection. Include an explicit customer disagreement, an operational constraint, and internal strategy; inspect the original quotes, category explanations, coverage, and saved learning. Record the provider/model and result without storing its key. Apply migrations through 015 before the application release, then verify Preview before Production.

Run five individual first-use sessions without coaching. Use the fictional interviews and internal notes in `tests/fixtures/discovery-acceptance/`. Ask each person to explain what Evidence does, upload the supplied synthetic transcripts, find a problem and its next step, open its source evidence, explain a disagreement versus a risk, choose an opportunity, record an inconclusive result, and find that learning after adding material. Include a partial-analysis recovery task. Record completion, time to first useful result, misunderstandings, and assistance needed. Release only when all five recognize partial coverage and retain their learning, and at least four complete the core journey unaided. Fix and retest any misleading evidence interpretation or blocked task. These human checks remain pending until performed by real participants.

### Customers and Signals

Migration **011**, included in `npm run db:migrate`, adds Customers and Signals. No new AI key, provider call, or re-analysis is needed to browse existing findings.

- **Customers** lists companies with conversations, the latest recorded meeting date, and missing-date indicators. Open a company for its conversation history, source notes, and recurring takeaways. Clear `Company:`, `Organization:`, or `Account:` labels create company records when customer evidence is analyzed; exact matches to existing names or aliases link automatically. Unclear names appear in **Confirm companies**, with an editable suggestion. People are not automatically created as companies. ISO dates in `Date:` or `Meeting date:` fields are recognized; otherwise the date stays unknown until entered. Upload dates are never used as meeting dates.
- **Signals** opens to themes with distinct linked-company counts and opposing views. Open a theme to inspect findings and original quotes, or switch to **All signals** for a chronological, searchable list. Themes reuse saved report groupings to join related findings with different problem wording, match repeated problem labels, and reuse existing legacy feature groupings; use **Edit company or theme** to correct a grouping. Unassigned, uncertain, unverified, and hidden signals do not increase theme company counts. Company counts describe linked source evidence, not validated demand.
- The library reads the full findings from the latest successful extraction of each document, including findings left out of a report’s representative shortlist. Reusing a source in another report does not duplicate its signals; a newer successful empty extraction removes obsolete findings from the current view. Existing transcript/customer/signal records also appear, with byte-identical imports and passages deduplicated.
- Company **Actions** supports rename and merge. Previous names continue to match through aliases, and merges preserve original records and report history. Conversation details and signal attribution can be corrected without an approval queue. **Hide signal** removes noise from the active view; **Show hidden signals** exposes a restore action. These corrections are stored separately from original notes and report snapshots, included in private data exports and database backups, and protected against stale edits.
- Lists are paged in batches of 50. The fictional demo supports both views and source drill-down while blocking every cleanup write.

### Commercial launch configuration

Evidence has one plan: **$10 USD/month**, one owner and private workspace, all current features, no free trial. The public fictional demo is available before purchase. Customers connect their own OpenAI, Anthropic, Groq, or Gemini API key and pay provider charges separately. App-funded AI is disabled even if an old `INCLUDED_AI_API_KEY` remains in the environment. Saved reports remain readable; older app-funded jobs must be replaced with a new discovery using the customer's key.

Apply migrations through **015** with `npm run db:migrate` before deploying. They preserve existing data, add subscription/account records and deletion/concurrency safeguards, and enforce 1 GB of originals, 25 million extracted text characters per workspace, and one active analysis per owner. Legacy original sizes are estimated from stored pages until exact sizes are available. There are no automatic overage charges. Existing accounts are never charged automatically.

Stripe Checkout and the customer portal manage subscriptions. Configure `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (an active USD 1,000-cent monthly recurring price), `STRIPE_PORTAL_CONFIGURATION_ID` (the Evidence-specific cancellation configuration), and `STRIPE_WEBHOOK_SECRET` independently for Preview/sandbox and Production/live mode. Register `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Signature validation is required; the webhook is outside browser-session/CSRF authentication. Retries are idempotent; subscription state is fetched under a database lock rather than trusting event delivery order. Only paid invoice periods grant access. Refresh payment status in Settings reconciles a delayed webhook. Configure the Stripe portal to permit cancellation at the end of the paid period, payment method changes, and invoice downloads.

After paid access ends, work remains readable/exportable for 30 days and is then scheduled for deletion. Maintenance checks Stripe directly before expiry deletion so a missed renewal webhook does not destroy paid work. At the end of the export window, it expires open checkouts, cancels remaining subscriptions, and voids unpaid subscription invoices (discarding drafts) before deleting the workspace. A newly settled payment defers cleanup. Account deletion immediately blocks new work and clears API keys, cancels open checkout/subscriptions and closes their unpaid invoices, then deletes account records and queues private originals for cleanup. External cancellation failures leave a deletion request that maintenance retries; never clear it manually to reactivate a deleted account.

**Agreed preproduction deferrals:** use the free `evidence-product-discovery.vercel.app` hostname; do not purchase a domain yet. Email verification and password-reset emails are intentionally deferred at Jonathan's request. Password changes and signing out all sessions work in Settings. Resend terms were accepted, but its integration could not provision against a free public domain; no Resend resource, fake sender, or email-verification bypass is shipped. Complete a verified sender and the email features before a general launch, or explicitly accept their absence. No customer LLM key is provisioned by this work.

`/pricing`, `/help`, `/privacy`, and `/terms` describe the offer and data handling. Set `LEGAL_OPERATOR_NAME` and `SUPPORT_EMAIL` to real business information before sales, and review the policy drafts for the countries served. Provider credentials pass through Evidence servers; BYOK is not local-only processing. The plan does not promise enterprise compliance or uptime guarantees.

## Run locally

Requires Node.js 22.x and PostgreSQL 14+.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL and a random APP_SECRET of at least 32 characters.
# Create an empty database using your PostgreSQL installation.
npm run db:migrate
npm run dev:all
```

Open http://127.0.0.1:3000 and create an account. Open Settings to connect an OpenAI, Anthropic, Groq, or Gemini API key, then subscribe. Use sandbox payments for development; the demo does not need a subscription. New connections use a default model; existing connections retain their saved model. Keys are verified before saving, encrypted with AES-256-GCM, and never returned by the API or included in exports. Keep APP_SECRET stable; changing it prevents decryption of saved keys.

`npm run dev:all` runs both the web server and the durable job worker. For production, run `npm run build`, then run `npm start` and `npm run worker` as separate long-lived processes. Jobs survive restarts, retry transient failures up to three attempts, and recover stale worker leases.

## Existing data

No records or database tables are deleted by the interface simplification. Existing reports, citations, source originals, and exports keep their IDs. Historical customer, signal, feature, and decision records remain available through the private export and compatibility APIs. Authentication, ownership checks, quote validation, and provider-key encryption remain enforced.

On a machine with limited disk space, `EVIDENCE_BUILD_NO_CACHE=1 npm run build` disables only the Webpack disk cache.

## Tests

```sh
npm run typecheck
npm run test:unit
npm run test:ops
npm run test:e2e
npm run build && npm run test:production
# Interactive Playwright runner:
npm run test:e2e:ui
```

E2E tests use installed Google Chrome by default. Set `PLAYWRIGHT_CHANNEL=chromium` and run `npx playwright install chromium` to use Playwright-managed Chromium instead. The runner creates a separate database named `<DATABASE_NAME>_e2e`, private test uploads in `.local/e2e-data`, an app on port 3100, and an HTTP mock provider on port 3101. Set `TEST_DATABASE_URL` to an existing test database whose name ends in `_e2e` if the database role cannot create databases.

**The tests exercise real browser UI, authentication, API endpoints, PostgreSQL, file parsing, the official Blob SDK, and the actual Workflow SDK local runtime. External AI and Blob HTTP services are replaced with local service doubles. There is no polling worker in the E2E suite.** No real provider calls are made by the automated suite. The mock asserts the provider-specific structured-output request shape. Live provider behavior and billing must be checked using the user's own keys; saving a new key makes a live authenticated validation request outside test mode.

Playwright's HTML report is written to `playwright-report/index.html`; failures retain screenshots and traces in `test-results/`. Desktop and mobile scenarios cover the full journey and integrity/failure boundaries. See `tests/e2e/` for the executable coverage. GitHub Actions runs the same checks and production build against PostgreSQL with Playwright-managed Chromium.

## Groq Free accounts

New accounts default to Groq / `openai/gpt-oss-20b`. Migration `008` also updates untouched OpenAI defaults only for accounts with no saved provider keys; configured accounts and existing jobs keep their selection.

All Groq generation calls share a PostgreSQL-backed budget by API-key fingerprint and model across users and workers: 30 requests/minute, 1,000 requests/rolling 24 hours, 8,000 tokens/minute, and 200,000 tokens/rolling 24 hours. Input/schema bytes plus the output allowance conservatively reserve tokens (at most one full minute's budget), then successful responses reconcile actual usage. Failed/uncertain calls retain their reservation. Provider remaining-budget headers can tighten pacing, and `Retry-After` pauses all jobs sharing the same key/model. Hosted workflows sleep durably; local jobs requeue without consuming failure retries. Completed checkpoints are preserved. Large requests rejected by Groq fail with guidance to reduce input.

These are conservative Free defaults, not a guarantee against 429s: Groq quotas are organization-wide, while Evidence can identify only the supplied key. Other apps or different keys in the same Groq organization can consume capacity; provider headers and 429 cooldowns handle those cases. Higher paid limits do not automatically increase Evidence's pacing. No provider keys or source text are stored in the rate-limit ledger.

Apply migrations through `008`, then open Settings → AI provider → **Groq**. Create a key at [Groq Console](https://console.groq.com/keys) using a Free account, paste the key, and select **Save connection**. The recommended starting model is `openai/gpt-oss-20b`. Keys are encrypted and excluded from exports; removing a Groq key preserves other providers' keys.

Groq uses Chat Completions with strict JSON validation, a 2,048-token output cap, low reasoning effort for GPT-OSS, and smaller discovery source batches. Discovery extraction constrains quotes to original sentence passages bound to their source and page, followed by exact text and offset checks. Long sentences are divided into passages of at most 600 characters. Provider-requested retry delays are honored and completed batches are preserved. Credit exhaustion and oversized requests return actionable errors without futile automatic retries. Groq JSON-generation failures receive bounded retries without exposing rejected output.

Discovery source batches each have their own three-attempt budget for transient provider and validation failures. A failed batch is checkpointed with a warning, and remaining documents continue. Warnings identify omitted batches and filenames during processing, in the saved report, and in Markdown downloads; coverage excludes incomplete sources. If every batch fails, no report is published. Retrying a failed analysis reopens omitted batches while preserving successful source checkpoints.

Free limits vary by model and account. Start with a few calls: a large analysis may still exceed account limits. No paid plan is required by Evidence, but a paid Groq account follows its own billing plan. Live Groq behavior requires a real account key; automated provider tests use a local mock.

## Gemini Free accounts

Select **Google Gemini** in Settings → AI provider. Create a key in [Google AI Studio](https://aistudio.google.com/api-keys), enter it in the password field, and select **Save connection**. Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`) is the default and has a [free API tier](https://ai.google.dev/gemini-api/docs/pricing). Free access and quotas depend on your Google project.

Gemini uses Google's OpenAI-compatible endpoint with JSON Schema output and local validation. Keys are encrypted at rest and excluded from exports. Groq's saved rate-limit budget does not apply to Gemini. Existing analyses retain their original provider; start a new report after switching. Apply migration `010` before deploying this version.

Google may use free-tier prompts and responses to improve its products. Use fictional test material; see [Google's terms](https://ai.google.dev/gemini-api/terms) before uploading customer data. Automated tests use a local provider double; a live connection requires your own Gemini key.

## Public sales demo

Open [the sales demo](https://evidence-product-discovery.vercel.app/demo), or click **Explore demo** on the welcome screen. No registration or shared password is required. Each visitor receives an independent two-hour demo session; personal sign-in stays separate. The default demo opens a concise opportunity report with source passages and validation steps. Older tour links return to the report workspace.

HarborOps and all sample organizations are fictional. The stored dataset includes 8 customers, 3 products, 12 transcripts, 40 signals, 8 features, 4 decision briefs, 8 assessments, and 12 discovery questions. Quotes and demand totals use the same verification and calculation functions as personal workspaces. Sample AI proposals and processing history are prerecorded; no provider keys, calls, or billed usage are involved.

After applying migrations, provision the dataset with:

```sh
npm run demo:seed
```

The command uses `DIRECT_DATABASE_URL` when set, otherwise `DATABASE_URL`. Hosted originals are written to versioned, content-addressed paths in the configured private Blob store; local originals use `DATA_DIR`. The seed takes an advisory lock, checks the reserved demo identity, and publishes records in one transaction. Repeating the same version is a no-op. To publish a revised sample, update the fixtures in `lib/demo-data.ts` and bump `DEMO_VERSION` in `lib/demo-constants.ts`, then rerun the seed. Only the dedicated demo account's records are replaced; personal accounts and existing demo sessions are preserved. Superseded originals use the existing deferred storage cleanup.

Demo routes use `/demo/*` and `/api/demo/*`, a separate cookie, and server-validated account roles. Every application write is blocked, including direct API calls, uploads, provider/model requests, extraction, drafting, and retries. Background recovery and workers exclude demo jobs. The UI disables write controls while preserving navigation, filters, evidence inspection, synthetic source downloads, and workspace export. Creating a personal account starts an empty workspace. An editable sandbox and live AI generation are outside this demo's scope. The additional simple report reuses the same fictional source material.

Deployments apply the additive demo migration and seed the target environment before publishing the app. Provision and verify Preview first, then Production. Playwright covers the public walkthrough, reports, basic Settings, read-only APIs, personal-account isolation, session expiry, independent visitors, seeding, background-work guards, and mobile layout.

## Hosting on Vercel

Live app: [Evidence](https://evidence-product-discovery.vercel.app). Deployed to the JonathanLwowski Vercel account on October 28, 2026, using the existing Hobby plan, separate free Neon databases, and separate private Blob stores for Production and Preview.

Hosted verification passed for HTTPS sign-in, secure sessions, navigation, a private upload/download above 4.5 MB, cleanup, and actual Workflow dispatch/step execution through a controlled missing-key failure. Paid AI generation was not exercised; users connect their own provider keys in Settings.

The app now runs on Vercel with Neon PostgreSQL, private Vercel Blob, and Vercel Workflows. No persistent filesystem or separate worker is required in production. The local filesystem/polling worker remains available through `npm run dev:all`. Run `nvm install && nvm use` first when your shell defaults to an older Node version.

Use Node 22 and Vercel region `iad1`, with Neon in AWS `us-east-1`. The daily maintenance schedule works on Hobby. Opening the app also recovers the signed-in user's pending jobs after responding, so dispatch recovery does not wait for the daily cleanup. On a plan supporting frequent cron jobs, the schedule can be increased to every five minutes. `vercel.json` disables automatic Git deployments so a new build cannot become live before its migrations and checks run. The deployment workflow is manually dispatched; no pull request is merged by automation.

### Provision the two environments

1. Create a Vercel project for this repository with the Next.js framework and Node 22. Create private Blob storage for Preview and separate private Blob storage for Production. Enable Workflows for the project if the account requires activation.
2. Create separate Neon Preview and Production databases. Preview must contain synthetic data; do not branch production customer data into Preview. Prefer separate projects for the strongest isolation. Use a pooled connection URL in each Vercel environment, and keep the direct connection URL only in deployment/backup CI.
3. Set these environment-scoped Vercel variables: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `APP_SECRET` (32+ random characters), `CRON_SECRET` (a separate 32+ character random value), `COOKIE_SECURE=true`, `JOB_RUNNER=workflow`, and `APP_URL` (the environment's stable HTTPS origin). Preserve APP_SECRET across deployments: it encrypts users' saved provider keys. No app-wide OpenAI, Anthropic, Groq, or Gemini keys are needed.
4. Create GitHub environments named `preview` and `production`. Add the matching secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `APP_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `HOSTED_TEST_EMAIL`, and `HOSTED_TEST_PASSWORD`. Set the `APP_URL` environment variable in GitHub to exactly the value configured in Vercel. The hosted smoke account must exist in that environment and have synthetic data. For a protected Preview deployment, also provide `VERCEL_AUTOMATION_BYPASS_SECRET`.
5. Require reviewers on the GitHub `production` environment. Run **Deploy to Vercel → preview** first, inspect its deployment and browser test artifact, then dispatch **production** for the reviewed commit. CI validates the target, takes the migration advisory lock, applies checksum-tracked migrations, binds the database to one environment, verifies Vercel's runtime variables match CI, builds, deploys, and runs the hosted browser smoke check. Production deployment is never triggered by a pull request or push.

Do not set `DIRECT_DATABASE_URL`, any `E2E_*` variables, a Blob API URL override, or any `WORKFLOW_LOCAL_*` variables in Vercel. The Workflow SDK selects its hosted backend automatically. Do not place auth middleware in front of the SDK-generated `/.well-known/workflow/` routes; the SDK validates platform delivery. Blob callbacks go to `/api/uploads/token`; only token issuance requires a browser session, while completion requires the provider signature.

### Behavior and recovery

- The browser reserves uploads through a small authenticated request, then sends file bytes directly to a private Blob store using a path-specific, expiring, non-overwriting token. Completion verifies the expected size, decodes UTF-8, checks archive paths/expansion limits, computes hashes, and stores canonical text. Combined uploads and expanded ZIPs remain limited to 10 MB. Large pasted text uses the same path. Original bytes remain inaccessible without authorization.
- Workflows persist chunk boundaries and results in PostgreSQL. Each extraction step makes one bounded provider call. Only job IDs, chunk indexes and counts enter workflow arguments/results; raw transcripts and decrypted keys stay inside steps. Completed chunks survive retries, including a manual retry with the same source/provider/model/prompt version. Publication is atomic and preserves reviewed fields. Brief generation rejects an evidence payload above 180 KB and asks the user to reduce linked evidence.
- Committed jobs are an outbox: dispatch failures are recovered by `/api/maintenance`. Duplicate deliveries serialize on database row locks and skip completed chunks/publication. Platform-failed or cancelled runs become retryable jobs. Maintenance also expires reservations, deletes queued private objects, and expires sessions/auth attempts. Canonical uploads register a delayed cleanup intent before writing, so an interrupted database insert cannot leave a permanent orphan. Vercel Cron runs on Production deployments; Preview maintenance can be invoked with its bearer secret, and the hosted CI smoke script does so after its checks. Cron requires a constant-time checked bearer secret. Deletion is queued in the same transaction as source removal and retried on storage failures.
- Workspace collections are fetched in bounded pages (up to 50 rows / 256 KB) and combined before calculating totals, so metrics include all pages. Search is available on `/api/workspace/{collection}?q=...&offset=...`. The current UI loads all collection pages to preserve linked selectors and executive filters; very large accounts will need route-specific loading as a later performance improvement. Transcript rendering uses 20,000-character windows with original offsets. Authorized originals and JSON exports stream through the server.
- Application rollback uses Vercel's previous deployment. Migrations are additive and do not run in the build command. Never edit an applied migration; add a new numbered entry. A database rollback requires an explicit restore into a new empty database, followed by connection cutover. A hosted smoke failure after production deployment is reported as a failed release and needs an operator to inspect or roll back; CI never silently changes the database back.

### Backups and restore

Run `npm run backup -- /absolute/path/to/new-backup-directory` from a trusted operations host with PostgreSQL command-line tools and a direct database connection. It creates a consistent SQL snapshot; canonical source text is in PostgreSQL. Retain APP_SECRET separately in a secret manager.

Restore with `npm run restore -- /absolute/path/to/backup-directory` while pointing DATABASE_URL at a **new, empty database**. Restore refuses an existing schema, checks every original SHA-256 digest, and reconstructs originals into private Blob if `BLOB_READ_WRITE_TOKEN` is set (otherwise local files). Use a new isolated private store for a hosted restore. Pending storage deletions/reservations are discarded, and formerly active jobs become failed/retryable rather than referring to old Workflow runs. A backup retains its environment binding; restore Production into a new Production database. Pause web writes during cutover, verify restoration, then change runtime/migration URLs together and redeploy.

The automated suite covers local backup/restore, actual local Workflows with checkpoint retries, private direct uploads above 4.5 MB, paged reads/source windows, ownership/CSRF/callback boundaries, and cleanup. `npm run test:hosted` verifies deployed HTTPS navigation, secure sessions and Blob configuration with a dedicated synthetic account. CI also enables a live 5+ MB private upload/download check; set `HOSTED_TEST_AI=true` in the GitHub environment to exercise its smoke account's saved provider key and actual hosted Workflow (this incurs provider usage). The script deletes its synthetic transcripts afterward and retains only a screenshot, avoiding credential-bearing network traces. These hosted upload/AI checks require connected service credentials; local passing tests alone do not prove live Neon/Blob/Workflow provisioning.

## Launch operations and remaining release gates

The Stripe Marketplace sandbox resource `stripe-camel-mirror` is connected to the project. It has a real test-mode $10 monthly price and a cancellation portal. Local billing secrets are ignored by Git; never copy them into source or logs. `npm run test:stripe` exercises the real sandbox, creates synthetic records, then removes its customer/subscription. It refuses a live price. It does not exercise a browser payment form or publicly delivered webhooks. Claim and activate a live Stripe account before accepting real payments, configure a separate live price/portal/webhook, and verify the full flow in Preview before Production.

Use Node 22 for all commands. `npm run test:ops` includes commercial boundaries and encrypted-backup tamper checks. `npm run metrics` prints only aggregate account, connected-key, report, return-usage, and validation-plan counts. Recruit five paying pilot customers manually and record setup friction, useful reports, renewal intent, support time, and actual infrastructure costs. The metrics are operational counts, not validated demand or profit.

`.github/workflows/operations.yml` schedules a daily encrypted backup and protected maintenance/health check. Create a GitHub **operations** environment with `DIRECT_DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `BACKUP_ENCRYPTION_KEY`, and `CRON_SECRET` secrets and the `APP_URL` variable. Use a dedicated backup key from a secret manager, separate from `APP_SECRET`; keep both available for disaster recovery. Enable notifications for workflow failures. Backups are AES-256-GCM authenticated archives, retained as GitHub artifacts for 30 days; keep the repository private and restrict operations access. Do not use a backup environment that requires interactive approval for every scheduled run. No secrets have been added to GitHub by this change.

`npm run backup:encrypted -- /absolute/new-backup.evb` creates a new encrypted archive and removes temporary plaintext. `npm run restore:encrypted -- /absolute/backup.evb` authenticates the complete archive before extraction, then uses the existing empty-database and source-hash-verified restore. Use a new database and isolated private Blob store. Before cutover, replay account deletion requests received since the snapshot from your independently retained operations record; this is a required manual step. Verify restored reports, original bytes, saved learning, and keys, then change runtime/migration database URLs together. Keep the previous deployment available for application rollback; never reverse applied migrations or merge PRs automatically.

`npm run health` invokes authenticated maintenance and fails for stuck processing jobs, recent failed analyses, repeated storage cleanup failures, or past-due accounts. Workflow failures are the operator alert. Never include source content, passwords, keys, or raw provider error bodies in monitoring. Configure Vercel spend alerts/budgets in its dashboard and measure Neon/Blob/Workflow costs before committing publicly to the capacity limits. Upgrade to commercial-compatible hosting before selling; the currently documented Hobby plan is not a commercial launch plan. No hosting upgrade or recurring paid infrastructure purchase has been made.

Pending real-world gates: a hosted restore drill, live production billing and webhook verification, controlled live customer-key analyses, five uncoached human sessions using `tests/fixtures/discovery-acceptance/`, reviewed business/policy details, and a five-customer paid pilot. Automated synthetic checks cannot stand in for those sessions. Keep production sales closed until the applicable gates are completed. Email features and a custom domain remain explicitly deferred.
