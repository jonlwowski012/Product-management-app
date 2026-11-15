import { test, expect, type Page } from "@playwright/test";
import AdmZip from "adm-zip";
import { randomUUID } from "node:crypto";
import { api, seed, signup, testDatabase } from "./helpers";

test("homepage explains transcript handling and links to privacy details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const section = page.getByRole("region", {
    name: "How we handle your transcripts",
  });
  await expect(section).toContainText("Private by default");
  await expect(section).toContainText(
    "provider’s retention and training settings apply",
  );
  await expect(
    section.getByRole("link", { name: "Privacy and data handling" }),
  ).toHaveAttribute("href", "/privacy");
});

test("transcript deletion is private and removes affected reports while keeping other sources", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  await signup(page);
  const {
    sources: [source],
  } = await api(page, "sources", {
    filename: "Interview to remove.txt",
    content: "We need audit logs before we can buy.",
  });
  const {
    sources: [keep],
  } = await api(page, "sources", {
    filename: "Keep interview.txt",
    content: "I would pay for searchable audit history.",
  });
  const first = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + first.id)).job.state, {
      timeout: 45000,
    })
    .toBe("succeeded");
  const child = await api(page, "reports", {
    sources: [{ id: keep.id, role: "customer" }],
    parent_id: first.id,
  });
  await expect
    .poll(async () => (await api(page, "reports/" + child.id)).job.state, {
      timeout: 45000,
    })
    .toBe("succeeded");
  expect(
    (
      await page.request.get("/api/sources/" + source.id + "/download")
    ).status(),
  ).toBe(200);

  const context = await browser.newContext();
  try {
    const outsider = await context.newPage();
    await signup(outsider);
    expect(JSON.stringify(await api(outsider, "export"))).not.toContain(
      "We need audit logs before we can buy.",
    );
    for (const url of [
      "sources/" + source.id,
      "sources/" + source.id + "/download",
      "sources/" + source.id + "/deletion-impact",
      "reports/" + first.id,
    ]) {
      expect(
        (await outsider.request.get("/api/" + url, { maxRetries: 1 })).status(),
      ).toBe(404);
    }
    expect(
      (
        await outsider.request.delete("/api/sources/" + source.id, {
          data: { reportIds: [first.id, child.id] },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
  }

  const signalsBefore = (await api(page, "library/signals?view=all")).total;
  const beforeDeletion = await api(
    page,
    "sources/" + source.id + "/deletion-impact",
  );
  expect(beforeDeletion.signals).toBeGreaterThan(0);
  await page.goto("/?new=1");
  await page
    .getByText("Choose from saved material (2)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "View Interview to remove.txt" })
    .click();
  await page
    .getByRole("button", { name: "Delete transcript", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("2 affected reports");
  await page
    .getByRole("button", { name: "Permanently delete transcript", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Private file cleanup is complete.",
    { timeout: 15000 },
  );
  await page.getByRole("link", { name: "Back to Discovery" }).click();
  expect(
    (
      await page.request.get("/api/sources/" + source.id + "/download", {
        maxRetries: 1,
      })
    ).status(),
  ).toBe(404);
  for (const id of [first.id, child.id])
    expect(
      (
        await page.request.get("/api/reports/" + id, { maxRetries: 1 })
      ).status(),
    ).toBe(404);
  expect(
    (await api(page, "flow")).sources.map((s: { id: string }) => s.id),
  ).toEqual([keep.id]);
  expect((await api(page, "library/signals?view=all")).total).toBe(
    signalsBefore - beforeDeletion.signals,
  );
  expect(
    JSON.stringify(await api(page, "library/signals?view=all")),
  ).not.toContain("We need audit logs before we can buy.");
  expect(JSON.stringify(await api(page, "export"))).not.toContain(
    "We need audit logs before we can buy.",
  );
});

async function storeIncomingZip(page: Page, name: string, zip: AdmZip) {
  const bytes = zip.toBuffer();
  const {
    reservations: [reserved],
  } = await api(page, "uploads/reserve", {
    discovery: true,
    files: [{ name, size: bytes.length }],
  });
  await api(page, "uploads/token", {
    type: "blob.generate-client-token",
    payload: {
      pathname: reserved.pathname,
      clientPayload: reserved.id,
      multipart: false,
    },
  });
  const uploaded = await page.request.put(
    "http://127.0.0.1:3102/?pathname=" + encodeURIComponent(reserved.pathname),
    {
      data: bytes,
      headers: {
        Authorization: "Bearer vercel_blob_rw_e2estore_test-secret",
        "x-vercel-blob-access": "private",
        "Content-Type": "application/zip",
      },
    },
  );
  expect(uploaded.ok()).toBe(true);
  return reserved;
}

test("deletion removes the incoming ZIP while preserving its other saved member", async ({
  page,
}) => {
  await signup(page);
  const zip = new AdmZip();
  zip.addFile("remove.txt", Buffer.from("This interview must be removed."));
  zip.addFile("keep.txt", Buffer.from("Keep this interview in the workspace."));
  const reserved = await storeIncomingZip(page, "interviews.zip", zip);
  await api(page, "uploads/complete", { id: reserved.id });
  await expect
    .poll(async () => (await api(page, "flow")).sources.length)
    .toBe(2);
  const { sources } = await api(page, "flow");
  const remove = sources.find((source: { filename: string }) =>
    source.filename.endsWith("remove.txt"),
  );
  const keep = sources.find((source: { filename: string }) =>
    source.filename.endsWith("keep.txt"),
  );
  const db = testDatabase();
  await db.connect();
  try {
    const {
      rows: [upload],
    } = await db.query(
      "UPDATE upload_reservations SET expires_at=now()-interval '6 minutes' WHERE result->'sources' @> $1::jsonb RETURNING id,blob_url",
      [JSON.stringify([{ id: remove.id }])],
    );
    const inspectArchive = () =>
      page.request.get(upload.blob_url, {
        headers: {
          Authorization: "Bearer vercel_blob_rw_e2estore_test-secret",
        },
      });
    expect((await inspectArchive()).status()).toBe(200);
    await page.request.get("/api/maintenance", {
      headers: { Authorization: "Bearer e2e-maintenance-secret" },
    });
    const impact = await api(page, "sources/" + remove.id + "/deletion-impact");
    const deleted = await api(page, "sources/" + remove.id, impact, "DELETE");
    const status = () =>
      api(page, "sources/" + deleted.receipt + "/deletion-status");
    expect((await status()).pending).toBe(true);
    expect((await inspectArchive()).status()).toBe(200);
    const {
      rows: [completed],
    } = await db.query("SELECT result FROM upload_reservations WHERE id=$1", [
      upload.id,
    ]);
    expect(
      completed.result.sources.map((source: { id: string }) => source.id),
    ).toEqual([keep.id]);

    await db.query(
      "UPDATE storage_deletions SET not_before=now() WHERE source_deletion_ids @> ARRAY[$1]::uuid[]",
      [deleted.receipt],
    );
    await page.request.get("/api/maintenance", {
      headers: { Authorization: "Bearer e2e-maintenance-secret" },
    });
    await expect.poll(async () => (await status()).pending).toBe(false);
    expect((await inspectArchive()).status()).toBe(404);
    expect(
      (
        await page.request.get("/api/sources/" + keep.id + "/download")
      ).status(),
    ).toBe(200);
  } finally {
    await db.end();
  }
});

test("deleting a legacy transcript removes feature-linked drafts", async ({
  page,
}) => {
  const email = await signup(page);
  const { customer, transcript } = await seed(page);
  const db = testDatabase();
  const signal = randomUUID(),
    feature = randomUUID(),
    brief = randomUUID(),
    accepted = randomUUID();
  await db.connect();
  try {
    const {
      rows: [owner],
    } = await db.query("SELECT id FROM users WHERE email=$1", [email]);
    await db.query(
      "INSERT INTO signals(id,user_id,customer_id,transcript_id,source_key,title,quote) VALUES($1,$2,$3,$4,'fixture','Audit trail','A private legacy quote')",
      [signal, owner.id, customer, transcript],
    );
    await db.query(
      "INSERT INTO features(id,user_id,title) VALUES($1,$2,'Audit logs')",
      [feature, owner.id],
    );
    await db.query(
      "INSERT INTO feature_signals(user_id,feature_id,signal_id) VALUES($1,$2,$3)",
      [owner.id, feature, signal],
    );
    await db.query(
      "INSERT INTO briefs(id,user_id,title,ai_proposal) VALUES($1,$2,'Draft',$3)",
      [brief, owner.id, JSON.stringify({ problem: "A private legacy quote" })],
    );
    await db.query(
      "INSERT INTO brief_features(user_id,brief_id,feature_id) VALUES($1,$2,$3)",
      [owner.id, brief, feature],
    );
    await db.query(
      "INSERT INTO briefs(id,user_id,title,ai_proposal) VALUES($1,$2,'Older draft',$3)",
      [
        accepted,
        owner.id,
        JSON.stringify({
          ask: "Review",
          problem: "A private legacy quote",
          audience: "Users",
          capability: "Export logs",
          impact: "Faster review",
          evidence_ids: [signal],
          options: [
            {
              name: "Do nothing",
              effort: 1,
              time: "No build",
              risk: "Issue remains",
            },
            {
              name: "Maintain current approach",
              effort: 1,
              time: "Ongoing",
              risk: "Current limits remain",
            },
          ],
        }),
      ],
    );
    await api(page, "briefs/" + accepted + "/accept-draft", {});
    const impact = await api(
      page,
      "sources/" + transcript + "/deletion-impact",
    );
    expect(impact.briefIds).toEqual([brief, accepted].sort());
    await page.goto("/customers/" + customer);
    await page
      .getByRole("link", { name: "See all company signals", exact: true })
      .click();
    await page
      .getByTestId("research-signal")
      .getByRole("button", { name: /Acme discovery/ })
      .click();
    await page
      .getByRole("button", { name: "Delete transcript", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "2 affected decision briefs",
    );
    await page
      .getByRole("button", {
        name: "Permanently delete transcript",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Private file cleanup is complete.",
    );
    const {
      rows: [remaining],
    } = await db.query(
      "SELECT EXISTS(SELECT 1 FROM briefs WHERE id=ANY($1::uuid[])) AS brief, EXISTS(SELECT 1 FROM transcripts WHERE id=$2) AS transcript",
      [[brief, accepted], transcript],
    );
    expect(remaining).toEqual({ brief: false, transcript: false });
    expect(JSON.stringify(await api(page, "export"))).not.toContain(
      "A private legacy quote",
    );
  } finally {
    await db.end();
  }
});

for (const olderUpload of [false, true]) {
  test(`deletion removes a partially imported ${olderUpload ? "older " : ""}ZIP`, async ({
    page,
  }) => {
    await signup(page);
    const zip = new AdmZip();
    zip.addFile(
      "first.txt",
      Buffer.from("Partially imported private transcript."),
    );
    zip.addFile("last.txt", Buffer.from("x"));
    const upload = await storeIncomingZip(page, "partial.zip", zip);
    const failed = await page.request.post("/api/uploads/complete", {
      data: { id: upload.id },
    });
    expect(failed.status()).toBe(400);
    const {
      sources: [source],
    } = await api(page, "flow");
    expect(source.filename).toMatch(/first.txt$/);
    const db = testDatabase();
    await db.connect();
    try {
      if (olderUpload) {
        await db.query(
          "UPDATE upload_reservations SET source_hashes=NULL WHERE id=$1",
          [upload.id],
        );
      }
      await db.query(
        "UPDATE upload_reservations SET token_expires_at=now()-interval '6 minutes' WHERE id=$1",
        [upload.id],
      );
      const impact = await api(
        page,
        "sources/" + source.id + "/deletion-impact",
      );
      const deleted = await api(page, "sources/" + source.id, impact, "DELETE");
      await expect
        .poll(
          async () =>
            (await api(page, "sources/" + deleted.receipt + "/deletion-status"))
              .pending,
        )
        .toBe(false);
      const archive = await page.request.get(
        "http://127.0.0.1:3102/objects/" + encodeURIComponent(upload.pathname),
        {
          headers: {
            Authorization: "Bearer vercel_blob_rw_e2estore_test-secret",
          },
        },
      );
      expect(archive.status()).toBe(404);
      expect(
        (
          await page.request.post("/api/uploads/complete", {
            data: { id: upload.id },
          })
        ).status(),
      ).toBe(410);
      expect((await api(page, "flow")).sources).toHaveLength(0);
    } finally {
      await db.end();
    }
  });
}

test("deletion discards a pending archive that could restore the transcript", async ({
  page,
}) => {
  await signup(page);
  const content = "Waiting to import this private transcript.";
  const {
    sources: [source],
  } = await api(page, "sources", { filename: "original.txt", content });
  const zip = new AdmZip();
  zip.addFile("same.txt", Buffer.from(content));
  const upload = await storeIncomingZip(page, "still-pending.zip", zip);
  const impact = await api(page, "sources/" + source.id + "/deletion-impact");
  const deleted = await api(page, "sources/" + source.id, impact, "DELETE");
  const status = await api(
    page,
    "sources/" + deleted.receipt + "/deletion-status",
  );
  expect(status.pending).toBe(true);
  expect(
    (
      await page.request.post("/api/uploads/complete", {
        data: { id: upload.id },
      })
    ).status(),
  ).toBe(410);
  expect((await api(page, "flow")).sources).toHaveLength(0);
});
