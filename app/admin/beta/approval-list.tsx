"use client";

import { useActionState } from "react";
import { BETA_SEATS } from "@/lib/beta-config";
import { manageApproval } from "./actions";

export type Approval = { id: string; email: string; active: boolean };

export function ApprovalList({ approvals }: { approvals: Approval[] }) {
  const [result, action, pending] = useActionState(manageApproval, {});
  const available = BETA_SEATS - approvals.length;

  return (
    <div className="stack">
      <p>
        {available} of {BETA_SEATS} slots available
      </p>
      <form action={action} className="stack">
        <label className="field">
          <span>Email address</span>
          <input
            name="email"
            type="email"
            maxLength={254}
            required
            disabled={pending || !available}
          />
        </label>
        <div>
          <button
            className="button primary"
            name="add"
            value="1"
            disabled={pending || !available}
          >
            Add email
          </button>
        </div>
      </form>
      {result.message && <p role="status">{result.message}</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {approvals.length > 0 && (
        <form action={action}>
          <ul aria-label="Approved beta emails">
            {approvals.map((approval) => (
              <li key={approval.id}>
                {approval.email} ·{" "}
                {approval.active ? "Active" : "Awaiting verification"}{" "}
                <button
                  className="button ghost"
                  name="remove"
                  value={approval.id}
                  disabled={pending}
                  aria-label={`Remove ${approval.email}`}
                  onClick={(event) => {
                    if (
                      approval.active &&
                      !window.confirm(
                        `Remove beta access for ${approval.email}?`,
                      )
                    )
                      event.preventDefault();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}
    </div>
  );
}
