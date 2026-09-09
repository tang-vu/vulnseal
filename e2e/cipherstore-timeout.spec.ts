// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Route } from "@playwright/test";

test("an oversized storage response falls back to the authenticated local ciphertext", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Seal a vulnerability/ }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Encrypt & seal/ }).click();
  await expect(page.getByRole("heading", { name: "Your report is sealed" })).toBeVisible({ timeout: 25_000 });
  let reads = 0;
  await page.route("**/v1/blobs/**", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    return route.fulfill({ status: 200, contentType: "application/vnd.vulnseal.ciphertext+json", body: Buffer.alloc(5 * 1024 * 1024 + 1, "x") });
  });
  await page.getByRole("button", { name: /Continue as vendor/ }).click();
  await expect(page.getByText(/Using your local encrypted copy/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cross-tenant authorization bypass" })).toBeVisible();
  expect(reads).toBe(1);
});

test("a stalled upload times out once and leaves the report available for review", async ({ page }) => {
  let uploads = 0;
  let pending: Route | undefined;
  await page.route("**/v1/blobs/**", (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    uploads++; pending = route; // Deliberately hold the request until the real client deadline.
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Seal a vulnerability/ }).click();
    await page.getByLabel("Report title").fill("Retain my draft after a stalled upload");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Encrypt & seal/ }).click();
    await expect(page.getByText(/Ciphertext upload timed out. The ciphertext may already be stored/)).toBeVisible({ timeout: 25_000 });
    expect(uploads).toBe(1);
    await expect(page.getByRole("heading", { name: "Your report is sealed" })).toHaveCount(0);
    await page.getByRole("button", { name: "Review report" }).click();
    await expect(page.getByLabel("Report title")).toHaveValue("Retain my draft after a stalled upload");
    expect(uploads).toBe(1);
  } finally { await pending?.abort("timedout").catch(() => {}); }
});
