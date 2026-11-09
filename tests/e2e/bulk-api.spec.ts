import { test, expect } from "@playwright/test";
import { signup } from "./helpers";
test("multipart source uploads skip unsupported files and keep valid documents", async ({
  page,
}) => {
  await signup(page);
  const form = new FormData();
  form.append(
    "files",
    new File(["image"], "screenshot.svg", { type: "image/svg+xml" }),
  );
  form.append(
    "files",
    new File(["We need audit logs before we can buy."], "call.txt", {
      type: "text/plain",
    }),
  );
  const response = await page.request.post("/api/sources", { multipart: form });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.sources).toHaveLength(1);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain("screenshot.svg");
});
