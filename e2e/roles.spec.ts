// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decryptRoleVault } from "../web/src/role-recovery.js";

test("closing an unsaved role can be cancelled, then closes without a warning after autosave", async ({ page }) => {
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  const dialogPromise = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(page.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  await page.getByLabel("Browser copy password", { exact: true }).fill("Retain identity before leaving");
  await page.getByLabel("Confirm browser copy password").fill("Retain identity before leaving");
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  let unexpectedDialog = false;
  page.on("dialog", async (next) => { unexpectedDialog = true; await next.accept(); });
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  await closed;
  expect(unexpectedDialog).toBe(false);
});

test("researcher invitations reject private fields and require a real wallet before joining", async ({ page }) => {
  await page.goto("/#roles");
  const invitation = { format: "vulnseal-program-invitation", version: 1, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
  await page.getByLabel("Public program invitation").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...invitation, actorSecret: "45".repeat(32) })) });
  await page.getByRole("button", { name: "Connect Lace and join as researcher" }).click();
  await expect(page.getByRole("alert")).toHaveText("Unsupported role document");
  await page.getByLabel("Public program invitation").setInputFiles({ name: "public.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invitation)) });
  await page.getByRole("button", { name: "Connect Lace and join as researcher" }).click();
  await expect(page.getByRole("alert")).toHaveText("Compatible Midnight Lace wallet not found");
  await expect(page.getByRole("heading", { name: "Researcher workspace" })).toHaveCount(0);
});

test("standalone vendor identity backup survives a closed tab and gates real deployment", async ({ page, context }, testInfo) => {
  await page.goto("/#roles");
  await expect(page.getByRole("heading", { name: "Work with your own authority" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guided local" })).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Lace and deploy program" })).toBeDisabled();
  await page.getByRole("button", { name: "Save role backup" }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill("Independent vendor backup password");
  await page.getByLabel("Confirm role backup password").fill("Independent vendor backup password");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download single-role backup" }).click();
  const path = testInfo.outputPath("vendor-backup.json"); await (await downloadPromise).saveAs(path);
  const serialized = await readFile(path, "utf8");
  const vault = await decryptRoleVault(serialized, "Independent vendor backup password");
  expect(vault.role).toBe("vendor"); expect(vault.contractAddress).toBeNull();
  expect(Object.keys(vault).sort()).toEqual(["actorSecret", "contractAddress", "network", "programId", "reports", "role", "version"]);
  expect(serialized).not.toContain(vault.actorSecret);
  await page.close();
  const restored = await context.newPage(); await restored.goto("/#roles");
  await restored.getByLabel("Single-role backup file").setInputFiles(path);
  await restored.getByLabel("Role restore password").fill("Incorrect vendor backup password");
  await restored.getByRole("button", { name: "Restore role workspace" }).click();
  await expect(restored.getByRole("alert")).toHaveText("Wrong role backup password or damaged file");
  await restored.getByLabel("Role restore password").fill("Independent vendor backup password");
  await restored.getByRole("button", { name: "Restore role workspace" }).click();
  await expect(restored.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  await expect(restored.getByText(`Network: preprod · Program: ${vault.programId}`, { exact: true })).toBeVisible();
  await expect(restored.getByRole("button", { name: "Prepare report" })).toHaveCount(0);
  await restored.getByRole("button", { name: "Connect Lace and deploy program" }).click();
  await expect(restored.getByRole("alert")).toHaveText("Enable encrypted browser autosave before submitting a role transaction. No transaction was sent.");
  await restored.getByLabel("Browser copy password", { exact: true }).fill("Deployment journal password");
  await restored.getByLabel("Confirm browser copy password").fill("Deployment journal password");
  await restored.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(restored.getByRole("button", { name: "Stop browser autosave" })).toBeVisible();
  await restored.getByRole("button", { name: "Connect Lace and deploy program" }).click();
  await expect(restored.getByRole("alert")).toHaveText("Compatible Midnight Lace wallet not found");
  await expect(restored.getByText(/Finalized constructor/)).toHaveCount(0);
  if (process.env.VULNSEAL_CAPTURE_VISUALS === "1") {
    await restored.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await restored.screenshot({ path: `docs/screenshots/${testInfo.project.name}-roles.png`, fullPage: true });
  }
});
