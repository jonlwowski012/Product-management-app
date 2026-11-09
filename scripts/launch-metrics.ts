import "dotenv/config";
import assert from "node:assert/strict";
import { query, pool } from "../lib/db";
try {
  const [metrics] = await query(`SELECT
    (SELECT count(*)::int FROM users WHERE NOT is_demo) AS accounts,
    (SELECT count(*)::int FROM subscriptions WHERE paid_until>now()) AS paying_accounts,
    (SELECT count(*)::int FROM settings s JOIN users u ON u.id=s.user_id WHERE NOT u.is_demo AND (CASE s.provider WHEN 'openai' THEN s.openai_key WHEN 'anthropic' THEN s.anthropic_key WHEN 'groq' THEN s.groq_key WHEN 'gemini' THEN s.gemini_key END) IS NOT NULL) AS connected_accounts,
    (SELECT count(DISTINCT r.user_id)::int FROM discovery_reports r JOIN users u ON u.id=r.user_id WHERE NOT u.is_demo AND r.result IS NOT NULL) AS accounts_with_reports,
    (SELECT count(*)::int FROM (SELECT r.user_id FROM discovery_reports r JOIN users u ON u.id=r.user_id WHERE NOT u.is_demo AND r.result IS NOT NULL GROUP BY r.user_id HAVING count(*)>1) repeated) AS returning_accounts,
    (SELECT count(*)::int FROM discovery_validation_work v JOIN users u ON u.id=v.user_id WHERE NOT u.is_demo) AS validation_plans`);
  assert.ok(
    Object.values(metrics).every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
    "Metrics must be nonnegative aggregate counts",
  );
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  await pool.end();
}
