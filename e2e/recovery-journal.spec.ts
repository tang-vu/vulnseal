// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { decryptRoleVault, encryptRoleVault } from "../web/src/role-recovery.js";
import { readFile } from "node:fs/promises";

test("an observed deployment address fills recovery without silently binding the backup", async ({ page }) => {
  const transactionId = "cd".repeat(32), address = "ab".repeat(32), blockHash = "ef".repeat(32);
  const password = "Deployment address recovery password";
  const encrypted = await encryptRoleVault({ version: 5, role: "vendor", network: "preprod", contractAddress: null, programId: "12".repeat(32), actorSecret: "34".repeat(32), reports: [], draft: null, reportNotes: [], submissionAttempts: [{ transactionId, recordedAt: "2026-09-09T00:00:00.000Z", intent: { circuit: "constructor", reportId: null } }] }, password);
  const posts: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST") posts.push(request.postData() ?? ""); });
  await page.route("https://indexer.preprod.midnight.network/api/v4/graphql", (route) => route.fulfill({ json: { data: { transactions: [{ identifiers: [transactionId], hash: "56".repeat(32), block: { height: 100, hash: blockHash }, transactionResult: { status: "SUCCESS" }, contractActions: [{ __typename: "ContractDeploy", address }] }] } } }));
  await page.route("https://rpc.preprod.midnight.network/", (route) => route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: route.request().postDataJSON().method === "chain_getHeader" ? { number: "0x64" } : `0x${blockHash}` } }));
  await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "deployment.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Role restore password").fill(password);
  await page.getByRole("button", { name: "Restore role workspace" }).click();
  await expect(page.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  expect(posts).toEqual([]);
  await page.getByRole("button", { name: "Check transaction status" }).click();
  await page.getByRole("button", { name: "Use observed address in reconnect form" }).click();
  await expect(page.getByLabel("Existing contract address")).toHaveValue(address);
  expect(posts).toHaveLength(4);
  expect(posts.join(" ")).not.toContain("34".repeat(32));
  await page.getByRole("button", { name: "Connect Lace and verify program" }).click();
  await expect(page.getByRole("alert")).toContainText("Compatible Midnight Lace wallet not found");
  await page.getByRole("button", { name: "Save role backup" }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill(password);
  await page.getByLabel("Confirm role backup password").fill(password);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download single-role backup" }).click()]);
  const restored = await decryptRoleVault(await readFile((await download.path())!, "utf8"), password);
  expect(restored.contractAddress).toBeNull();
  expect(restored.submissionAttempts![0]!.transactionId).toBe(transactionId);
  expect(posts).toHaveLength(4);
});

test("long offline journals page and find old attempts without network checks", async ({ page }) => {
  const attempts = Array.from({ length: 23 }, (_, i) => ({ transactionId: (i + 1).toString(16).padStart(64, "0"), recordedAt: "2026-09-09T00:00:00.000Z" }));
  const password = "Long journal recovery password";
  const encrypted = await encryptRoleVault({ version: 2, role: "vendor", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret: "34".repeat(32), reports: [], submissionAttempts: attempts }, password);
  await page.goto("/#roles");
  const requests: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" || request.url().startsWith("https://")) requests.push(request.url()); });
  await page.getByLabel("Journal backup file").setInputFiles({ name: "long-journal.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Journal backup password").fill(password);
  await page.getByRole("button", { name: "Read recovery journal" }).click();
  await expect(page.getByText(/Page 1 of 3/)).toBeVisible();
  await expect(page.getByText(attempts[0]!.transactionId, { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Older attempts" }).click();
  await page.getByRole("button", { name: "Older attempts" }).click();
  await expect(page.getByText(/Page 3 of 3/)).toBeVisible();
  await page.getByLabel("Search inspected journal", { exact: true }).fill(attempts[0]!.transactionId);
  await expect(page.getByText(/1 of 23 attempts match/)).toBeVisible();
  await expect(page.getByText(attempts[0]!.transactionId, { exact: false })).toBeVisible();
  await page.getByLabel("Search inspected journal", { exact: true }).fill("not-a-transaction");
  await expect(page.getByText(/No matching attempts/)).toBeVisible();
  expect(requests).toEqual([]);
});

for (const version of [2, 5, 6] as const) {
test(`v${version} deployed-role journal can be inspected from file and browser storage without Lace or network requests`, async ({ page }, testInfo) => {
  const transactionId = "00315eaad1b87f436849790da0f0072be407dfdf9079b78f15e73c838b9ede2c19";
  const actorSecret = "34".repeat(32), password = "Offline recovery journal password";
  const encrypted = await encryptRoleVault({ version, ...(version >= 5 ? { draft: null, reportNotes: [] } : {}), role: "vendor", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret, reports: [], submissionAttempts: [{ transactionId, recordedAt: "2026-09-09T04:00:00.000Z", ...(version === 6 ? { finalization: { blockHeight: "900", recordedAt: "2026-09-09T04:01:00.000Z" } } : {}), ...(version >= 5 ? { intent: { circuit: "constructor" as const, reportId: null } } : {}) }] }, password);
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
  await expect(page.getByText(version >= 5 ? /Recorded intent: constructor/ : /Operation and report were not recorded/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vendor workspace" })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(actorSecret);
  if (version === 6) await expect(page.getByText(/Saved SDK finalization: block 900/)).toBeVisible();
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
  if (version === 6) await expect(page.getByText(/Saved SDK finalization: block 900/)).toBeVisible();
  expect(posts).toEqual([]);
  expect(requests).toEqual([]);
  await page.route("https://indexer.preprod.midnight.network/api/v4/graphql", (route) => route.fulfill({ json: { data: { transactions: [] } } }));
  await page.getByRole("button", { name: "Check transaction status" }).click();
  await expect(page.getByText(/Not found by this indexer/)).toBeVisible();
  expect(posts).toHaveLength(1);
  if (version >= 5) {
    const blockHash = "cd".repeat(32), contractAddress = "ab".repeat(32);
    let observedAddress = contractAddress;
    await page.route("https://indexer.preprod.midnight.network/api/v4/graphql", (route) => route.fulfill({ json: { data: { transactions: [{ identifiers: [transactionId], hash: "ef".repeat(32), block: { height: 100, hash: blockHash }, transactionResult: { status: "SUCCESS" }, contractActions: [{ __typename: "ContractDeploy", address: observedAddress }] }] } } }));
    await page.route("https://rpc.preprod.midnight.network/", (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: "0x64" } : `0x${blockHash}` } });
    });
    await page.getByRole("button", { name: "Check transaction status" }).click();
    await expect(page.getByText(/one action for the recorded contract and circuit/)).toBeVisible();
    await expect(page.getByText(`Deployment: ${contractAddress}`, { exact: true })).toBeVisible();
    observedAddress = "ff".repeat(32);
    await page.getByRole("button", { name: "Check transaction status" }).click();
    await expect(page.getByText(/actions do not match the recorded contract and circuit/)).toBeVisible();
    await expect(page.getByText(/one action for the recorded contract and circuit/)).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Clear inspected journal" }).click();
  await expect(page.getByText(/Not found by this indexer/)).toHaveCount(0);
  await expect(page.getByText(/actions do not match the recorded contract and circuit/)).toHaveCount(0);
});
}
