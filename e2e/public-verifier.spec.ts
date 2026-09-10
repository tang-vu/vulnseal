// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/preprod-public-state.json" with { type: "json" };
const action = fixture.data.contractAction;
const reportId = "9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db";
const ciphertextDigest = "37ba2e7521ce64fa255ddef4655750609674ba1a8a16c179bb6435eff982eff9";

const publicServices = async (page: Page) => {
  await page.route("https://indexer.preprod.midnight.network/**", (route) => route.fulfill({ json: fixture }));
  await page.route("https://rpc.preprod.midnight.network/**", (route) => {
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: request.method === "chain_getHeader" ? { number: `0x${(action.transaction.block.height + 100).toString(16)}` } : `0x${action.transaction.block.hash}` } });
  });
};

test("public share link verifies captured ledger state in a fresh browser without a wallet", async ({ page }, testInfo) => {
  await publicServices(page);
  await page.goto(`/#verify?network=preprod&contract=${action.address}&report=${reportId}&ciphertext=${ciphertextDigest}`);
  await expect(page.getByRole("heading", { name: "Verify without private keys" })).toBeVisible();
  expect(await page.evaluate(() => "midnight" in window)).toBe(false);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payout authorized", exact: true })).toBeVisible();
  await expect(page.getByText("Contract block 2371914", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Public verification link")).toHaveValue(/#verify\?network=preprod/);
  if (process.env.VULNSEAL_CAPTURE_VISUALS === "1") {
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-public-lookup.png`, fullPage: true });
  }
  await page.getByLabel("Expected ciphertext digest (optional)").fill("00".repeat(32));
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toHaveCount(0);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect(page.getByRole("alert")).toHaveText("The receipt ciphertext digest does not match the ledger report");
});

test("public lookup imports a receipt and rejects a private recovery file", async ({ page }) => {
  await publicServices(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Independent verifier" }).click();
  await page.getByLabel("Import public receipt").setInputFiles({ name: "private.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "vulnseal-recovery", ciphertext: "private" })) });
  await expect(page.getByRole("alert")).toContainText("Not a supported public receipt");
  await page.getByLabel("Import public receipt").setInputFiles({ name: "public.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ kind: "vulnseal-public-receipt", version: 1, network: "preprod", contractAddress: action.address, reportId, ciphertextDigest })) });
  await expect(page.getByLabel("Contract address")).toHaveValue(action.address);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toBeVisible();
});

test("a canceled public lookup can be explicitly restarted without a wallet", async ({ page }) => {
  await publicServices(page);
  let requests = 0;
  await page.route("https://indexer.preprod.midnight.network/**", async (route) => {
    requests++;
    if (requests > 1) await route.fulfill({ json: fixture });
    // Deliberately leave the first intercepted request unanswered until cancellation.
  });
  await page.goto(`/#verify?network=preprod&contract=${action.address}`);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole("button", { name: "Cancel public lookup" }).click();
  await expect(page.getByRole("button", { name: "Load public state" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toHaveCount(0);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toBeVisible();
  expect(requests).toBe(2);
  expect(await page.evaluate(() => "midnight" in window)).toBe(false);
});
