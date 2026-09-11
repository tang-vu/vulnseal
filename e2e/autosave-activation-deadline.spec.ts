// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

for (const kind of ["combined", "role"]) test(`${kind} autosave activation rejects late encryption before storage and permits explicit retry`, async ({ page }) => {
  const action = kind === "combined" ? "Enable encrypted autosave" : "Enable encrypted browser autosave";
  const passwordLabel = kind === "combined" ? "Autosave password" : "Browser copy password";
  const confirmationLabel = kind === "combined" ? "Confirm autosave password" : "Confirm browser copy password";
  await page.clock.install();
  await page.addInitScript(() => {
    const state = { ready: false, encrypted: 0, writes: 0, release: () => {} };
    const derive = crypto.subtle.deriveKey.bind(crypto.subtle), encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let first = true;
    Object.defineProperty(crypto.subtle, "deriveKey", { value: async (...args: Parameters<SubtleCrypto["deriveKey"]>) => {
      if (!first) return derive(...args);
      first = false;
      const gate = new Promise<void>(resolve => { state.release = resolve; });
      const key = await derive(...args); state.ready = true;
      await gate; return key;
    } });
    Object.defineProperty(crypto.subtle, "encrypt", { value: async (...args: Parameters<SubtleCrypto["encrypt"]>) => {
      const result = await encrypt(...args); state.encrypted++; return result;
    } });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) { state.writes++; return put.apply(this, args); };
    Object.assign(window, { __backupEncryption: state });
  });
  await page.goto(kind === "combined" ? "/" : "/#roles");
  await page.getByRole("button", { name: kind === "combined" ? "Private recovery" : "Prepare vendor identity", exact: true }).click();
  await page.getByLabel(passwordLabel, { exact: true }).fill("Synthetic export password");
  await page.getByLabel(confirmationLabel, { exact: true }).fill("Synthetic export password");
  const button = page.getByRole("button", { name: action, exact: true });
  await button.click();
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.ready)).toBe(true);
  await page.clock.fastForward(180000);
  await expect(page.getByText(/Autosave setup encryption timed out/)).toBeVisible();
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue("Synthetic export password");
  await expect(button).toBeEnabled();
  await page.evaluate(() => (window as any).__backupEncryption.release());
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.encrypted)).toBe(1);
  expect(await page.evaluate(() => (window as any).__backupEncryption.writes)).toBe(0);
  await button.click();
  await expect(page.getByRole("button", { name: kind === "combined" ? "Stop encrypted autosave" : "Stop browser autosave", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__backupEncryption.writes)).toBe(1);
  expect(await page.evaluate(() => (window as any).__backupEncryption.encrypted)).toBe(2);
});
