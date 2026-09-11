// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaultProgramDraft } from "../web/src/program.js";
import { decryptRecovery } from "../web/src/recovery.js";

test("an oversized storage response falls back to the authenticated local ciphertext", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Seal a vulnerability/ }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Encrypt & seal/ }).click();
  await expect(page.getByRole("heading", { name: "Your report is sealed" })).toBeVisible({ timeout: 25_000 });
  let reads = 0;
  await page.route("**/v1/blobs/**", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    return route.fulfill({ status: 200, contentType: "application/vnd.vulnseal.ciphertext+json", body: Buffer.alloc(5 * 1024 * 1024 + 1, "x") });
  });
  await page.getByRole("button", { name: /Continue as vendor/ }).click();
  await expect(page.getByText(/Using your local encrypted copy/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cross-tenant authorization bypass" })).toBeVisible();
  expect(reads).toBe(1);
});

test("a stalled upload preserves exact ciphertext through encrypted file recovery and retry", async ({ page, context }, testInfo) => {
  let uploads = 0;
  let pending: Route | undefined;
  await page.route("**/v1/blobs/**", (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    uploads++; pending = route; // Deliberately hold the request until the real client deadline.
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Seal a vulnerability/ }).click();
    await page.getByLabel("Report title").fill("Retain my draft after a stalled upload");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Encrypt & seal/ }).click();
    await expect(page.getByText(/Ciphertext upload timed out. The ciphertext may already be stored/)).toBeVisible({ timeout: 25_000 });
    expect(uploads).toBe(1);
    await expect(page.getByRole("heading", { name: "Your report is sealed" })).toHaveCount(0);
    await page.getByRole("button", { name: "Review report" }).click();
    await expect(page.getByRole("heading", { name: "Keep the prepared report" })).toBeVisible();
    await expect(page.getByLabel("Report title")).toHaveCount(0);
    expect(uploads).toBe(1);
    await page.getByRole("button", { name: "Private recovery" }).click();
    await page.getByLabel("Backup password", { exact: true }).fill("Preserve the original encrypted report");
    await page.getByLabel("Confirm backup password").fill("Preserve the original encrypted report");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download encrypted backup" }).click();
    const filename = testInfo.outputPath("pending-report-backup.json");
    await (await download).saveAs(filename);
    const recovered = await decryptRecovery(await readFile(filename, "utf8"), "Preserve the original encrypted report");
    expect(recovered.snapshot.version).toBe(5);
    expect(recovered.snapshot.programDraft).toEqual(defaultProgramDraft);
    expect(recovered.snapshot.uncertainTransition).toBeNull();
    expect(recovered.snapshot.report).toBeNull();
    expect(recovered.snapshot.history).toEqual([]);
    expect(recovered.snapshot.pendingReport?.submissionStarted).toBe(false);
    expect(recovered.pendingSeal?.serializedEnvelope).toBe(pending!.request().postData());
    expect(recovered.snapshot.draft.title).toBe("Retain my draft after a stalled upload");
    const isolated = await context.browser()!.newContext({ ...testInfo.project.use });
    try {
      const fresh = await isolated.newPage();
      const sent: { url: string; body: string | null }[] = [];
      isolated.on("request", (request) => { if (request.method() === "PUT") sent.push({ url: request.url(), body: request.postData() }); });
      await fresh.goto("/");
      await fresh.getByRole("button", { name: "Private recovery" }).click();
      await fresh.getByLabel("Recovery file").setInputFiles(filename);
      await fresh.getByLabel("Recovery password", { exact: true }).fill("Preserve the original encrypted report");
      await fresh.getByRole("button", { name: "Restore encrypted backup" }).click();
      await expect(fresh.getByRole("heading", { name: "Keep the prepared report" })).toBeVisible();
      await fresh.getByText("Read prepared private report", { exact: true }).click();
      await expect(fresh.getByRole("heading", { name: "Retain my draft after a stalled upload" })).toBeVisible();
      await fresh.getByRole("button", { name: "Retry saved report upload" }).click();
      await expect(fresh.getByRole("heading", { name: "Your report is sealed" })).toBeVisible();
      expect(sent).toEqual([{ url: pending!.request().url(), body: pending!.request().postData() }]);
      const stored = await isolated.request.get(sent[0]!.url);
      expect(await stored.text()).toBe(recovered.pendingSeal!.serializedEnvelope);
    } finally { await isolated.close(); }
  } finally { await pending?.abort("timedout").catch(() => {}); }
});
