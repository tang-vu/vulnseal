// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

test("shows native storage estimates and never requests persistence before a click", async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as { retentionRequests: number };
    target.retentionRequests = 0;
    const persist = navigator.storage.persist.bind(navigator.storage);
    Object.defineProperty(navigator.storage, "persist", { configurable: true, value: async () => { target.retentionRequests++; return persist(); } });
  });
  await page.goto("/#roles");
  await page.getByText("Device storage and retention", { exact: true }).click();
  await expect(page.getByText(/Estimated site usage: [0-9.]+ MiB. Estimated site quota: [0-9.]+ MiB/)).toBeVisible();
  await expect(page.getByText(/Browser-reported storage retention: (Persistent|Best effort)/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh storage status" }).click();
  await expect(page.getByRole("button", { name: "Refresh storage status" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { retentionRequests: number }).retentionRequests)).toBe(0);
  const request = page.getByRole("button", { name: "Request persistent storage" });
  if (await request.isEnabled()) {
    await request.click();
    await expect(page.getByText(/Storage request completed|The browser did not grant persistent storage/)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { retentionRequests: number }).retentionRequests)).toBe(1);
  }
  await expect(page.getByText(/Clearing site data, losing the device or deleting a copy can still remove it/)).toBeVisible();
});
