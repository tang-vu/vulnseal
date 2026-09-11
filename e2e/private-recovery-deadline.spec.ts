// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { encryptRecovery } from "../web/src/recovery.js";
import { recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { defaultProgramDraft } from "../web/src/program.js";

for (const releaseBeforeRetry of [true, false]) test(`expired recovery ignores real decryption returned ${releaseBeforeRetry ? "before" : "during"} an explicit retry`, async ({ page }) => {
  const { snapshot: source } = await recoveryFixture();
  const password = "Synthetic slow recovery password";
  const snapshot = { ...source, version: 5 as const, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32), report: null, history: [], programDraft: defaultProgramDraft, pendingReport: null, uncertainTransition: null, attachmentDraft: null };
  const encrypted = await encryptRecovery(snapshot, password);
  await page.clock.install();
  await page.addInitScript(() => {
    const state = { derived: false, decrypted: 0, connections: 0, release: () => {} };
    const derive = crypto.subtle.deriveKey.bind(crypto.subtle), decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    let first = true;
    Object.defineProperty(crypto.subtle, "deriveKey", { value: async (...args: Parameters<SubtleCrypto["deriveKey"]>) => {
      if (!first) return derive(...args);
      first = false;
      const gate = new Promise<void>(resolve => { state.release = resolve; });
      const key = await derive(...args); state.derived = true;
      await gate; return key;
    } });
    Object.defineProperty(crypto.subtle, "decrypt", { value: async (...args: Parameters<SubtleCrypto["decrypt"]>) => {
      const result = await decrypt(...args); state.decrypted++; return result;
    } });
    Object.assign(window, { __slowRecovery: state, midnight: { synthetic: { apiVersion: "4.0.1", connect: async () => { state.connections++; return new Promise(() => {}); } } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  const file = page.getByLabel("Recovery file"), input = page.getByLabel("Recovery password", { exact: true });
  await file.setInputFiles({ name: "slow-recovery.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await input.fill(password);
  const restore = page.getByRole("button", { name: "Restore encrypted backup" });
  await restore.click();
  await expect.poll(() => page.evaluate(() => (window as any).__slowRecovery.derived)).toBe(true);
  await page.clock.fastForward(180_000);
  await expect(page.getByRole("alert")).toContainText("Private recovery timed out");
  await expect(restore).toBeEnabled(); await expect(input).toHaveValue(password);
  expect(await file.evaluate(async element => (element as HTMLInputElement).files![0]!.text())).toBe(encrypted);
  if (releaseBeforeRetry) {
    await page.evaluate(() => (window as any).__slowRecovery.release());
    await expect.poll(() => page.evaluate(() => (window as any).__slowRecovery.decrypted)).toBe(1);
    expect(await page.evaluate(() => (window as any).__slowRecovery.connections)).toBe(0);
    await expect(page.getByRole("alert")).toContainText("Private recovery timed out");
  }
  await restore.click();
  await expect.poll(() => page.evaluate(() => (window as any).__slowRecovery.connections)).toBe(1);
  if (!releaseBeforeRetry) {
    expect(await page.evaluate(() => (window as any).__slowRecovery.decrypted)).toBe(1);
    await page.evaluate(() => (window as any).__slowRecovery.release());
    await expect.poll(() => page.evaluate(() => (window as any).__slowRecovery.decrypted)).toBe(2);
  }
  expect(await page.evaluate(() => (window as any).__slowRecovery.decrypted)).toBe(2);
  expect(await page.evaluate(() => (window as any).__slowRecovery.connections)).toBe(1);
  await expect(restore).toBeDisabled();
  await expect(page.getByRole("button", { name: "Lace connected", exact: true })).toHaveCount(0);

});
