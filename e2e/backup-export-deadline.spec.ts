// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

for (const action of ["Download encrypted backup", "Save encrypted browser copy"]) test(`late encryption cannot start ${action} after timeout`, async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const state = { ready: false, encrypted: 0, release: () => {} };
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
    Object.assign(window, { __backupEncryption: state });
  });
  let downloads = 0; page.on("download", () => downloads++);
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await page.getByLabel("Backup password", { exact: true }).fill("Synthetic export password");
  await page.getByLabel("Confirm backup password", { exact: true }).fill("Synthetic export password");
  const button = page.getByRole("button", { name: action, exact: true });
  await button.click();
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.ready)).toBe(true);
  await page.clock.fastForward(180000);
  await expect(page.getByRole("alert")).toContainText("Backup encryption timed out");
  await expect(page.getByLabel("Backup password", { exact: true })).toHaveValue("Synthetic export password");
  await expect(button).toBeEnabled();
  await page.evaluate(() => (window as any).__backupEncryption.release());
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.encrypted)).toBe(1);
  await page.getByRole("button", { name: "Refresh browser copies" }).click();
  await expect(page.getByText("No saved browser copies on this site.", { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  await button.click();
  await expect(page.getByLabel("Backup password", { exact: true })).toHaveValue("");
  if (action === "Download encrypted backup") await expect.poll(() => downloads).toBe(1);
  else await expect(page.getByLabel("Saved recovery copy")).not.toHaveValue("");
  expect(await page.evaluate(() => (window as any).__backupEncryption.encrypted)).toBe(2);
});
