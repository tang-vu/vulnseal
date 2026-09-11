// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { encryptRecovery } from "../web/src/recovery.js";
import { recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { defaultProgramDraft } from "../web/src/program.js";

test("inspects encrypted network journal without wallet or status lookup, retries password and clears private data", async ({ page }) => {
  const { snapshot } = await recoveryFixture();
  const password = "Synthetic offline inspection password";
  const encrypted = await encryptRecovery({ ...snapshot, version: 8, mode: "midnight", network: "preprod", contractAddress: "ab".repeat(32), programDraft: defaultProgramDraft, pendingReport: null, uncertainTransition: null, attachmentDraft: null, reportAttempts: [{ circuit: "beginTriage", reportId: snapshot.report!.id, startedAt: "2026-09-11T00:00:00.000Z", transactionId: "cd".repeat(32), request: { nextStatus: "TRIAGED", severity: 3, rationale: "Immutable private journal rationale", patchReference: "", retestNotes: "" }, outcome: "sdk-confirmed" }] }, password);
  await page.addInitScript(() => Object.assign(window, { __inspectionConnections: 0, midnight: { synthetic: { apiVersion: "4.0.1", connect: () => { (window as any).__inspectionConnections++; throw new Error("Offline inspection must not connect"); } } } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  const panel = page.getByRole("region", { name: "Offline backup inspection" });
  await panel.getByLabel("Backup to inspect").setInputFiles({ name: "journal.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await panel.getByLabel("Inspection password").fill("An incorrect backup password");
  await panel.getByRole("button", { name: "Inspect encrypted file" }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel.getByLabel("Inspection password").fill(password);
  await panel.getByRole("button", { name: "Inspect encrypted file" }).click();
  await expect(panel.getByRole("status")).toContainText("Backup inspected locally");
  await expect(panel.getByLabel("Inspection password")).toHaveValue("");
  await panel.getByText("Private inputs saved with this attempt", { exact: true }).click();
  await expect(panel.getByText("Immutable private journal rationale", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Check transaction status" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__inspectionConnections)).toBe(0);
  await expect(page.getByRole("button", { name: "Lace connected", exact: true })).toHaveCount(0);
  expect(await panel.innerText()).not.toContain(snapshot.vendorSecret);
  await panel.getByText("Saved private draft and notes", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Clear inspected backup" }).click();
  await expect(panel.getByText("Immutable private journal rationale", { exact: true })).toHaveCount(0);
  expect(await panel.getByLabel("Backup to inspect").evaluate(element => (element as HTMLInputElement).files!.length)).toBe(0);
});
