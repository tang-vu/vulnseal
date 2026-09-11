// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

test("encrypted browser recovery survives reload, quota failure and selected-copy removal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Seal a vulnerability/i }).click();
  await page.getByLabel("Report title").fill("Private browser recovery draft");
  const save = async () => {
    await page.getByRole("button", { name: "Private recovery", exact: true }).click();
    await page.getByLabel("Backup password", { exact: true }).fill("Synthetic browser recovery password");
    await page.getByLabel("Confirm backup password").fill("Synthetic browser recovery password");
    await page.getByRole("button", { name: "Save encrypted browser copy" }).click();
  };
  await save();
  await expect(page.getByText(/Encrypted browser copy saved/)).toBeVisible();
  const first = await page.getByLabel("Saved recovery copy").inputValue();
  expect(first).not.toBe("");
  const rows = await page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open("vulnseal-encrypted-recovery", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("copies", "readonly"), all = tx.objectStore("copies").getAll();
      tx.oncomplete = () => { db.close(); resolve(all.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("Private browser recovery draft");
  expect(JSON.stringify(rows)).not.toContain("Synthetic browser recovery password");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).__restoreRecoveryPut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function (...args) { if (this.transaction.db.name === "vulnseal-encrypted-recovery") throw new DOMException("Synthetic quota", "QuotaExceededError"); return original.apply(this, args); };
  });
  await save();
  await expect(page.getByRole("alert")).toContainText("Browser storage quota was exceeded");
  await expect(page.getByLabel("Backup password", { exact: true })).toHaveValue("Synthetic browser recovery password");
  await page.evaluate(() => { (window as any).__restoreRecoveryPut(); });
  await save();
  await expect(page.getByText(/Encrypted browser copy saved/)).toBeVisible();
  const second = await page.getByLabel("Saved recovery copy").inputValue();
  expect(second).not.toBe(first);
  // Actual reload drops the live draft/password; IndexedDB is the recovery source.
  await page.reload();
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByRole("button", { name: "Refresh browser copies" }).click();
  await expect(page.getByLabel("Saved recovery copy").locator("option")).toHaveCount(3);
  await page.getByLabel("Saved recovery copy").selectOption(first);
  await page.getByLabel("Recovery password", { exact: true }).fill("Wrong browser recovery password");
  await page.getByRole("button", { name: "Restore selected browser copy" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong backup password or damaged recovery file");
  await page.getByLabel("Recovery password", { exact: true }).fill("Synthetic browser recovery password");
  await page.getByRole("button", { name: "Restore selected browser copy" }).click();
  await expect(page.getByLabel("Report title")).toHaveValue("Private browser recovery draft");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await expect(page.getByLabel("Recovery password", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Remove selected browser copy" }).click();
  await expect(page.getByText(/Selected browser copy removed/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh browser copies" }).click();
  await expect(page.getByLabel("Saved recovery copy").locator("option")).toHaveCount(2);
  await page.getByLabel("Saved recovery copy").selectOption(second);
  await expect(page.getByLabel("Saved recovery copy")).toHaveValue(second);
});
