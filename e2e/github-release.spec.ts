// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { decryptRoleVault, encryptRoleVault, withReportNotes, type RoleVault } from "../web/src/role-recovery.js";
import { releaseReferenceText } from "../web/src/github-repository.js";

test("a public patch release appends to private report notes and survives isolated recovery", async ({ page, browser }, testInfo) => {
  const { snapshot } = await recoveryFixture();
  const report = { network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt };
  const original = "Private report context retained before importing a patch";
  const vault: RoleVault = withReportNotes({ version: 1, role: "vendor", network: "preprod", contractAddress: report.contractAddress, programId: report.programId, actorSecret: snapshot.vendorSecret, reports: [report] }, { reportId: report.reportId, text: original, tier: "3" });
  const password = "Public release private report notes", encrypted = await encryptRoleVault(vault, password);
  const reference = { repository: "example/project", releaseUrl: "https://github.com/example/project/releases/tag/v1", releaseId: 42, tag: "v1", commitSha: "ab".repeat(20), publishedAt: "2026-09-10T00:00:00Z", prerelease: false };
  const requests: { url: string; body: string | null; method: string; authorization?: string; cookie?: string }[] = [];
  await page.route("https://api.github.com/**", async route => {
    const request = route.request(), headers = await request.allHeaders(); requests.push({ url: request.url(), body: request.postData(), method: request.method(), authorization: headers.authorization, cookie: headers.cookie });
    if (request.url().includes("/commits/")) await route.fulfill({ body: reference.commitSha });
    else if (request.url().includes("/releases/tags/")) await route.fulfill({ json: { id: 42, html_url: reference.releaseUrl, tag_name: "v1", draft: false, prerelease: false, published_at: reference.publishedAt } });
    else await route.fulfill({ json: { full_name: "example/project", html_url: "https://github.com/example/project", private: false, visibility: "public", archived: false, disabled: false } });
  });
  await page.goto("/#roles"); await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "vendor.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Role restore password").fill(password); await page.getByRole("button", { name: "Restore role workspace" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByLabel("Public GitHub release URL").fill(reference.releaseUrl); expect(requests).toEqual([]);
  await page.getByLabel("Public GitHub release URL").press("Enter");
  await expect(page.getByRole("button", { name: "Append release reference to notes" })).toBeVisible();
  await expect(page.getByLabel("Private decision, patch reference or retest notes")).toHaveValue(original);
  await page.getByRole("button", { name: "Append release reference to notes" }).click();
  const text = `${original}\n\n${releaseReferenceText(reference)}`;
  await expect(page.getByLabel("Private decision, patch reference or retest notes")).toHaveValue(text);
  expect(requests.map(request => request.url)).toEqual(["https://api.github.com/repos/example/project", "https://api.github.com/repos/example/project/releases/tags/v1", "https://api.github.com/repos/example/project/commits/tags%2Fv1"]);
  expect(requests.every(request => request.method === "GET" && request.body === null && !request.authorization && !request.cookie)).toBe(true);
  await page.getByRole("button", { name: "Save role backup", exact: true }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill(password); await page.getByLabel("Confirm role backup password").fill(password);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download single-role backup" }).click();
  const filename = testInfo.outputPath("release-notes-backup.json"); await (await download).saveAs(filename);
  expect(await decryptRoleVault(await readFile(filename, "utf8"), password)).toEqual(withReportNotes(vault, { reportId: report.reportId, text, tier: "3" }));
  const isolated = await browser.newContext();
  try {
    const restored = await isolated.newPage(); await restored.goto(new URL("/#roles", page.url()).href);
    await restored.getByLabel("Restore backups without connecting Lace").check(); await restored.getByLabel("Single-role backup file").setInputFiles(filename);
    await restored.getByLabel("Role restore password").fill(password); await restored.getByRole("button", { name: "Restore role workspace" }).click();
    await restored.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(restored.getByLabel("Private decision, patch reference or retest notes")).toHaveValue(text);
  } finally { await isolated.close(); }
});
