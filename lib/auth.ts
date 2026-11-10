import { hashPassword, checkPassword } from "./crypto";
export { hashPassword, checkPassword, encrypt, decrypt } from "./crypto";
import { randomBytes, createHash, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { query, transaction, AppError, id } from "./db";
import { DEMO_EMAIL } from "./demo-constants";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const sessionCookie = (demo: boolean) =>
  demo ? "evidence_demo_session" : "evidence_session";
export async function currentUser(demo = false) {
  const token = (await cookies()).get(sessionCookie(demo))?.value;
  if (!token) return null;
  const [u] = await query(
    "SELECT u.id,u.email,u.name,u.is_demo,u.deletion_requested_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_demo=$2",
    [hash(token), demo],
  );
  return u ?? null;
}
export async function requireUser(demo = false) {
  const u = await currentUser(demo);
  if (!u) throw new AppError("Sign in to continue", 401);
  return u;
}
export async function newSession(
  user: string,
  demo = false,
  expectedPasswordHash?: string,
) {
  const token = randomBytes(32).toString("hex");
  const lifetime = demo ? 2 * 60 * 60 : 14 * 24 * 60 * 60;
  await transaction(async (c) => {
    const {
      rows: [account],
    } = await c.query(
      "SELECT is_demo,password_hash FROM users WHERE id=$1 FOR UPDATE",
      [user],
    );
    if (
      !account ||
      account.is_demo !== demo ||
      (expectedPasswordHash !== undefined &&
        account.password_hash !== expectedPasswordHash)
    )
      throw new AppError("Email or password is incorrect", 401);
    await c.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3::int * interval '1 second'))",
      [hash(token), user, lifetime],
    );
  });
  (await cookies()).set(sessionCookie(demo), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: lifetime,
  });
}
export async function startDemo(req: Request) {
  if (await currentUser(true)) return { ok: true };
  const [demo] = await query(
    "SELECT u.id FROM users u JOIN demo_dataset d ON d.user_id=u.id WHERE u.is_demo",
  );
  if (!demo)
    throw new AppError(
      "The demo is being prepared. Please try again shortly.",
      503,
    );
  const address = (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown"
  ).slice(0, 256);
  const identity =
    "demo:" +
    createHmac("sha256", process.env.APP_SECRET!).update(address).digest("hex");
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [identity]);
    const {
      rows: [count],
    } = await c.query(
      "SELECT count(*)::int AS n FROM auth_attempts WHERE identity=$1 AND created_at>now()-interval '15 minutes'",
      [identity],
    );
    if (count.n >= 120)
      throw new AppError(
        "Too many demo sessions. Please try again later.",
        429,
      );
    await c.query("INSERT INTO auth_attempts(identity) VALUES($1)", [identity]);
  });
  await newSession(demo.id, true);
  return { ok: true };
}
export async function signOut(demo = false) {
  const c = await cookies();
  const token = c.get(sessionCookie(demo))?.value;
  if (token)
    await query(
      "DELETE FROM sessions WHERE token_hash=$1 AND user_id IN (SELECT id FROM users WHERE is_demo=$2)",
      [hash(token), demo],
    );
  c.delete(sessionCookie(demo));
}
export async function register(email: string, name: string, password: string) {
  if (email.toLowerCase() === DEMO_EMAIL)
    throw new AppError("This address is reserved for the public demo", 400);
  const user = id();
  await transaction(async (c) => {
    await c.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [user, email.toLowerCase(), name, hashPassword(password)],
    );
    await c.query("INSERT INTO settings(user_id) VALUES($1)", [user]);
  });
  await newSession(user);
  return user;
}
