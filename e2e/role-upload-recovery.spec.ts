// SPDX-License-Identifier: Apache-2.0
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decryptRoleVault, encryptRoleVault } from "../web/src/role-recovery.js";
import { recoveryDraft } from "../web/src/test/recovery-fixture.js";
import { validateDisclosure } from "../web/src/handoff.js";

test("a prepared role report survives a lost upload response and reuploads identical ciphertext after file recovery", async ({ page, context }, testInfo) => {
  const password = "Keep the exact prepared report safe";
  const initial = await encryptRoleVault({ version: 3, role: "researcher", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret: "34".repeat(32), reports: [], submissionAttempts: [], draft: recoveryDraft }, password);
  const writes: { url: string; body: string | null }[] = [];
  let loseResponse = true;
  const intercept = async (browser: BrowserContext) => browser.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (!["http://127.0.0.1:4173", "http://127.0.0.1:8797"].includes(url.origin)) return route.abort();
    if (["POST", "PUT"].includes(request.method())) {
      expect(request.method()).toBe("PUT");
      expect(url.origin).toBe("http://127.0.0.1:8797");
      writes.push({ url: request.url(), body: request.postData() });
      if (loseResponse) {
        loseResponse = false;
        const accepted = await route.fetch();
        expect(accepted.ok()).toBe(true);
        await accepted.dispose();
        return route.abort("connectionreset");
      }
    }
    return route.continue();
  });
  const restore = async (target: Page, backup: Buffer) => {
    await target.goto("/#roles");
    await target.getByLabel("Restore backups without connecting Lace").check();
    await target.getByLabel("Single-role backup file").setInputFiles({ name: "role.json", mimeType: "application/json", buffer: backup });
    await target.getByLabel("Role restore password").fill(password);
    await target.getByRole("button", { name: "Restore role workspace" }).click();
    await expect(target.getByRole("heading", { name: "Researcher workspace" })).toBeVisible();
  };
  await intercept(context);
  await restore(page, Buffer.from(initial));
  await page.getByRole("button", { name: "Prepare report" }).click();
  await page.getByRole("checkbox", { name: /I confirm this test/ }).check();
  await page.getByRole("button", { name: /Encrypt & seal/ }).click();
  await expect(page.getByText(/Report encrypted locally/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("button", { name: "Upload saved ciphertext" })).toBeDisabled();
  await page.getByRole("button", { name: "Save role backup" }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill(password);
  await page.getByLabel("Confirm role backup password").fill(password);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download single-role backup" }).click();
  const filename = testInfo.outputPath("prepared-role-backup.json");
  await (await download).saveAs(filename);
  const backup = await readFile(filename);
  const saved = await decryptRoleVault(backup.toString("utf8"), password);
  expect(saved.reports).toHaveLength(1);
  expect(saved.draft).toBeNull();
  const disclosure = saved.reports[0]!;
  const opened = await validateDisclosure(disclosure);
  expect(opened.report).toEqual(recoveryDraft);
  await page.getByRole("button", { name: "Reports" }).click();
  await page.getByRole("button", { name: "Upload saved ciphertext" }).click();
  await expect(page.getByRole("alert")).toContainText("Ciphertext upload was not confirmed");
  expect(writes).toEqual([{ url: `http://127.0.0.1:8797/v1/blobs/sha256:${opened.ciphertextDigest}`, body: disclosure.envelope }]);
  await expect(page.getByLabel("Workspace report")).toHaveValue(disclosure.reportId);
  await page.close();

  const isolated = await context.browser()!.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  try {
    await intercept(isolated);
    const recovered = await isolated.newPage();
    await restore(recovered, backup);
    await expect(recovered.getByLabel("Workspace report")).toHaveValue(disclosure.reportId);
    await expect(recovered.getByRole("button", { name: "Submit prepared report" })).toHaveCount(0);
    await recovered.getByRole("button", { name: "Upload saved ciphertext" }).click();
    await expect(recovered.getByText(/Storage acknowledged the saved ciphertext/)).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    const stored = await isolated.request.get(writes[0]!.url);
    expect(stored.ok()).toBe(true);
    expect(await stored.text()).toBe(disclosure.envelope);
    await recovered.getByText("Read selected private report", { exact: true }).click();
    await expect(recovered.getByRole("heading", { name: recoveryDraft.title })).toBeVisible();
  } finally { await isolated.close(); }
});
