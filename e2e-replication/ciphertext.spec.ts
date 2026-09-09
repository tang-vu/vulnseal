// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { recoveryDraft, recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { encryptRoleVault } from "../web/src/role-recovery.js";

const primary = "http://127.0.0.1:8797", replica = "http://127.0.0.1:8798";

test("two stores retain identical ciphertext; a partial upload blocks completion and reads reject corrupt replicas", async ({ page, context }) => {
  let partial = true, brokenReads = 0;
  const writes: { url: string; body: string | null }[] = [], reads: string[] = [];
  await context.route("**/*", (route) => {
    const request = route.request(), url = new URL(request.url());
    if (![primary, replica, "http://127.0.0.1:4173"].includes(url.origin)) return route.abort();
    if (!url.pathname.startsWith("/v1/blobs/")) return route.continue();
    if (request.method() === "PUT") {
      writes.push({ url: request.url(), body: request.postData() });
      if (partial && url.origin === replica) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "http://127.0.0.1:4173" }, body: "unavailable" });
    } else if (request.method() === "GET") {
      reads.push(url.origin);
      if (brokenReads === 2 || (brokenReads === 1 && url.origin === primary)) return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "http://127.0.0.1:4173" }, contentType: "application/vnd.vulnseal.ciphertext+json", body: "corrupted ciphertext" });
    }
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Seal a vulnerability/ }).click();
  await expect(page.getByText("Ciphertext storage destinations (2)", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Encrypt & seal/ }).click();
  await expect(page.getByText(/replication incomplete: 1 of 2 stores acknowledged/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your report is sealed" })).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[0]!.body).toBe(writes[1]!.body);
  partial = false;
  await page.getByRole("button", { name: "Retry saved report upload" }).click();
  await expect(page.getByRole("heading", { name: "Your report is sealed" })).toBeVisible();
  expect(writes).toHaveLength(4);
  for (const entry of writes) expect(entry.body).toBe(writes[0]!.body);
  const digest = createHash("sha256").update(writes[0]!.body!).digest("hex");
  for (const endpoint of [primary, replica]) {
    const response = await context.request.get(`${endpoint}/v1/blobs/sha256:${digest}`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toBe(writes[0]!.body);
  }
  brokenReads = 1;
  await page.getByRole("button", { name: /Continue as vendor/ }).click();
  await expect(page.getByRole("heading", { name: "Cross-tenant authorization bypass" })).toBeVisible();
  expect(reads).toEqual([primary, replica]);
  await expect(page.getByText(/Using your local encrypted copy/)).toHaveCount(0);
  brokenReads = 2; reads.length = 0;
  await page.getByRole("button", { name: "Submission receipt" }).click();
  await page.getByRole("button", { name: /Continue as vendor/ }).click();
  await expect(page.getByText(/Using your local encrypted copy/)).toBeVisible();
  expect(reads).toEqual([primary, replica]);
  expect(writes).toHaveLength(4); // Neither fallback read repairs or writes storage.
});

test("offline workspace backfill stops on partial replication and retries identical saved envelopes", async ({ page, context }) => {
  // Batches are sequential and each store request has a 20-second deadline.
  // Durable local writes can exceed Playwright's default five-second assertion.
  test.setTimeout(150_000);
  const { snapshot } = await recoveryFixture();
  const password = "Replicated private role backup";
  const reports = [snapshot.report!, (await recoveryFixture({ ...recoveryDraft, title: "Second saved report" })).snapshot.report!, (await recoveryFixture({ ...recoveryDraft, title: "Third saved report" })).snapshot.report!];
  const backup = await encryptRoleVault({ version: 1, role: "researcher", network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: snapshot.researcherSecret, reports: reports.map((report) => ({ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: report.id, envelope: report.envelope, key: report.key, salt: report.salt })) }, password);
  const writes: { origin: string; body: string | null }[] = [];
  let partial = true, corruptRead = false;
  await context.route("**/*", (route) => {
    const request = route.request(), origin = new URL(request.url()).origin;
    if (![primary, replica, "http://127.0.0.1:4173"].includes(origin)) return route.abort();
    if (request.method() === "GET" && origin === replica && corruptRead) return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" }, body: "corrupt ciphertext" });
    if (request.method() === "PUT") {
      expect(reports.map((report) => report.envelope)).toContain(request.postData());
      writes.push({ origin, body: request.postData() });
      if (partial && origin === replica && request.postData() === reports[1]!.envelope) return route.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" }, body: "Unavailable" });
    }
    expect(request.method()).not.toBe("POST");
    return route.continue();
  });
  await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "role.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await page.getByLabel("Role restore password").fill(password);
  await page.getByRole("button", { name: "Restore role workspace" }).click();
  await expect(page.getByText("Ciphertext storage destinations (2)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit prepared report" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check stored copies" }).click();
  await expect(page.getByText(/0 of 2 stores returned verified ciphertext/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Upload all saved ciphertext (3)" }).click();
  await expect(page.getByRole("alert")).toContainText("1 of 3 saved reports acknowledged. Stopped at the selected report", { timeout: 45_000 });
  await expect(page.getByLabel("Workspace report")).toHaveValue(reports[1]!.id);
  expect(writes).toHaveLength(4);
  expect(writes.some((entry) => entry.body === reports[2]!.envelope)).toBe(false);
  await expect(page.getByRole("region", { name: "Stored copy results" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check stored copies" }).click();
  await expect(page.getByText(/1 of 2 stores returned verified ciphertext/)).toBeVisible();
  expect(writes).toHaveLength(4);
  partial = false;
  await page.getByRole("button", { name: "Upload all saved ciphertext (3)" }).click();
  await expect(page.getByText(/3 of 3 saved reports acknowledged by all configured stores/)).toBeVisible({ timeout: 65_000 });
  expect(writes).toHaveLength(10);
  await page.getByRole("button", { name: "Check stored copies" }).click();
  await expect(page.getByText(/2 of 2 stores returned verified ciphertext/)).toBeVisible();
  corruptRead = true;
  await page.getByRole("button", { name: "Check stored copies" }).click();
  await expect(page.getByText(/1 of 2 stores returned verified ciphertext/)).toBeVisible();
  await expect(page.getByText(/invalid digest/)).toBeVisible();
  expect(writes).toHaveLength(10);
  for (const report of reports) {
    const digest = createHash("sha256").update(report.envelope).digest("hex");
    for (const endpoint of [primary, replica]) expect(await (await context.request.get(`${endpoint}/v1/blobs/sha256:${digest}`)).text()).toBe(report.envelope);
  }
});
