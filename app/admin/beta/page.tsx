import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isBetaAdmin } from "@/lib/beta-admin";
import { query } from "@/lib/db";
import { ApprovalList, type Approval } from "./approval-list";

export default async function BetaAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!isBetaAdmin(user)) notFound();

  const approvals = await query<Approval>(
    `SELECT approval_id AS id,approved_email AS email,user_id IS NOT NULL AS active
     FROM beta_invitations WHERE approved_email IS NOT NULL ORDER BY slot`,
  );

  return (
    <main className="launch-info stack">
      <Link className="brand" href="/">
        evidence.
      </Link>
      <h1>Beta access</h1>
      <ApprovalList approvals={approvals} />
    </main>
  );
}
