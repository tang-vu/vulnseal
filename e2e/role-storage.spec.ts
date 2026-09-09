// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { decryptRoleVault, encryptRoleVault } from "../web/src/role-recovery.js";
import type * as Storage from "../web/src/role-storage.js";

test("encrypted device copy unlocks in a fresh tab without a downloaded role file", async ({ page, context }, testInfo) => {
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  await page.getByLabel("Browser copy label").fill("Vendor device copy");
  await page.getByLabel("Browser copy password", { exact: true }).fill("Encrypted device backup password");
  await page.getByLabel("Confirm browser copy password").fill("Encrypted device backup password");
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy · revision 1/)).toBeVisible();
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("vulnseal-encrypted-roles", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<Storage.StoredRole[]>((resolve, reject) => { const request = db.transaction("roles", "readonly").objectStore("roles").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  expect(stored).toHaveLength(1);
  expect(Object.keys(stored[0]!).sort()).toEqual(["encrypted", "id", "label", "revision", "updatedAt"]);
  const vault = await decryptRoleVault(stored[0]!.encrypted, "Encrypted device backup password");
  expect(JSON.stringify(stored)).not.toContain(vault.actorSecret);
  expect(JSON.stringify(stored)).not.toContain(vault.programId);
  await page.close();
  const fresh = await context.newPage(); await fresh.goto("/#roles");
  await fresh.getByLabel("Saved browser workspace").selectOption(stored[0]!.id);
  await fresh.getByLabel("Browser unlock password").fill("Wrong device backup password");
  await fresh.getByRole("button", { name: "Unlock browser workspace" }).click();
  await expect(fresh.getByText(/Wrong role backup password or damaged file/)).toBeVisible();
  await fresh.getByLabel("Browser unlock password").fill("Encrypted device backup password");
  await fresh.getByRole("button", { name: "Unlock browser workspace" }).click();
  await expect(fresh.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  await expect(fresh.getByRole("button", { name: "Stop browser autosave" })).toBeVisible();
  await expect(fresh.getByRole("button", { name: "Connect Lace and deploy program" })).toBeEnabled();
  if (process.env.VULNSEAL_CAPTURE_VISUALS === "1") {
    await fresh.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await fresh.screenshot({ path: `docs/screenshots/${testInfo.project.name}-browser-storage.png`, fullPage: true });
  }
});

test("IndexedDB revision comparison rejects concurrent and plaintext overwrites atomically", async ({ page, context }) => {
  // Compile this repository's storage module for a real-browser primitive test; no production debug API is installed.
  const source = await readFile(new URL("../web/src/role-storage.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const script = `window.__roleStorageTest = (() => { const exports = {}; ${compiled}\nreturn exports; })();`;
  const other = await context.newPage();
  for (const target of [page, other]) { await target.goto("/#roles"); await target.addScriptTag({ content: script }); }
  const encrypted = await encryptRoleVault({ version: 1, role: "vendor", network: "preprod", programId: "12".repeat(32), actorSecret: "34".repeat(32), contractAddress: null, reports: [] }, "Concurrent browser backup password");
  const id = "12345678-1234-1234-1234-123456789abc";
  await page.evaluate(async ({ id, encrypted }) => (window as unknown as { __roleStorageTest: typeof Storage }).__roleStorageTest.writeStoredRole(id, "Initial", encrypted, null), { id, encrypted });
  const outcomes = await Promise.all([page, other].map((target, index) => target.evaluate(async ({ id, encrypted, index }) => {
    try { const row = await (window as unknown as { __roleStorageTest: typeof Storage }).__roleStorageTest.writeStoredRole(id, `Tab ${index}`, encrypted, 1); return { ok: true, revision: row.revision }; }
    catch (error) { return { ok: false, message: String(error) }; }
  }, { id, encrypted, index })));
  expect(outcomes.filter((value) => value.ok)).toHaveLength(1);
  expect(outcomes.find((value) => !value.ok)?.message).toContain("changed in another tab");
  const final = await page.evaluate(async (id) => {
    const storage = (window as unknown as { __roleStorageTest: typeof Storage }).__roleStorageTest;
    let rejected = false;
    try { await storage.writeStoredRole(id, "Unsafe", JSON.stringify({ actorSecret: "plaintext" }), 2); } catch { rejected = true; }
    return { rejected, row: await storage.readStoredRole(id), labels: await storage.listStoredRoles() };
  }, id);
  expect(final.rejected).toBe(true); expect(final.row.revision).toBe(2); expect(final.row.encrypted).toBe(encrypted);
  expect(final.labels[0]).not.toHaveProperty("encrypted");
  const deletion = await page.evaluate(async ({ id, encrypted }) => {
    const storage = (window as unknown as { __roleStorageTest: typeof Storage }).__roleStorageTest;
    let staleDelete = "", staleWrite = "";
    try { await storage.deleteStoredRole(id, 1); } catch (error) { staleDelete = String(error); }
    const retained = await storage.readStoredRole(id);
    await storage.deleteStoredRole(id, 2);
    try { await storage.writeStoredRole(id, "Stale tab", encrypted, 2); } catch (error) { staleWrite = String(error); }
    return { staleDelete, retained: retained.revision, staleWrite, rows: await storage.listStoredRoles() };
  }, { id, encrypted });
  expect(deletion.staleDelete).toContain("changed in another tab");
  expect(deletion.retained).toBe(2);
  expect(deletion.staleWrite).toContain("changed in another tab");
  expect(deletion.rows).toEqual([]);
});

test("catalog exports an encrypted copy before confirmed deletion and restores it in a separate browser context", async ({ page, browser }, testInfo) => {
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  await page.getByLabel("Browser copy label").fill("Recovery drill");
  await page.getByLabel("Browser copy password", { exact: true }).fill("Catalog export recovery password");
  await page.getByLabel("Confirm browser copy password").fill("Catalog export recovery password");
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy · revision 1/)).toBeVisible();
  await page.getByText("Manage saved browser copies", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Load saved-copy catalog" })).toBeDisabled();
  await page.getByRole("button", { name: "Stop browser autosave" }).click();
  await page.getByRole("button", { name: "Load saved-copy catalog" }).click();
  await expect(page.getByText("Found 1 encrypted browser copies.")).toBeVisible();
  await page.getByLabel("Browser copy to manage").selectOption({ index: 1 });
  await expect(page.getByRole("button", { name: "Delete selected browser copy" })).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download selected encrypted copy" }).click();
  const path = testInfo.outputPath("catalog-backup.json");
  await (await downloadPromise).saveAs(path);
  const serialized = await readFile(path, "utf8");
  const vault = await decryptRoleVault(serialized, "Catalog export recovery password");
  expect(serialized).not.toContain(vault.actorSecret);
  if (process.env.VULNSEAL_CAPTURE_VISUALS === "1") {
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-copy-catalog.png`, fullPage: true });
  }
  await page.getByRole("checkbox", { name: /I understand deleting this copy/ }).check();
  await page.getByRole("button", { name: "Delete selected browser copy" }).click();
  await expect(page.getByText(/Deleted browser copy Recovery drill, revision 1/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Lace and deploy program" })).toBeDisabled();
  await page.getByRole("button", { name: "Load saved-copy catalog" }).click();
  await expect(page.getByText("No saved browser copies on this device.")).toBeVisible();
  const isolated = await browser.newContext();
  try {
    const restored = await isolated.newPage(); await restored.goto(new URL("/#roles", page.url()).href);
    await restored.getByLabel("Single-role backup file").setInputFiles(path);
    await restored.getByLabel("Role restore password").fill("Catalog export recovery password");
    await restored.getByRole("button", { name: "Restore role workspace" }).click();
    await expect(restored.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
    await expect(restored.getByText(`Network: preprod · Program: ${vault.programId}`, { exact: true })).toBeVisible();
  } finally { await isolated.close(); }
});
