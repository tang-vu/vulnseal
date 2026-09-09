// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { encryptRoleVault } from "../web/src/role-recovery.js";

for (const version of [2, 5] as const) {
test(`v${version} deployed-role journal can be inspected from file and browser storage without Lace or network requests`, async ({ page }, testInfo) => {
  const transactionId = "00315eaad1b87f436849790da0f0072be407dfdf9079b78f15e73c838b9ede2c19";
  const actorSecret = "34".repeat(32), password = "Offline recovery journal password";
  const encrypted = await encryptRoleVault({ version, ...(version === 5 ? { draft: null, reportNotes: [] } : {}), role: "vendor", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret, reports: [], submissionAttempts: [{ transactionId, recordedAt: "2026-09-09T04:00:00.000Z", ...(version === 5 ? { intent: { circuit: "constructor" as const, reportId: null } } : {}) }] }, password);
  const posts: string[] = [];
  const requests: string[] = [];
  page.on("request", (request) => { requests.push(request.url()); if (request.method() === "POST") posts.push(request.url()); });
  await page.goto("/#roles");
  await expect(page.getByRole("heading", { name: "Inspect recovery journal without a wallet" })).toBeVisible();
  requests.length = 0;
  expect(await page.evaluate(() => Boolean((window as unknown as { midnight?: unknown }).midnight))).toBe(false);
  await page.getByLabel("Journal backup file").setInputFiles({ name: "journal.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Journal backup password").fill("Wrong recovery journal password");
  await page.getByRole("button", { name: "Read recovery journal" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong role backup password or damaged file");
  await expect(page.getByText(new RegExp(transactionId))).toHaveCount(0);
  await page.getByLabel("Journal backup password").fill(password);
  await page.getByRole("button", { name: "Read recovery journal" }).click();
  await expect(page.getByText(new RegExp(transactionId))).toBeVisible();
  await expect(page.getByLabel("Journal backup password")).toHaveValue("");
  await expect(page.getByText(version === 5 ? /Recorded intent: constructor/ : /Operation and report were not recorded/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vendor workspace" })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(actorSecret);
  expect(posts).toEqual([]);
  expect(requests).toEqual([]);
  if (process.env.VULNSEAL_CAPTURE_VISUALS === "1") {
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-offline-journal.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Clear inspected journal" }).click();
  await expect(page.getByText(new RegExp(transactionId))).toHaveCount(0);
  await page.evaluate(async (encrypted) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("vulnseal-encrypted-roles", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("roles", "readwrite");
      tx.objectStore("roles").put({ id: "12345678-1234-1234-1234-123456789abc", label: "Offline journal copy", revision: 1, updatedAt: new Date().toISOString(), encrypted });
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    }); } finally { db.close(); }
  }, encrypted);
  await page.getByLabel("Journal recovery source").selectOption("browser");
  await page.getByRole("button", { name: "Load journal browser copies" }).click();
  await page.getByLabel("Journal browser copy").selectOption("12345678-1234-1234-1234-123456789abc");
  await page.getByLabel("Journal backup password").fill(password);
  await page.getByRole("button", { name: "Read recovery journal" }).click();
  await expect(page.getByText(new RegExp(transactionId))).toBeVisible();
  expect(posts).toEqual([]);
  expect(requests).toEqual([]);
  await page.route("https://indexer.preprod.midnight.network/api/v4/graphql", (route) => route.fulfill({ json: { data: { transactions: [] } } }));
  await page.getByRole("button", { name: "Check transaction status" }).click();
  await expect(page.getByText(/Not found by this indexer/)).toBeVisible();
  expect(posts).toHaveLength(1);
  await page.getByRole("button", { name: "Clear inspected journal" }).click();
  await expect(page.getByText(/Not found by this indexer/)).toHaveCount(0);
});
}
