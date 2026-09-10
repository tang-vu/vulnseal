// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decryptRoleVault } from "../web/src/role-recovery.js";

test("autosave timeout keeps the latest draft exportable and a late completion cannot unlock it", async ({ page, browser }, testInfo) => {
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PUT"].includes(request.method())) writes.push(request.url()); });
  const password = "Keep my unconfirmed draft backup";
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  await page.getByLabel("Browser copy password", { exact: true }).fill(password);
  await page.getByLabel("Confirm browser copy password").fill(password);
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.clock.install();
  await page.evaluate(() => {
    const target = window as unknown as { __copyCommitted: boolean; __deliverCopyCompletion: () => void };
    target.__copyCommitted = false;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const tx = original.apply(this, args);
      if (this.name === "vulnseal-encrypted-roles" && tx.mode === "readwrite") {
        IDBDatabase.prototype.transaction = original;
        Object.defineProperty(tx, "oncomplete", { configurable: true, set(callback) { target.__deliverCopyCompletion = () => callback(new Event("complete")); } });
        tx.addEventListener("complete", () => { target.__copyCommitted = true; }, { once: true });
      }
      return tx;
    };
  });
  const name = "Draft retained after an unconfirmed browser save";
  await page.getByLabel("Program name", { exact: true }).fill(name);
  await expect(page.getByText(/Saved encrypted browser copy/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __copyCommitted: boolean }).__copyCommitted)).toBe(true);
  await page.clock.fastForward(15_000);
  await expect(page.getByText(/did not confirm completion within 15 seconds/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop browser autosave" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Lace and deploy program" })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { __deliverCopyCompletion: () => void }).__deliverCopyCompletion());
  await expect(page.getByText(/Saved encrypted browser copy/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Lace and deploy program" })).toBeDisabled();
  await expect(page.getByLabel("Program name", { exact: true })).toHaveValue(name);
  // Further edits must remain exportable even though the stopped writer cannot save them.
  const finalName = "Newer private edits after autosave stopped";
  await page.getByLabel("Program name", { exact: true }).fill(finalName);
  const encryptedRows = await page.evaluate(async () => {
    const request = indexedDB.open("vulnseal-encrypted-roles", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const read = db.transaction("roles", "readonly").objectStore("roles").getAll();
        read.onsuccess = () => resolve(read.result.map((row: { encrypted: string }) => row.encrypted)); read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  });
  expect(encryptedRows).toHaveLength(1);
  const committedVault = await decryptRoleVault(encryptedRows[0]!, password);
  expect(committedVault.programDraft?.name).toBe(name);
  await page.getByRole("button", { name: "Save role backup", exact: true }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill(password);
  await page.getByLabel("Confirm role backup password").fill(password);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download single-role backup" }).click();
  const filename = testInfo.outputPath("unconfirmed-role-copy.json");
  await (await download).saveAs(filename);
  const vault = await decryptRoleVault(await readFile(filename, "utf8"), password);
  expect(vault).toEqual({ ...committedVault, programDraft: { ...committedVault.programDraft, name: finalName } });
  const isolated = await browser.newContext();
  try {
    const restored = await isolated.newPage();
    await restored.goto(new URL("/#roles", page.url()).href);
    await restored.getByLabel("Single-role backup file").setInputFiles(filename);
    await restored.getByLabel("Role restore password").fill(password);
    await restored.getByRole("button", { name: "Restore role workspace" }).click();
    await expect(restored.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
    await restored.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(restored.getByLabel("Program name", { exact: true })).toHaveValue(finalName);
  } finally { await isolated.close(); }
  expect(writes).toEqual([]);
});
