"use client";

import { useActionState, useState } from "react";
import { BETA_SEATS } from "@/lib/beta-config";
import { manageInvite } from "./actions";

export function InviteManager({
  invitations,
}: {
  invitations: {
    slot: number;
    created_at: string;
    claimed: boolean;
    email: string | null;
  }[];
}) {
  const [result, action, pending] = useActionState(manageInvite, {});
  const [copied, setCopied] = useState<string>();
  const available = BETA_SEATS - invitations.length;

  return (
    <form action={action} className="stack">
      <p>
        {available} of {BETA_SEATS} slots available
      </p>
      <div>
        <button className="button primary" disabled={pending || !available}>
          Create invite
        </button>
      </div>
      {result.link && (
        <div className="stack">
          <label htmlFor="beta-invite-link">
            Copy this one-time link now. You can revoke it later if you lose it.
          </label>
          <input
            id="beta-invite-link"
            readOnly
            value={result.link}
            onFocus={(event) => event.target.select()}
          />
          <div>
            <button
              className="button secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.link!);
                  setCopied(result.link);
                } catch {
                  document.getElementById("beta-invite-link")?.focus();
                }
              }}
            >
              {copied === result.link ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
      {result.message && <p role="status">{result.message}</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {invitations.length > 0 && (
        <ul aria-label="Invitations">
          {invitations.map((invite) => (
            <li key={invite.slot}>
              Slot {invite.slot} ·{" "}
              {invite.claimed
                ? (invite.email ?? "Claimed")
                : "Waiting to be claimed"}{" "}
              {!invite.claimed && (
                <button
                  className="button ghost"
                  name="revoke"
                  value={invite.slot + "|" + invite.created_at}
                  disabled={pending}
                  aria-label={`Revoke invite in slot ${invite.slot}`}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
