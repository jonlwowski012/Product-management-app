import pg from "pg";
import { randomUUID } from "node:crypto";
const g = globalThis as unknown as { discoveryPool?: pg.Pool };
export const pool =
  g.discoveryPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });
if (process.env.NODE_ENV !== "production") g.discoveryPool = pool;
export async function query<
  T extends pg.QueryResultRow = pg.QueryResultRow & { id: string },
>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await pool.query<T>(sql, params)).rows;
  } catch (error) {
    throw capacityError(error);
  }
}
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw capacityError(e);
  } finally {
    c.release();
  }
}
function capacityError(error: unknown) {
  const value = error as { code?: string; message?: string };
  if (
    value?.code === "P0001" &&
    value.message === "Account deletion is in progress"
  )
    return new AppError(value.message, 403);
  return value?.code === "P0001" &&
    /^(One analysis can run|Workspace storage limit reached)/.test(
      value.message || "",
    )
    ? new AppError(value.message!, 409)
    : error;
}
export async function audit(
  user: string,
  action: string,
  type: string,
  id: string | null,
  detail: unknown = {},
) {
  await query(
    "INSERT INTO audit(id,user_id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), user, action, type, id, JSON.stringify(detail)],
  );
}
export const id = randomUUID;
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function assertPersonalUser(user: string, client?: pg.PoolClient) {
  const sql = "SELECT is_demo,deletion_requested_at FROM users WHERE id=$1";
  const [row] = client
    ? (await client.query(sql, [user])).rows
    : await query(sql, [user]);
  if (!row || row.is_demo || row.deletion_requested_at)
    throw new AppError("The demo workspace is read only", 403);
}
export async function assertWritableUser(user: string, client?: pg.PoolClient) {
  await assertPersonalUser(user, client);
  const sql =
    "SELECT s.paid_until FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.id=$1";
  const [row] = client
    ? (await client.query(sql, [user])).rows
    : await query(sql, [user]);
  if (!row.paid_until || new Date(row.paid_until).getTime() <= Date.now())
    throw new AppError(
      "Subscribe for $10/month in Settings to upload or analyze material. Your saved work remains available for export during the retention period.",
      402,
    );
}
export async function assertReadableUser(user: string) {
  const [row] = await query(
    "SELECT paid_until FROM subscriptions WHERE user_id=$1",
    [user],
  );
  if (
    row?.paid_until &&
    new Date(row.paid_until).getTime() + 30 * 86400000 <= Date.now()
  )
    throw new AppError(
      "Your export period has ended and this workspace is scheduled for deletion.",
      410,
    );
}
export async function owned(table: string, recordId: string, user: string) {
  if (
    ![
      "customers",
      "products",
      "transcripts",
      "signals",
      "features",
      "briefs",
      "questions",
      "assessments",
      "jobs",
    ].includes(table)
  )
    throw new Error("Invalid table");
  const [row] = await query(
    `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`,
    [recordId, user],
  );
  if (!row) throw new AppError("Record not found", 404);
  return row;
}
