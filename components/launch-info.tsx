import Link from "next/link";
import { userAgreement } from "@/lib/user-agreement";

export function LaunchInfo({ page }: { page: string }) {
  const agreement = userAgreement();
  const support = agreement.contact;
  const operator = agreement.operator;
  const titles: Record<string, string> = {
    pricing: "One plan. $10/month.",
    help: "Get started with Evidence",
    privacy: "Privacy and data handling",
    terms: "User Agreement",
  };
  return (
    <main className="launch-info stack">
      <Link className="brand" href="/">
        evidence.
      </Link>
      <nav aria-label="Information">
        <Link href="/pricing">Pricing</Link> ·{" "}
        <Link href="/help">Setup guide</Link> ·{" "}
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </nav>
      <h1>{titles[page]}</h1>
      {page === "pricing" && (
        <>
          <p>
            Turn customer conversations into opportunities backed by original
            evidence.
          </p>
          <p>
            <strong>$10 USD per month.</strong> One private workspace, one
            owner, all current features. No free trial. Cancel anytime.
          </p>
          <p>
            Bring your own OpenAI, Anthropic, Groq, or Gemini API key. Your
            provider bills AI usage separately. A consumer chat subscription
            does not necessarily include API access or credits.
          </p>
          <p>
            Your workspace can store up to 1 GB of original files and 25 million
            extracted text characters, with one active analysis at a time.
            Uploads are limited to 10 MB per document, 1,000 documents and 500
            MB per import, and 200 pages or slides per document. No automatic
            overage charges apply.
          </p>
          <p>
            Includes Discovery reports, source passages, Customers, Signals,
            report history, human validation work, and data exports.
          </p>
          <p>
            <Link className="button primary" href="/demo">
              Explore the fictional demo
            </Link>{" "}
            <Link href="/">Create your account</Link>
          </p>
        </>
      )}
      {page === "help" && (
        <>
          <ol>
            <li>
              Explore the demo and inspect the original quotes. All demo
              material is fictional; demo analysis is prerecorded.
            </li>
            <li>Create an account with your email and a strong password.</li>
            <li>
              Open Settings, choose your provider, and connect an API key. API
              billing and access must be enabled with that provider.
            </li>
            <li>
              Subscribe for $10/month. AI usage is billed separately by your
              provider.
            </li>
            <li>
              Upload transcripts or paste notes. Mark internal strategy as
              company context, then select Find opportunities.
            </li>
            <li>
              Review source quotes and coverage. Choose an opportunity, test it,
              and record what you learned.
            </li>
          </ol>
          <p>
            Supported: TXT, Markdown, VTT, SRT, text-based PDF, DOCX, and PPTX,
            including folders and ZIP imports. Scans need OCR first. Audio,
            video, screenshots, speaker notes, and charts are not interpreted.
          </p>
          <p>
            Create keys with{" "}
            <a href="https://platform.openai.com/api-keys">OpenAI</a>,{" "}
            <a href="https://console.anthropic.com/settings/keys">Anthropic</a>,{" "}
            <a href="https://console.groq.com/keys">Groq</a>, or{" "}
            <a href="https://aistudio.google.com/api-keys">Google AI Studio</a>.
            Keep provider credentials out of support messages.
          </p>
          <p>
            For rejected keys, check provider permissions. For exhausted credits
            or rate limits, check provider billing and quotas. Completed
            analysis checkpoints are preserved where possible. Partial reports
            identify omitted material; review coverage before relying on a
            result.
          </p>
          <p>
            AI analysis is a draft. Matching a quote to its source does not
            establish customer identity, demand, or a correct interpretation.
          </p>
        </>
      )}
      {page === "privacy" && (
        <>
          <p>
            Evidence stores your account details, agreement acceptance records
            (including the version, accepted text, and timestamp), uploaded
            originals, extracted text, analysis results, edits, and saved
            learning to provide your workspace. Private files require account
            authorization.
          </p>
          <p>
            Relevant source text and prompts are sent through our servers to the
            AI provider you select, using your API key. Evidence is a hosted
            service; bringing a key does not keep your material solely on your
            device. Provider processing, retention, and training terms depend on
            your provider and account plan.
          </p>
          <p>
            Saved provider keys are encrypted, are not returned by account APIs,
            and are excluded from customer exports. Our servers decrypt them
            when making authorized requests. Infrastructure and billing
            providers process information needed to operate the service. Stripe
            handles payment details; Evidence stores subscription identifiers
            and payment status rather than card numbers.
          </p>
          <p>
            We do not sell your uploaded material or use it to train our own
            models. Operational metrics must exclude source text and secrets.
            Authentication uses essential session cookies.
          </p>
          <p>
            You can export your data and delete your account in Settings.
            Deletion disables access, removes saved keys, cancels subscriptions,
            and queues private files for deletion with retries. Financial
            records held by payment providers follow their retention terms.
            Source material already sent to an AI provider follows that
            provider’s terms.
          </p>
          <p>
            After paid access ends, your workspace is read-only for 30 days,
            then scheduled for deletion. Existing accounts without a paid
            subscription are retained during the launch transition. Production
            backups must be stored encrypted and retained for at most 30 days;
            restored environments must reapply account deletion requests before
            serving traffic.
          </p>
        </>
      )}
      {page === "terms" && (
        <>
          <p>Version {agreement.version} · Effective November 10, 2026</p>
          <p>
            This agreement includes warranty disclaimers, limits on liability,
            and an indemnity for business use. Read it before creating an
            account.
          </p>
          <p>
            Contracting operator: {operator}. Contact:{" "}
            <a href={`mailto:${support}`}>{support}</a>.
          </p>
          <p>
            <Link href="/privacy">Privacy and data handling notice</Link>
          </p>
          {agreement.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </>
      )}
      {page === "privacy" && <p>Service operator: {operator}.</p>}
      <footer>
        <a href={`mailto:${support}`}>Contact support</a>
        <p>
          <Link href="/">Back to Evidence</Link>
        </p>
      </footer>
    </main>
  );
}
