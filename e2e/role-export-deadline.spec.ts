// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

test("role backup encryption expires without downloading and permits an explicit retry", async ({ page }) => {
  const action = "Download single-role backup";
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
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity", exact: true }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill("Synthetic export password");
  await page.getByLabel("Confirm role backup password", { exact: true }).fill("Synthetic export password");
  const button = page.getByRole("button", { name: action, exact: true });
  await button.click();
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.ready)).toBe(true);
  await page.clock.fastForward(180000);
  await expect(page.getByText(/Role backup encryption timed out/)).toBeVisible();
  await expect(page.getByLabel("Role backup password", { exact: true })).toHaveValue("Synthetic export password");
  await expect(button).toBeEnabled();
  await page.evaluate(() => (window as any).__backupEncryption.release());
  await expect.poll(() => page.evaluate(() => (window as any).__backupEncryption.encrypted)).toBe(1);
  expect(downloads).toBe(0);
  await button.click();
  await expect(page.getByLabel("Role backup password", { exact: true })).toHaveValue("");
  await expect.poll(() => downloads).toBe(1);
  expect(await page.evaluate(() => (window as any).__backupEncryption.encrypted)).toBe(2);
});
