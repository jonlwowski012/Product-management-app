import { test, expect } from "@playwright/test";
import { signup, api } from "./helpers";
test("empty, oversized, binary and unsupported uploads fail validation", async ({
  page,
}) => {
  await signup(page);
  const c = await api(page, "customers", {
    name: "Validation customer",
    segment: "SMB",
    notes: "",
  });
  for (const [name, buffer] of [
    ["empty.txt", Buffer.from("")],
    ["binary.txt", Buffer.from([0, 1, 2, 3, 4, 5])],
    ["program.exe", Buffer.from("not allowed")],
  ] as [string, Buffer][]) {
    const r = await page.request.post("/api/transcripts", {
      multipart: {
        customer_id: c.id,
        files: { name, mimeType: "application/octet-stream", buffer },
      },
    });
    expect(r.status()).toBe(400);
  }
  const tooLarge = await page.request.post("/api/transcripts", {
    data: { title: "Too big", customer_id: c.id, content: "x".repeat(2000001) },
  });
  expect(tooLarge.status()).toBe(400);
  expect((await api(page, "bootstrap")).transcripts).toHaveLength(0);
});
