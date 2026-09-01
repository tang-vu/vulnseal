// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("guided disclosure reaches an honest public payout-authorization trail", async ({ page }, testInfo) => {
  const capture = process.env.VULNSEAL_CAPTURE_VISUALS === "1";
  const screenshotDirectory = path.resolve("docs/screenshots");
  if (capture) await mkdir(screenshotDirectory, { recursive: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Disclose the truth/i })).toBeVisible();
  await expect(page.getByText(/not Midnight transactions until Lace is connected/i)).toBeVisible();
  if (capture) {
    await page.screenshot({
      path: path.join(screenshotDirectory, `${testInfo.project.name}-landing.png`),
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: /Seal a vulnerability/i }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Encrypt & seal/i }).click();
  await expect(page.getByRole("heading", { name: "Your report is sealed" })).toBeVisible();
  await expect(page.getByText(/Guided local receipt · not on-chain/i)).toBeVisible();

  await page.getByRole("button", { name: /Continue as vendor/i }).click();
  await page.getByRole("button", { name: "Begin authorized triage" }).click();
  await page.getByRole("button", { name: "Accept as P2" }).click();
  await page.getByRole("button", { name: "Continue to remediation" }).click();
  await page.getByRole("button", { name: "Anchor patch commitment" }).click();
  await page.getByRole("button", { name: /Pass retest/i }).click();
  await page.getByRole("button", { name: "Generate payout authorization" }).click();
  await expect(page.getByRole("heading", { name: "Payout authorization is verifiable" })).toBeVisible();
  await expect(page.getByText(/No token transfer is claimed/i)).toBeVisible();

  await page.getByRole("button", { name: "Open public verifier" }).click();
  await expect(page.getByRole("heading", { name: "Resolution trail verified" })).toBeVisible();
  await expect(page.getByText(/without exposing the exploit/i)).toBeVisible();
  await expect(page.getByText(/Guided local trail/i)).toBeVisible();
  if (capture) {
    await page.screenshot({
      path: path.join(screenshotDirectory, `${testInfo.project.name}-verifier.png`),
      fullPage: true,
    });
  }
});
