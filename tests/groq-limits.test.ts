import { test } from "node:test";
import assert from "node:assert/strict";
import { groqWait, groqResetDuration } from "../lib/groq-limits";

test("Groq budgets enforce request and token ceilings in rolling minute/day windows", () => {
  const now = 100000000;
  const event = (at: number, tokens: number) => ({
    id: String(at),
    at,
    tokens,
  });
  assert.equal(
    groqWait(
      Array.from({ length: 30 }, () => event(now - 1000, 1)),
      1,
      now,
    ),
    59,
  );
  assert.equal(
    groqWait([event(now - 59000, 4000), event(now - 1000, 4000)], 5000, now),
    59,
  );
  assert.equal(groqWait([event(now - 60000, 8000)], 8000, now), 0);
  assert.equal(
    groqWait(
      Array.from({ length: 1000 }, () => event(now - 60000, 1)),
      1,
      now,
    ),
    86340,
  );
  assert.equal(groqWait([event(now - 60000, 199000)], 2000, now), 86340);
  assert.equal(groqWait([event(now - 86400000, 200000)], 8000, now), 0);
});

test("Groq reset headers support composite/fractional durations and reject malformed values", () => {
  assert.equal(groqResetDuration("2m59.56s"), 179560);
  assert.equal(groqResetDuration("1h2m3s4ms"), 3723004);
  for (const value of [null, "", "unknown", "-1s", "3s garbage", "Infinitys"])
    assert.equal(groqResetDuration(value), 0);
});
