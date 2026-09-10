// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { encryptRoleVault, type RoleVault } from "../web/src/role-recovery.js";

test("a saved vendor shares a public invitation into an isolated researcher browser", async ({ page, browser }) => {
  const vault: RoleVault = { version: 1, role: "vendor", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret: "45".repeat(32), reports: [] };
  const password = "Vendor invitation recovery password";
  const encrypted = await encryptRoleVault(vault, password);
  await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "vendor.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Role restore password").fill(password);
  await page.getByRole("button", { name: "Restore role workspace" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const link = await page.getByLabel("Share public program invitation").inputValue();
  expect(link).not.toContain(vault.actorSecret); expect(link).not.toContain(password);
  const params = new URLSearchParams(new URL(link).hash.slice(7));
  expect([...params.keys()].sort()).toEqual(["contract", "network", "program"]);
  const context = await browser.newContext();
  try {
    const researcher = await context.newPage();
    await researcher.addInitScript(() => {
      const state = window as any; state.invitationConnects = 0;
      state.midnight = { lace: { apiVersion: "4.0.1", connect: async () => { state.invitationConnects++; throw new Error("Invitation test wallet stopped"); } } };
    });
    const publicRequests: string[] = [];
    await researcher.route(/https:\/\/(indexer|rpc)\./, route => { publicRequests.push(route.request().url()); return route.abort(); });
    await researcher.goto(link);
    await expect(researcher.getByRole("heading", { name: "Review program invitation" })).toBeVisible();
    const review = researcher.getByRole("region", { name: "Review public program invitation" });
    await expect(review).toContainText(vault.contractAddress!); await expect(review).toContainText(vault.programId); await expect(review).toContainText("preprod");
    expect(await researcher.evaluate(() => (window as any).invitationConnects)).toBe(0);
    expect(publicRequests).toEqual([]);
    await researcher.getByRole("button", { name: "Connect Lace and join as researcher" }).click();
    await expect.poll(() => researcher.evaluate(() => (window as any).invitationConnects)).toBe(1);
    await expect(researcher.getByRole("alert")).toContainText("Invitation test wallet stopped");
    await expect(researcher.getByRole("heading", { name: "Researcher workspace" })).toHaveCount(0);
  } finally { await context.close(); }
});

test("an invalid invitation deep link stays in role mode and can be replaced by a valid file", async ({ page }) => {
  await page.goto("/#roles?network=preprod&contract=bad&program=bad&actorSecret=private");
  await expect(page.getByRole("heading", { name: "Join as researcher" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Unsupported program invitation link fields");
  await expect(page.getByRole("button", { name: "Connect Lace and join as researcher" })).toBeDisabled();
  await page.getByLabel("Public program invitation", { exact: true }).setInputFiles({ name: "public.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "vulnseal-program-invitation", version: 1, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) })) });
  await expect(page.getByRole("heading", { name: "Review program invitation" })).toBeVisible();
  await expect(page.getByLabel("Program invitation URL")).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Lace and join as researcher" })).toBeEnabled();
});
