// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encryptRecovery, decryptRecovery } from "../web/src/recovery.js";
import { recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { emptyAttachmentDraft } from "../web/src/attachment-draft.js";
import { defaultProgramDraft } from "../web/src/program.js";

test("uncertain combined deployment restores without a wallet and survives browser and file copies", async ({ page, browser }, testInfo) => {
  const password = "Synthetic interrupted deployment";
  const { snapshot } = await recoveryFixture();
  const attempt = { ...snapshot, version: 6 as const, mode: "midnight" as const, network: "preprod", contractAddress: null, report: null, history: [], programDraft: defaultProgramDraft, pendingReport: null, uncertainTransition: null, attachmentDraft: emptyAttachmentDraft, deploymentAttempt: { startedAt: "2026-09-11T00:00:00.000Z" } };
  const encrypted = await encryptRecovery(attempt, password);
  // Synthetic uncertain state; no wallet deployment is performed by this test.
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByLabel("Recovery file").setInputFiles({ name: "attempt.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Recovery password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Restore encrypted backup" }).click();
  await expect(page.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create program", exact: true })).toHaveCount(0);
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
