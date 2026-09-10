// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { ledger } from "@vulnseal/contract";
import { hexToBytes } from "@vulnseal/shared";
import fixture from "./fixtures/preprod-deployment-state.json" with { type: "json" };
import later from "./fixtures/preprod-public-state.json" with { type: "json" };
import { captureDeploymentInputs } from "../web/src/program.js";
import { encryptRoleVault, withDeploymentInputs, withSubmissionAttempt } from "../web/src/role-recovery.js";

test("deployment policy comparison decodes historical state and reports local intent mismatch", async ({ page }) => {
  const tx = fixture.data.transactions[0]!, action = tx.contractActions[0]!, transactionId = tx.identifiers[0]!;
  const inputs = captureDeploymentInputs(ledger(ContractState.deserialize(hexToBytes(action.state)).data));
  const password = "Synthetic deployment comparison backup";
  // Synthetic authority and intent, deliberately differing from the captured public reward policy.
  const vault = await withDeploymentInputs(await withSubmissionAttempt({ version: 1, role: "vendor", network: "preprod", contractAddress: null, programId: inputs.programId, actorSecret: "34".repeat(32), reports: [] }, transactionId, { circuit: "constructor", reportId: null }), transactionId, { ...inputs, rewardPolicyDigest: "ff".repeat(32) });
  const encrypted = await encryptRoleVault(vault, password);
  const bodies: string[] = [];
  let substituteState = false;
  await page.route("https://indexer.preprod.midnight.network/api/v4/graphql", async route => {
    bodies.push(route.request().postData()!);
    const response = structuredClone(fixture);
    if (substituteState) response.data.transactions[0]!.contractActions[0]!.state = later.data.contractAction.state;
    await route.fulfill({ json: response });
  });
  await page.route("https://rpc.preprod.midnight.network/**", async route => {
    const body = route.request().postDataJSON();
    bodies.push(route.request().postData()!);
    await route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: `0x${(tx.block.height + 1).toString(16)}` } : `0x${tx.block.hash}` } });
  });
  await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "comparison.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Role restore password").fill(password);
  await page.getByRole("button", { name: "Restore role workspace" }).click();
  await expect(page.getByRole("heading", { name: "Vendor workspace" })).toBeVisible();
  const button = page.getByRole("button", { name: "Compare saved deployment policy" });
  await expect(button).toBeVisible();
  expect(bodies).toEqual([]);
  await button.click();
  await expect(page.getByText("Saved deployment policy differs: rewardPolicyDigest.")).toBeVisible();
  await expect(page.getByText(new RegExp(`Deployment address: ${action.address}`))).toBeVisible();
  await expect(page.getByText(`Contract: ${action.address}`, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use observed address in reconnect form" })).toHaveCount(0);
  expect(bodies).toHaveLength(5);
  expect(bodies.join("")).not.toContain(vault.actorSecret);
  expect(bodies.join("")).not.toContain(vault.submissionAttempts![0]!.deployment!.rewardPolicyDigest);
  substituteState = true;
  await button.click();
  await expect(page.getByText("Observed deployment state differs from the raw transaction's initial state")).toBeVisible();
  await expect(page.getByText("Saved deployment policy differs: rewardPolicyDigest.")).toHaveCount(0);
});

test("an unresponsive deployment worker cannot prevent the UI deadline and retry", async ({ page }) => {
  const tx = fixture.data.transactions[0]!, action = tx.contractActions[0]!, transactionId = tx.identifiers[0]!;
  const saved = captureDeploymentInputs(ledger(ContractState.deserialize(hexToBytes(action.state)).data));
  const password = "Synthetic stalled worker backup";
  const vault = await withDeploymentInputs(await withSubmissionAttempt({ version: 1, role: "vendor", network: "preprod", contractAddress: null, programId: saved.programId, actorSecret: "34".repeat(32), reports: [] }, transactionId, { circuit: "constructor", reportId: null }), transactionId, saved);
  const encrypted = await encryptRoleVault(vault, password);
  await page.clock.install();
  let workerRequests = 0;
  await page.route("**/deployment-policy.worker-*.js", async route => {
    workerRequests++;
    await route.fulfill({ contentType: "text/javascript", body: "self.onmessage = () => { while (true) {} };" });
  });
  await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "worker.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Role restore password").fill(password);
  await page.getByRole("button", { name: "Restore role workspace" }).click();
  const button = page.getByRole("button", { name: "Compare saved deployment policy" });
  await button.click();
  await expect.poll(() => workerRequests).toBe(1);
  await page.clock.fastForward(30_000);
  await expect(page.getByText("Policy comparison timed out. No recovery decision was made.")).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await page.getByRole("button", { name: "Cancel policy comparison" }).click();
  await expect(button).toBeEnabled();
  await expect(page.getByText(/Deployment address:/)).toHaveCount(0);
});
