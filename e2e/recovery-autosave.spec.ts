// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

test("autosave confirms edits after navigation and preserves the last copy after a revision conflict", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByLabel("Autosave password", { exact: true }).fill("Synthetic automatic recovery password");
  await page.getByLabel("Confirm autosave password").fill("Synthetic automatic recovery password");
  await page.getByRole("button", { name: "Enable encrypted autosave" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Autosave confirmed at/ })).toBeVisible();
  await page.getByLabel("Saved recovery copy").selectOption({ index: 1 });
  await expect(page.getByRole("button", { name: "Remove selected browser copy" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Restore selected browser copy" })).toBeDisabled();
  await page.getByRole("button", { name: "VulnSeal home", exact: true }).click();
  await page.getByRole("button", { name: /Seal a vulnerability/i }).click();
  await page.getByLabel("Report title").fill("Autosaved private report draft");
  await expect(page.getByRole("status").filter({ hasText: /Changes are waiting for encrypted autosave confirmation/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Autosave confirmed at/ })).toBeVisible();
  // A separate transaction advances the saved revision, simulating a newer tab.
  const retained = await page.evaluate(() => new Promise<{ revision: number; encrypted: string }>((resolve, reject) => {
    const request = indexedDB.open("vulnseal-encrypted-recovery", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("copies", "readwrite"), store = tx.objectStore("copies"), all = store.getAll();
      let row: any;
      all.onsuccess = () => { row = all.result[0]; row.revision++; store.put(row); };
      tx.oncomplete = () => { db.close(); resolve({ revision: row.revision, encrypted: row.encrypted }); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  expect(retained.revision).toBeGreaterThan(2);
  expect(retained.encrypted).not.toContain("Autosaved private report draft");
  await page.getByLabel("Report title").fill("Newer unsaved edit after conflict");
  await expect(page.getByRole("status").filter({ hasText: /Autosave stopped:.*changed in another tab/ })).toBeVisible();
  await expect(page.getByLabel("Report title")).toHaveValue("Newer unsaved edit after conflict");
  await page.reload();
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable encrypted autosave" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh browser copies" }).click();
  await page.getByLabel("Saved recovery copy").selectOption({ index: 1 });
  await page.getByLabel("Recovery password", { exact: true }).fill("Synthetic automatic recovery password");
  await page.getByRole("button", { name: "Restore selected browser copy" }).click();
  await expect(page.getByLabel("Report title")).toHaveValue("Autosaved private report draft");
});

test("changing the program stops the old autosave writer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByLabel("Autosave password", { exact: true }).fill("Synthetic new program password");
  await page.getByLabel("Confirm autosave password").fill("Synthetic new program password");
  await page.getByRole("button", { name: "Enable encrypted autosave" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Autosave confirmed at/ })).toBeVisible();
  await page.getByRole("button", { name: "VulnSeal home", exact: true }).click();
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: "New program" }).click();
  await page.getByLabel("Program name", { exact: true }).fill("Changed autosave program");
  await page.getByRole("button", { name: "Create program", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Changed autosave program" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Autosave stopped because the program or network changed/ })).toBeVisible();
});
