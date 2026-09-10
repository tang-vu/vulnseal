// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

const invitation = `#roles?network=preprod&contract=${"ab".repeat(32)}&program=${"12".repeat(32)}`;

test("same-tab invitation navigation retains an unsaved vendor draft and opens a separate review", async ({ page }) => {
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByLabel("Program name", { exact: true }).fill("Unsaved program stays in this tab");
  const original = page.url();
  await page.evaluate(hash => { window.location.hash = hash; }, invitation);
  await expect(page.getByRole("complementary", { name: "Requested workspace link" })).toBeVisible();
  await expect(page).toHaveURL(original);
  await expect(page.getByLabel("Program name", { exact: true })).toHaveValue("Unsaved program stays in this tab");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open requested link in a new tab" }).click();
  const popup = await popupPromise;
  try {
    await expect(popup.getByRole("heading", { name: "Review program invitation" })).toBeVisible();
    await expect(popup.getByRole("region", { name: "Review public program invitation" })).toContainText("12".repeat(32));
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(popup.getByRole("heading", { name: "Vendor workspace" })).toHaveCount(0);
  } finally { await popup.close(); }
  await page.getByRole("button", { name: "Keep working here" }).click();
  await expect(page.getByRole("complementary", { name: "Requested workspace link" })).toHaveCount(0);
  await expect(page.getByLabel("Program name", { exact: true })).toHaveValue("Unsaved program stays in this tab");
});

test("a later receipt request replaces a pending invitation without changing the open verifier", async ({ page }) => {
  await page.goto(`/#verify?network=preprod&contract=${"34".repeat(32)}`);
  await expect(page.getByLabel("Contract address")).toHaveValue("34".repeat(32));
  const original = page.url();
  await page.evaluate(hash => { window.location.hash = hash; }, invitation);
  await expect(page.getByRole("link", { name: "Open requested link in a new tab" })).toHaveAttribute("href", new URL(invitation, original).href);
  const next = `#verify?network=preprod&contract=${"56".repeat(32)}`;
  await page.evaluate(hash => { window.location.hash = hash; }, next);
  await expect(page.getByRole("link", { name: "Open requested link in a new tab" })).toHaveAttribute("href", new URL(next, original).href);
  await expect(page).toHaveURL(original);
  await expect(page.getByLabel("Contract address")).toHaveValue("34".repeat(32));
});
