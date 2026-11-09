import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

export class GroqRateWait extends Error {
  constructor(public seconds: number) {
    super(
      "Groq rate limit: analysis will resume automatically when capacity is available.",
    );
  }
}
type Reservation = { id: string; at: number; tokens: number };
// Groq Free GPT-OSS limits: https://console.groq.com/docs/rate-limits
export const groqLimits = { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 };
const minute = 60000,
  day = 86400000;

export function groqWait(events: Reservation[], tokens: number, now: number) {
  let wait = 0;
  for (const [duration, requests, budget] of [
    [minute, groqLimits.rpm, groqLimits.tpm],
    [day, groqLimits.rpd, groqLimits.tpd],
  ]) {
    const active = events
      .filter((e) => e.at + duration > now)
      .sort((a, b) => a.at - b.at);
    let count = active.length,
      total = active.reduce((sum, e) => sum + e.tokens, 0);
    for (const event of active) {
      if (count + 1 <= requests && total + tokens <= budget) break;
      wait = Math.max(wait, event.at + duration - now);
      count--;
      total -= event.tokens;
    }
  }
  return Math.ceil(wait / 1000);
}

// Separate connections keep committed reservations alive when a job transaction rolls back.
const global = globalThis as unknown as { groqRatePool?: pg.Pool };
const ratePool =
  global.groqRatePool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
if (!global.groqRatePool) {
  ratePool.on("error", () =>
    console.error("Groq rate-limit database connection interrupted"),
  );
  if (process.env.VERCEL) attachDatabasePool(ratePool);
}
global.groqRatePool = ratePool;

// shortcut: Different keys in one organization rely on provider cooldowns; group by org if Groq exposes its identity.
function bucket(key: string, model: string) {
  return createHash("sha256")
    .update(key)
    .update("\0")
    .update(model)
    .digest("hex");
}
async function update<T>(
  key: string,
  model: string,
  fn: (state: any, now: number) => T,
) {
  const client = await ratePool.connect();
  try {
    await client.query("BEGIN");
    const id = bucket(key, model);
    await client.query(
      "INSERT INTO groq_rate_limits(id) VALUES($1) ON CONFLICT DO NOTHING",
      [id],
    );
    const {
      rows: [row],
    } = await client.query(
      "SELECT state FROM groq_rate_limits WHERE id=$1 FOR UPDATE",
      [id],
    );
    const {
      rows: [clock],
    } = await client.query(
      "SELECT extract(epoch FROM clock_timestamp()) * 1000 AS now",
    );
    const now = Number(clock.now),
      state = row.state;
    state.events = (state.events ?? []).filter(
      (e: Reservation) => e.at + day > now,
    );
    const result = fn(state, now);
    await client.query(
      "UPDATE groq_rate_limits SET state=$2,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(state)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveGroq(key: string, model: string, body: unknown) {
  // UTF-8 bytes conservatively cover input tokenization and schema overhead.
  // A larger request owns the entire minute; Groq remains authoritative on single-request size.
  const tokens = Math.min(
    groqLimits.tpm,
    Buffer.byteLength(JSON.stringify(body)) + 2048 + 256,
  );
  const reservation = randomUUID();
  const wait = await update(key, model, (state, now) => {
    let seconds = Math.max(
      groqWait(state.events, tokens, now),
      Math.ceil(((state.blockedUntil ?? 0) - now) / 1000),
    );
    for (const [name, needed] of [
      ["tokens", tokens],
      ["requests", 1],
    ] as const) {
      const remote = state[name];
      if (remote?.until > now && remote.remaining < needed)
        seconds = Math.max(seconds, Math.ceil((remote.until - now) / 1000));
    }
    if (seconds <= 0) {
      state.events.push({ id: reservation, at: now, tokens });
      for (const [name, needed] of [
        ["tokens", tokens],
        ["requests", 1],
      ] as const)
        if (state[name]?.until > now) state[name].remaining -= needed;
    }
    return seconds;
  });
  if (wait > 0) throw new GroqRateWait(wait);
  return reservation;
}

export function groqResetDuration(value: string | null) {
  if (!value) return 0;
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)];
  if (!parts.length || parts.map((p) => p[0]).join("") !== value) return 0;
  const duration = parts.reduce(
    (sum, p) =>
      sum +
      Number(p[1]) *
        ({ ms: 1, s: 1000, m: minute, h: 3600000, d: day }[p[2]] ?? 0),
    0,
  );
  return Number.isFinite(duration) ? duration : 0;
}

export async function observeGroq(
  key: string,
  model: string,
  reservation: string,
  response: Response,
  usage?: { total_tokens?: number },
) {
  return update(key, model, (state, now) => {
    const event = state.events.find((e: Reservation) => e.id === reservation);
    if (
      event &&
      Number.isSafeInteger(usage?.total_tokens) &&
      usage!.total_tokens! >= 0
    )
      event.tokens = usage!.total_tokens;
    for (const name of ["tokens", "requests"]) {
      const raw = response.headers.get(`x-ratelimit-remaining-${name}`);
      const remaining = raw === null ? NaN : Number(raw);
      const duration = groqResetDuration(
        response.headers.get(`x-ratelimit-reset-${name}`),
      );
      if (!Number.isFinite(remaining) || remaining < 0 || !duration) continue;
      const previous = state[name];
      // Out-of-order responses can only tighten an active budget.
      state[name] = {
        remaining:
          previous?.until > now
            ? Math.min(previous.remaining, remaining)
            : remaining,
        until: Math.max(previous?.until ?? 0, now + duration),
      };
    }
    if (response.status === 429) {
      const raw = response.headers.get("retry-after");
      const seconds = raw === null ? NaN : Number(raw);
      const until =
        Number.isFinite(seconds) && seconds > 0
          ? now + seconds * 1000
          : raw
            ? Date.parse(raw)
            : NaN;
      state.blockedUntil = Math.max(
        state.blockedUntil ?? 0,
        Number.isFinite(until) && until > now ? until : now + minute,
      );
      return Math.ceil((state.blockedUntil - now) / 1000);
    }
    return 0;
  });
}
