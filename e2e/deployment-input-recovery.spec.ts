// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encryptRoleVault, decryptRoleVault, withSubmissionAttempt, withDeploymentInputs, withProgramDraft } from "../web/src/role-recovery.js";
import { captureDeploymentInputs, defaultProgram, defaultProgramDraft, programConstructor } from "../web/src/program.js";

test("deployment checkpoint survives draft edits, browser unlock and isolated file recovery", async ({ page, context }, testInfo) => {
  const password = "Recover selected deployment inputs";
  const transactionId = "ab".repeat(32), legacyId = "cd".repeat(32);
  const programId = new Uint8Array(32).fill(0x12);
  const inputs = captureDeploymentInputs(await programConstructor(programId, defaultProgram));
  // Synthetic uncertain attempts: no wallet, submitted transaction or finalization is implied.
  let vault = await withSubmissionAttempt({ version: 1, role: "vendor", network: "preprod", contractAddress: null, programId: inputs.programId, actorSecret: "34".repeat(32), reports: [] }, legacyId, { circuit: "constructor", reportId: null });
  vault = await withSubmissionAttempt(vault, transactionId, { circuit: "constructor", reportId: null });
  vault = await withDeploymentInputs(vault, transactionId, inputs);
  vault = withProgramDraft(vault, defaultProgramDraft);
  const initial = await encryptRoleVault(vault, password);
  const writes: string[] = [];
  const watch = (request: { method(): string; url(): string }) => { if (["POST", "PUT"].includes(request.method())) writes.push(request.url()); };
  context.on("request", watch);
  const restore = async (target: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) => {
    await target.goto("/#roles");
    await target.getByLabel("Restore backups without connecting Lace").check();
    await target.getByLabel("Single-role backup file").setInputFiles(file);
    await target.getByLabel("Role restore password").fill(password);
    await target.getByRole("button", { name: "Restore role workspace" }).click();
    await expect(target.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  };
  const verifyJournal = async (target: Page) => {
    await target.getByRole("button", { name: "Save role backup", exact: true }).click();
    await expect(target.getByText("Deployment inputs were not recorded for this older attempt.")).toBeVisible();
    const detail = target.locator("details").filter({ has: target.getByText("Deployment inputs saved with this attempt", { exact: true }) });
    await detail.locator("summary").click();
    for (const [name, value] of Object.entries(inputs)) {
      await expect(detail.locator("div.public-value").filter({ has: target.locator("dt", { hasText: new RegExp(`^${name}$`) }) }).getByText(value, { exact: true })).toBeVisible();
    }
    await expect(target.getByText(/Saved SDK finalization:/)).toHaveCount(0);
  };
  await restore(page, { name: "synthetic-deployment.json", mimeType: "application/json", buffer: Buffer.from(initial) });
  await page.getByLabel("Browser copy password", { exact: true }).fill(password);
  await page.getByLabel("Confirm browser copy password").fill(password);
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const editedReward = "Later policy draft, not the attempted deployment";
  await page.getByRole("textbox", { name: "Reward policy", exact: true }).fill(editedReward);
  await page.getByRole("combobox", { name: "Response days", exact: true }).selectOption("14");
  await expect(page.getByText(/Draft edits, report notes, prepared reports and received disclosures are held in memory/)).toHaveCount(0);
  await verifyJournal(page);
  await page.getByLabel("Role backup password", { exact: true }).fill(password);
  await page.getByLabel("Confirm role backup password").fill(password);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download single-role backup" }).click();
  const filename = testInfo.outputPath("deployment-inputs.json");
  await (await download).saveAs(filename);
  const encrypted = await readFile(filename, "utf8");
  const recovered = await decryptRoleVault(encrypted, password);
  expect(recovered).toEqual(withProgramDraft(vault, { ...defaultProgramDraft, rewardPolicy: editedReward, responseDays: "14" }));
  expect(encrypted).not.toContain(inputs.scopeDigest);
  expect(encrypted).not.toContain(editedReward);
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto("/#roles");
  await fresh.getByLabel("Restore backups without connecting Lace").check();
  await fresh.getByLabel("Saved browser workspace").selectOption({ index: 1 });
  await fresh.getByLabel("Browser unlock password").fill(password);
  await fresh.getByRole("button", { name: "Unlock browser workspace" }).click();
  await expect(fresh.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  await verifyJournal(fresh);
  const isolated = await context.browser()!.newContext({ ...testInfo.project.use });
  isolated.on("request", watch);
  try {
    const fromFile = await isolated.newPage();
    await restore(fromFile, filename);
    await verifyJournal(fromFile);
    await fromFile.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(fromFile.getByRole("textbox", { name: "Reward policy", exact: true })).toHaveValue(editedReward);
    await expect(fromFile.getByRole("combobox", { name: "Response days", exact: true })).toHaveValue("14");
    const inspector = await isolated.newPage();
    await inspector.goto("/#roles");
    await inspector.getByLabel("Journal backup file").setInputFiles(filename);
    await inspector.getByLabel("Journal backup password").fill(password);
    await inspector.getByRole("button", { name: "Read recovery journal" }).click();
    await expect(inspector.getByText(new RegExp(transactionId))).toBeVisible();
    await expect(inspector.getByText("Deployment inputs saved with this attempt")).toHaveCount(0);
    await expect(inspector.getByText(inputs.scopeDigest, { exact: true })).toHaveCount(0);
    await expect(inspector.getByText(editedReward, { exact: true })).toHaveCount(0);
  } finally { await isolated.close(); }
  expect(writes).toEqual([]);
});
