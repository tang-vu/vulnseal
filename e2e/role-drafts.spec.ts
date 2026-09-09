// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decryptRoleVault, encryptRoleVault } from "../web/src/role-recovery.js";

test("incomplete role drafts survive encrypted browser and file recovery without a wallet", async ({ page, context }, testInfo) => {
  const password = "Recover my private unfinished draft";
  const initial = await encryptRoleVault({ version: 1, role: "researcher", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret: "34".repeat(32), reports: [] }, password);
  const writes: string[] = [];
  context.on("request", (request) => { if (["POST", "PUT"].includes(request.method())) writes.push(request.url()); });
  await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "legacy-role.json", mimeType: "application/json", buffer: Buffer.from(initial) });
  await page.getByLabel("Role restore password").fill(password);
  await page.getByRole("button", { name: "Restore role workspace" }).click();
  await expect(page.getByText(/Offline workspace: contract authority/)).toBeVisible();
  await page.getByLabel("Browser copy password", { exact: true }).fill(password);
  await page.getByLabel("Confirm browser copy password").fill(password);
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  await page.getByRole("button", { name: "Prepare report" }).click();
  const title = "  Unfinished private draft  ";
  const steps = "first step\n\n  unfinished step  \n";
  await page.getByLabel("Report title").fill(title);
  await page.getByLabel(/^Reproduction steps/).fill(steps);
  await page.getByText("Enter an existing digest", { exact: true }).click();
  await page.getByLabel("Attachment filename", { exact: true }).fill("  unfinished proof.bin  ");
  await page.getByLabel("Attachment size in bytes", { exact: true }).fill("not yet known");
  await page.getByLabel("Attachment SHA-256", { exact: true }).fill("ab");
  await expect(page.getByText(/Draft edits, report notes, prepared reports and received disclosures are held in memory/)).toHaveCount(0);
  const rows = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("vulnseal-encrypted-roles", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<{ id: string; encrypted: string }[]>((resolve, reject) => { const request = db.transaction("roles", "readonly").objectStore("roles").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain(title);
  const saved = await decryptRoleVault(rows[0]!.encrypted, password);
  expect(saved.version).toBe(7);
  expect(saved.attachmentDraft).toEqual({ filename: "  unfinished proof.bin  ", mediaType: "", size: "not yet known", digest: "ab" });
  expect(saved.draft?.title).toBe(title);
  expect(saved.draft?.reproductionSteps.join("\n")).toBe(steps);
  expect(saved.draft?.summary).toBe("");
  await page.close();

  const fresh = await context.newPage();
  await fresh.goto("/#roles");
  await fresh.getByLabel("Restore backups without connecting Lace").check();
  await fresh.getByLabel("Saved browser workspace").selectOption(rows[0]!.id);
  await fresh.getByLabel("Browser unlock password").fill(password);
  await fresh.getByRole("button", { name: "Unlock browser workspace" }).click();
  await expect(fresh.getByRole("heading", { name: "Researcher workspace" })).toBeVisible();
  await fresh.getByRole("button", { name: "Prepare report" }).click();
  await expect(fresh.getByLabel("Report title")).toHaveValue(title);
  await expect(fresh.getByLabel(/^Reproduction steps/)).toHaveValue(steps);
  await fresh.getByText("Enter an existing digest", { exact: true }).click();
  await expect(fresh.getByLabel("Attachment filename", { exact: true })).toHaveValue("  unfinished proof.bin  ");
  await expect(fresh.getByRole("button", { name: /Encrypt & seal/ })).toBeDisabled();
  await fresh.getByRole("button", { name: "Save role backup" }).click();
  await fresh.getByLabel("Role backup password", { exact: true }).fill(password);
  await fresh.getByLabel("Confirm role backup password").fill(password);
  const downloaded = fresh.waitForEvent("download");
  await fresh.getByRole("button", { name: "Download single-role backup" }).click();
  const path = testInfo.outputPath("private-draft-backup.json");
  await (await downloaded).saveAs(path);
  expect(await decryptRoleVault(await readFile(path, "utf8"), password)).toEqual(saved);
  await fresh.close();

  const isolated = await context.browser()!.newContext({ baseURL: testInfo.project.use.baseURL });
  isolated.on("request", (request) => { if (["POST", "PUT"].includes(request.method())) writes.push(request.url()); });
  try {
    const restored = await isolated.newPage();
    await restored.goto("/#roles");
    await restored.getByLabel("Restore backups without connecting Lace").check();
    await restored.getByLabel("Single-role backup file").setInputFiles(path);
    await restored.getByLabel("Role restore password").fill(password);
    await restored.getByRole("button", { name: "Restore role workspace" }).click();
    await expect(restored.getByRole("heading", { name: "Researcher workspace" })).toBeVisible();
    await restored.getByRole("button", { name: "Prepare report" }).click();
    await expect(restored.getByLabel("Report title")).toHaveValue(title);
    await expect(restored.getByLabel(/^Reproduction steps/)).toHaveValue(steps);
    await restored.getByText("Enter an existing digest", { exact: true }).click();
    await expect(restored.getByLabel("Attachment size in bytes", { exact: true })).toHaveValue("not yet known");
    await expect(restored.getByLabel("Attachment SHA-256", { exact: true })).toHaveValue("ab");
    await restored.getByLabel("Attachment media type", { exact: true }).fill("application/octet-stream");
    await restored.getByLabel("Attachment size in bytes", { exact: true }).fill("3");
    await restored.getByLabel("Attachment SHA-256", { exact: true }).fill("ab".repeat(32));
    await restored.getByRole("button", { name: "Add attachment metadata" }).click();
    await expect(restored.getByText("1 attachment entry(s)", { exact: true })).toBeVisible();
    await expect(restored.getByLabel("Attachment filename", { exact: true })).toHaveValue("");
    await restored.getByRole("button", { name: "Reports", exact: true }).click();
    await restored.getByRole("button", { name: "Prepare report" }).click();
    await expect(restored.getByText("1 attachment entry(s)", { exact: true })).toBeVisible();
    await expect(restored.getByRole("button", { name: /Encrypt & seal/ })).toBeEnabled();
    await expect(restored.getByRole("button", { name: "Submit prepared report" })).toHaveCount(0);
  } finally { await isolated.close(); }
  expect(writes).toEqual([]);
});
