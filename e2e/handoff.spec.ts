// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("unfinished recipient input warns before close and reverting it removes the warning", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Private exchange" }).click();
  const password = page.getByLabel("Recipient backup password", { exact: true });
  await password.fill("Unfinished recipient password");
  const warning = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(password).toHaveValue("Unfinished recipient password");
  await password.fill("");
  const closed = page.waitForEvent("close");
  page.on("dialog", async unexpected => { await unexpected.dismiss(); throw new Error("Reverted empty exchange still warned"); });
  await page.close({ runBeforeUnload: true });
  await closed;
});

test("a separate recipient restores its own key and opens an encrypted disclosure without actor recovery", async ({ page, browser }, testInfo) => {
  const recipientContext = await browser.newContext(testInfo.project.use);
  try {
    const recipient = await recipientContext.newPage();
    await recipient.goto("http://127.0.0.1:4173/");
    await recipient.getByRole("button", { name: "Private exchange" }).click();
    await recipient.getByLabel("Recipient backup password", { exact: true }).fill("Separate recipient backup password");
    await recipient.getByLabel("Confirm recipient backup password").fill("Separate recipient backup password");
    await recipient.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function () { URL.createObjectURL = original; throw new Error("Synthetic backup download failure"); };
    });
    await recipient.getByRole("button", { name: "Create receiving key and save backup" }).click();
    await expect(recipient.getByRole("alert")).toHaveText("Synthetic backup download failure");
    const retainedFingerprint = await recipient.locator(".public-value code").textContent();
    const backupDownload = recipient.waitForEvent("download");
    await recipient.getByRole("button", { name: "Save receiving key backup" }).click();
    const backupPath = testInfo.outputPath("recipient-backup.json");
    await (await backupDownload).saveAs(backupPath);
    const publicDownload = recipient.waitForEvent("download");
    await recipient.getByRole("button", { name: "Download public receiving key" }).click();
    const publicPath = testInfo.outputPath("recipient-public.json");
    await (await publicDownload).saveAs(publicPath);
    const publicKey = JSON.parse(await readFile(publicPath, "utf8"));
    expect(publicKey.fingerprint).toBe(retainedFingerprint);
    expect(Object.keys(publicKey).sort()).toEqual(["fingerprint", "format", "publicKey", "version"]);
    await recipient.close();

    await page.goto("/");
    await page.getByRole("button", { name: /Seal a vulnerability/ }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Encrypt & seal/ }).click();
    // Uploads have a 20-second client deadline; allow the operation to settle.
    await expect(page.getByRole("heading", { name: "Your report is sealed" })).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "Private exchange" }).click();
    await page.getByLabel("Recipient public key file").setInputFiles(publicPath);
    await expect(page.getByRole("button", { name: "Download encrypted disclosure" })).toBeDisabled();
    await expect(page.getByText(publicKey.fingerprint, { exact: true })).toBeVisible();
    await page.getByRole("checkbox").check();
    const packageDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download encrypted disclosure" }).click();
    const packagePath = testInfo.outputPath("disclosure.json");
    await (await packageDownload).saveAs(packagePath);
    const serialized = await readFile(packagePath, "utf8");
    expect(serialized).not.toContain("Cross-tenant authorization bypass");
    expect(serialized).not.toContain("actorSecret");

    const restored = await recipientContext.newPage();
    await restored.goto("http://127.0.0.1:4173/");
    await restored.getByRole("button", { name: "Private exchange" }).click();
    const remoteRequests: string[] = [];
    restored.on("request", (request) => remoteRequests.push(request.url()));
    await restored.getByLabel("Recipient backup file").setInputFiles(backupPath);
    await restored.getByLabel("Recipient restore password").fill("Wrong recipient backup password");
    await restored.getByRole("button", { name: "Restore receiving key" }).click();
    await expect(restored.getByRole("alert")).toHaveText("Wrong recipient backup password or damaged file");
    await restored.getByLabel("Recipient restore password").fill("Separate recipient backup password");
    await restored.getByRole("button", { name: "Restore receiving key" }).click();
    await expect(restored.getByRole("button", { name: "Download public receiving key" })).toBeVisible();
    await restored.getByLabel("Encrypted disclosure file").setInputFiles(packagePath);
    await restored.getByRole("button", { name: "Decrypt received disclosure" }).click();
    await expect(restored.getByRole("heading", { name: "Cross-tenant authorization bypass" })).toBeVisible();
    await expect(restored.getByText(/guided local report, with no network transaction evidence/)).toBeVisible();
    expect(await restored.evaluate(() => "midnight" in window)).toBe(false);
    expect(remoteRequests).toEqual([]);
    if (process.env.VULNSEAL_CAPTURE_VISUALS === "1") {
      await restored.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
      await restored.screenshot({ path: `docs/screenshots/${testInfo.project.name}-handoff.png`, fullPage: true });
    }
    const tampered = JSON.parse(serialized);
    tampered.ciphertext = (tampered.ciphertext[0] === "A" ? "B" : "A") + tampered.ciphertext.slice(1);
    await restored.getByLabel("Encrypted disclosure file").setInputFiles({ name: "damaged.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tampered)) });
    await expect(restored.getByRole("heading", { name: "Cross-tenant authorization bypass" })).toHaveCount(0);
    await restored.getByRole("button", { name: "Decrypt received disclosure" }).click();
    await expect(restored.getByRole("alert")).toHaveText("Disclosure authentication failed: wrong key or damaged package");
    expect(remoteRequests).toEqual([]);
  } finally { await recipientContext.close(); }
});
