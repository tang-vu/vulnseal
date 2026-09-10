// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decryptRoleVault } from "../web/src/role-recovery.js";

for (const pinCommit of [false, true]) test(`public GitHub scope requires explicit application and survives encrypted file recovery (pin=${pinCommit})`, async ({ page, browser }, testInfo) => {
  const requests: { url: string; method: string; body: string | null; authorization?: string; cookie?: string }[] = [];
  const repository = "https://github.com/example/public-project";
  const sha = "ab".repeat(20), scope = pinCommit ? `${repository}/tree/${sha}` : repository;
  await page.route("https://api.github.com/**", async route => {
    const request = route.request(), headers = await request.allHeaders();
    requests.push({ url: request.url(), method: request.method(), body: request.postData(), authorization: headers.authorization, cookie: headers.cookie });
    if (request.url().endsWith("/commits/HEAD")) { await route.fulfill({ contentType: "application/vnd.github.sha", body: sha }); return; }
    await route.fulfill({ json: { full_name: "example/public-project", html_url: repository, private: false, visibility: "public", archived: true, disabled: false } });
  });
  await page.goto("/#roles");
  await page.getByRole("button", { name: "Prepare vendor identity" }).click();
  const password = "Public scope private draft backup";
  await page.getByLabel("Browser copy password", { exact: true }).fill(password);
  await page.getByLabel("Confirm browser copy password").fill(password);
  await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
  await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const originalScope = await page.getByLabel("Primary scope", { exact: true }).inputValue();
  const privatePolicy = "Private draft policy must stay in this workspace";
  await page.getByRole("textbox", { name: "Reward policy", exact: true }).fill(privatePolicy);
  await page.getByLabel("Public GitHub repository URL").fill(repository);
  if (pinCommit) await page.getByLabel("Pin scope to the current HEAD commit").check();
  expect(requests).toEqual([]);
  await page.getByLabel("Public GitHub repository URL").press("Enter");
  await expect(page.getByText("example/public-project — Archived repository")).toBeVisible();
  await expect(page.getByLabel("Primary scope", { exact: true })).toHaveValue(originalScope);
  await page.getByRole("button", { name: "Use repository as primary scope" }).click();
  await expect(page.getByLabel("Primary scope", { exact: true })).toHaveValue(scope);
  await expect(page.getByRole("textbox", { name: "Reward policy", exact: true })).toHaveValue(privatePolicy);
  await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
  expect(requests).toEqual(["https://api.github.com/repos/example/public-project", ...(pinCommit ? ["https://api.github.com/repos/example/public-project/commits/HEAD"] : [])].map(url => ({ url, method: "GET", body: null, authorization: undefined, cookie: undefined })));
  await page.getByRole("button", { name: "Save role backup", exact: true }).click();
  await page.getByLabel("Role backup password", { exact: true }).fill(password);
  await page.getByLabel("Confirm role backup password").fill(password);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download single-role backup" }).click();
  const filename = testInfo.outputPath("github-scope-backup.json"); await (await download).saveAs(filename);
  const vault = await decryptRoleVault(await readFile(filename, "utf8"), password);
  expect(vault.programDraft).toMatchObject({ primaryScope: scope, rewardPolicy: privatePolicy });
  const isolated = await browser.newContext();
  try {
    const restored = await isolated.newPage(); await restored.goto(new URL("/#roles", page.url()).href);
    await restored.getByLabel("Single-role backup file").setInputFiles(filename);
    await restored.getByLabel("Role restore password").fill(password);
    await restored.getByRole("button", { name: "Restore role workspace" }).click();
    await expect(restored.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
    await restored.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(restored.getByLabel("Primary scope", { exact: true })).toHaveValue(scope);
    await expect(restored.getByRole("textbox", { name: "Reward policy", exact: true })).toHaveValue(privatePolicy);
  } finally { await isolated.close(); }
});
