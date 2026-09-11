// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encryptRecovery, decryptRecovery } from "../web/src/recovery.js";
import { recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { emptyAttachmentDraft } from "../web/src/attachment-draft.js";
import deploymentFixture from "./fixtures/preprod-deployment-state.json" with { type: "json" };
import referenceKeys from "./fixtures/release-verifier-keys.json" with { type: "json" };
import { defaultProgramDraft } from "../web/src/program.js";

for (const version of [6, 7] as const) test(`uncertain combined deployment v${version} restores without a wallet and survives browser and file copies`, async ({ page, browser }, testInfo) => {
  const password = "Synthetic interrupted deployment";
  const { snapshot } = await recoveryFixture();
  const attempt = { ...snapshot, version, ...(version === 7 ? { deploymentTransactionId: deploymentFixture.data.transactions[0]!.identifiers[0]! } : {}), mode: "midnight" as const, network: "preprod", contractAddress: null, report: null, history: [], programDraft: defaultProgramDraft, pendingReport: null, uncertainTransition: null, attachmentDraft: emptyAttachmentDraft, deploymentAttempt: { startedAt: "2026-09-11T00:00:00.000Z" } };
  const encrypted = await encryptRecovery(attempt, password);
  // Synthetic uncertain state; no wallet deployment is performed by this test.
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByLabel("Recovery file").setInputFiles({ name: "attempt.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Recovery password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Restore encrypted backup" }).click();
  await expect(page.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create program", exact: true })).toHaveCount(0);
  if (version === 7) await expect(page.getByText(`Deployment transaction: ${attempt.deploymentTransactionId}`)).toBeVisible();
  if (version === 7) {
    const tx = deploymentFixture.data.transactions[0]!, requests: string[] = [];
    await page.route("**/keys/*.verifier", route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1)!.replace(".verifier", "") as keyof typeof referenceKeys.keys;
      return route.fulfill({ contentType: "application/octet-stream", body: Buffer.from(referenceKeys.keys[name], "hex") });
    });
    await page.route("https://indexer.preprod.midnight.network/api/v4/graphql", route => { requests.push(route.request().postData()!); return route.fulfill({ json: deploymentFixture }); });
    await page.route("https://rpc.preprod.midnight.network/**", route => {
      const body = route.request().postDataJSON(); requests.push(route.request().postData()!);
      return route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: `0x${(tx.block.height + 1).toString(16)}` } : `0x${tx.block.hash}` } });
    });
    await page.getByRole("button", { name: "Compare saved deployment policy" }).click();
    await expect(page.getByText(/Saved deployment policy differs:/)).toBeVisible();
    await expect(page.getByText("Verifier keys matching this release: 8 of 8.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review recovery at this address" })).toHaveCount(0);
    expect(requests.length).toBe(5);
    expect(requests.join("")).not.toContain(attempt.vendorSecret);
    expect(requests.join("")).not.toContain(attempt.researcherSecret);
  }
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restore encrypted backup" })).toBeDisabled();
  await page.getByLabel("Backup password", { exact: true }).fill(password);
  await page.getByLabel("Confirm backup password").fill(password);
  await page.getByRole("button", { name: "Save encrypted browser copy", exact: true }).click();
  await expect(page.getByText(/Encrypted browser copy saved/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByRole("button", { name: "Refresh browser copies" }).click();
  await page.getByLabel("Saved recovery copy").selectOption({ index: 1 });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download selected browser copy" }).click();
  const filename = testInfo.outputPath("deployment-copy.json");
  await (await downloading).saveAs(filename);
  expect((await decryptRecovery(await readFile(filename, "utf8"), password)).snapshot).toEqual(attempt);
  await page.getByLabel("Recovery password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Restore selected browser copy" }).click();
  await expect(page.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeVisible();
  const isolated = await browser.newContext(testInfo.project.use);
  try {
    const restored = await isolated.newPage();
    await restored.goto("/");
    await restored.getByRole("button", { name: "Private recovery", exact: true }).click();
    await restored.getByLabel("Recovery file").setInputFiles(filename);
    await restored.getByLabel("Recovery password", { exact: true }).fill(password);
    await restored.getByRole("button", { name: "Restore encrypted backup" }).click();
    await expect(restored.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeVisible();
    await expect(restored.getByRole("button", { name: "Create program", exact: true })).toHaveCount(0);
  } finally { await isolated.close(); }
});


test("deployment refuses a failed initial browser checkpoint and retains the backup password", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { balances: 0, broadcasts: 0 };
    Object.assign(window, { __checkpointWallet: state, midnight: { synthetic: { apiVersion: "4.0.1", connect: async () => ({
      getConnectionStatus: async () => ({ status: "connected", networkId: "preprod" }),
      getConfiguration: async () => ({ networkId: "preprod", proverServerUri: "http://127.0.0.1:8797/synthetic-proof", indexerUri: "http://127.0.0.1:8797/synthetic-indexer", indexerWsUri: "ws://127.0.0.1:8797/synthetic-indexer" }),
      getShieldedAddresses: async () => ({ shieldedCoinPublicKey: "01".repeat(32), shieldedEncryptionPublicKey: "02".repeat(32) }),
      balanceUnsealedTransaction: async () => { state.balances++; throw new Error("Synthetic wallet never signs"); },
      submitTransaction: async () => { state.broadcasts++; throw new Error("Synthetic wallet never broadcasts"); },
    }) } } });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === "vulnseal-encrypted-recovery") throw new DOMException("Synthetic deployment quota failure", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Guided local", exact: true }).click();
  await page.getByRole("button", { name: "Set up program", exact: true }).click();
  await page.getByLabel("Deployment backup password", { exact: true }).fill("Synthetic required checkpoint password");
  await page.getByLabel("Confirm deployment backup password").fill("Synthetic required checkpoint password");
  await page.getByRole("button", { name: "Create program", exact: true }).click();
  await expect(page.locator("#main-content").getByText(/Browser storage quota was exceeded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create program", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Deployment backup password", { exact: true })).toHaveValue("Synthetic required checkpoint password");
  expect(await page.evaluate(() => (window as unknown as { __checkpointWallet: unknown }).__checkpointWallet)).toEqual({ balances: 0, broadcasts: 0 });
});
