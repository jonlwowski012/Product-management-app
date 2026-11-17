import {
  ConnectError,
  NoValidTokenError,
  UserAuthorizationRequiredError,
  revokeToken,
} from "@vercel/connect";
import { AppError, assertWritableUser, query, transaction } from "./db";

export const sourceAuthorizationMs = 15 * 60 * 1000;

export async function rememberSourceGrant(user: string, connector: string) {
  await transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    await assertWritableUser(user, client);
    await client.query(
      `INSERT INTO source_connection_grants(user_id,connector,authorization_until)
       VALUES($1,$2,clock_timestamp()+($3::int * interval '1 millisecond'))
       ON CONFLICT(user_id,connector) DO UPDATE SET authorization_until=excluded.authorization_until`,
      [user, connector, sourceAuthorizationMs + 60_000],
    );
  });
}

export async function disconnectSource(user: string, connector: string) {
  try {
    await revokeToken(connector, { subject: { type: "user", id: user } });
  } catch (error) {
    if (!(
      error instanceof NoValidTokenError ||
      error instanceof UserAuthorizationRequiredError ||
      (error instanceof ConnectError && error.status === 404)
    ))
      throw new AppError(
        "Could not disconnect the source. Try again shortly.",
        503,
      );
  }
  await query(
    "DELETE FROM source_connection_grants WHERE user_id=$1 AND connector=$2 AND authorization_until<=clock_timestamp()",
    [user, connector],
  );
}

export async function disconnectAccountSources(user: string) {
  const grants = await query<{ connector: string; pending: boolean }>(
    "SELECT connector,authorization_until>clock_timestamp() AS pending FROM source_connection_grants WHERE user_id=$1",
    [user],
  );
  // An open consent link can issue a new grant after revocation.
  if (grants.some(({ pending }) => pending))
    throw new AppError(
      "Your account is disabled. Retry deletion in Settings after recent authorization links expire, within 16 minutes.",
      503,
    );
  for (const { connector } of grants) await disconnectSource(user, connector);
}
