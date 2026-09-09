// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("guided disclosure reaches an honest public payout-authorization trail", async ({ page }, testInfo) => {
  const capture = process.env.VULNSEAL_CAPTURE_VISUALS === "1";
  const screenshotDirectory = path.resolve("docs/screenshots");
  if (capture) await mkdir(screenshotDirectory, { recursive: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Disclose the truth/i })).toBeVisible();
  await expect(page.getByText(/Network submissions require Lace and a deployed program/i)).toBeVisible();
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
  await expect(page.getByText("Decrypted locally for vendor persona")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cross-tenant authorization bypass" })).toBeVisible();
  await page.getByRole("button", { name: "Begin authorized triage" }).click();
  await page.getByRole("button", { name: "Accept as P2" }).click();
  await page.getByRole("button", { name: "Continue to remediation" }).click();
  await page.getByRole("button", { name: "Anchor patch commitment" }).click();
  await page.getByRole("button", { name: /Pass retest/i }).click();
  await page.getByRole("button", { name: "Generate payout authorization" }).click();
  await expect(page.getByRole("heading", { name: "Payout authorization is verifiable" })).toBeVisible();
  await expect(page.getByText(/No token transfer is claimed/i)).toBeVisible();

  await page.getByRole("button", { name: "Open public verifier" }).click();
  await expect(page.getByRole("heading", { name: "Guided workflow preview" })).toBeVisible();
  await expect(page.getByText(/without exposing the exploit/i)).toBeVisible();
  await expect(page.getByText(/Guided local trail/i)).toBeVisible();
  if (capture) {
    await page.screenshot({
      path: path.join(screenshotDirectory, `${testInfo.project.name}-verifier.png`),
      fullPage: true,
    });
  }
});

const navigate = async (page: Page, name: string) => {
  await page.getByRole("button", { name, exact: true }).filter({ visible: true }).first().click();
};

const sealAndReview = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Seal a vulnerability/i }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Encrypt & seal/i }).click();
  await expect(page.getByRole("heading", { name: "Your report is sealed" })).toBeVisible();
};

test("untriaged and rejected reports cannot resolve or imply a passing retest", async ({ page }) => {
  await sealAndReview(page);
  await navigate(page, "Verify");
  await expect(page.getByRole("heading", { name: /Vendor review has not started/ })).toBeVisible();
  await navigate(page, "Resolve");
  await expect(page.getByRole("heading", { name: "Resolution unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anchor patch commitment" })).toHaveCount(0);
  await navigate(page, "Submission receipt");
  await page.getByRole("button", { name: /Continue as vendor/i }).click();
  await page.getByRole("button", { name: "Begin authorized triage" }).click();
  await page.getByRole("button", { name: "Reject with digest" }).click();
  await page.getByRole("button", { name: "Close report" }).click();
  await expect(page.getByRole("heading", { name: /Closure alone does not imply/ })).toBeVisible();
  await expect(page.locator(".audit-event.complete")).toHaveCount(4);
  await expect(page.locator(".audit-event.complete").getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.locator(".audit-event").getByText("Payout authorized", { exact: true })).toHaveCount(0);
  await navigate(page, "Program");
  await expect(page.locator(".metric-card").filter({ hasText: "Authorized in this session" }).locator("strong")).toHaveText("0");
});

test("failed retest preserves history, clears stale evidence, and recovers with the selected tier", async ({ page }) => {
  await sealAndReview(page);
  await page.getByRole("button", { name: /Continue as vendor/i }).click();
  await page.getByRole("button", { name: "Begin authorized triage" }).click();
  await page.getByLabel("Public severity tier").selectOption("4");
  await page.getByRole("button", { name: "Accept as P1" }).click();
  await page.getByRole("button", { name: "Continue to remediation" }).click();
  await page.getByRole("button", { name: "Anchor patch commitment" }).click();
  await page.getByRole("button", { name: /Fail retest/ }).click();
  await expect(page.getByText(/Retest failed. Anchor a revised patch/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate payout authorization" })).toHaveCount(0);
  await page.getByLabel("Patch or release reference").fill("release/fixed-again");
  await page.getByRole("button", { name: "Anchor patch commitment" }).click();
  await navigate(page, "Verify");
  await expect(page.locator(".audit-event.complete").getByText("Retest failed", { exact: true })).toBeVisible();
  await expect(page.locator(".hash-row").filter({ hasText: /^Retest/ }).getByText("Not anchored")).toBeVisible();
  await navigate(page, "Resolve");
  await page.getByRole("button", { name: /Pass retest/ }).click();
  await expect(page.getByText("Tier 4 · P1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate payout authorization" }).click();
  await page.getByRole("button", { name: "Close report" }).click();
  await expect(page.locator(".audit-event.complete")).toHaveCount(9);
  await expect(page.locator(".audit-event.complete").getByText("Patch ready", { exact: true })).toHaveCount(2);
  await navigate(page, "Submission receipt");
  await page.getByRole("button", { name: "Seal another" }).click();
  await navigate(page, "Verify");
  await expect(page.getByRole("heading", { name: "No public trail loaded" })).toBeVisible();
});

test("edited program policy is preserved in the program view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: "New program" }).click();
  await page.getByLabel("Program name").fill("Northstar Disclosure");
  await page.getByLabel("Primary scope", { exact: true }).fill("api.northstar.test");
  await page.getByLabel("Additional scope").fill("");
  await page.getByLabel("First response target").selectOption("2");
  await page.getByLabel("Coordinated disclosure window").selectOption("30");
  await page.getByLabel("Reward policy").fill("Four tiers reviewed by our security team");
  await page.getByRole("button", { name: "Create program", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Northstar Disclosure" })).toBeVisible();
  await expect(page.getByText("api.northstar.test", { exact: true })).toBeVisible();
  await expect(page.getByText("Within 2 days")).toBeVisible();
  await expect(page.getByText("30 days", { exact: true })).toBeVisible();
  await expect(page.getByText("Four tiers reviewed by our security team")).toBeVisible();
});
