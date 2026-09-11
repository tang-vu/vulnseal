// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { encryptRoleVault } from "../web/src/role-recovery.js";
for (const source of ["file", "browser"]) test(`${source} role restore ignores expired real decryption and retries explicitly`, async ({ page }) => {
  const password = "Synthetic role restore password";
  const encrypted = await encryptRoleVault({ version: 1, role: "vendor", network: "preprod", contractAddress: null, programId: "12".repeat(32), actorSecret: "34".repeat(32), reports: [] }, password);
  await page.goto("/#roles");
  if (source === "browser") {
    await page.getByRole("button", { name: "Prepare vendor identity" }).click();
    await page.getByLabel("Browser copy password", { exact: true }).fill(password);
    await page.getByLabel("Confirm browser copy password").fill(password);
    await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
    await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  }
  await page.clock.install();
  await page.addInitScript(() => {
    const state = { ready: false, decrypted: 0, release: () => {} };
    const derive = crypto.subtle.deriveKey.bind(crypto.subtle), decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    let first = true;
    Object.defineProperty(crypto.subtle, "deriveKey", { value: async (...args: Parameters<SubtleCrypto["deriveKey"]>) => {
      if (!first) return derive(...args);
      first = false;
      const gate = new Promise<void>(resolve => { state.release = resolve; });
      const key = await derive(...args); state.ready = true;
      await gate; return key;
    } });
    Object.defineProperty(crypto.subtle, "decrypt", { value: async (...args: Parameters<SubtleCrypto["decrypt"]>) => {
      const result = await decrypt(...args); state.decrypted++; return result;
    } });
    Object.assign(window, { __backupEncryption: state });
  });

  page.on("dialog", dialog => void dialog.accept());
  await page.reload();
  const passwordLabel = source === "file" ? "Role restore password" : "Browser unlock password";
  const action = source === "file" ? "Restore role workspace" : "Unlock browser workspace";
  if (source === "file") await page.getByLabel("Single-role backup file").setInputFiles({ name: "role.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  else await page.getByLabel("Saved browser workspace").selectOption({ index: 1 });
  await page.getByLabel(passwordLabel, { exact: true }).fill(password);
  await page.getByRole("button", { name: action, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.ready)).toBe(true);
  await page.clock.fastForward(180000);
  await expect(page.getByText(source === "file" ? /Role restoration timed out/ : /Browser backup decryption timed out/)).toBeVisible();
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(password);
  await page.evaluate(() => (window as any).__backupEncryption.release());
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.decrypted)).toBe(1);
  await expect(page.getByRole("heading", { name: "Vendor workspace", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: action, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vendor workspace", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__backupEncryption.decrypted)).toBe(2);
});
