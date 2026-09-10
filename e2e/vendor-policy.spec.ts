// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createConstructorContext } from "@midnight-ntwrk/compact-runtime";
import { Contract, createVulnSealPrivateState, witnesses } from "@vulnseal/contract";
import { bytesToHex } from "@vulnseal/shared";
import { programConstructor } from "@vulnseal/api/program-policy";
import { encryptRoleVault, withProgramDraft } from "../web/src/role-recovery.js";
import fixture from "./fixtures/preprod-public-state.json" with { type: "json" };

test("vendor policy export is reviewed and matches in an isolated public verifier", async ({ page, browser }, testInfo) => {
  const policy = { name: "Example program", primaryScope: "api.example.test", additionalScope: "", responseDays: 7, disclosureDays: 90, rewardPolicy: "Critical: tier 4" };
  const draft = { ...policy, name: "  Example program  ", responseDays: "7", disclosureDays: "90" };
  const program = await programConstructor(new Uint8Array(32).fill(1), policy);
  const secret = new Uint8Array(32).fill(2), address = fixture.data.contractAction.address;
  const state = new Contract(witnesses).initialState(createConstructorContext(createVulnSealPrivateState(secret), "0".repeat(64)), program.programId, program.scopeDigest, program.responsePolicyDigest, program.responseDays, program.rewardPolicyDigest, program.disclosurePolicyDigest, program.disclosureDelayDays).currentContractState;
  const response = structuredClone(fixture); response.data.contractAction.state = bytesToHex(state.serialize());
  const requests: string[] = [];
  const services = async (target: Page) => {
    target.on("request", request => { if (request.method() !== "GET") requests.push(request.postData() ?? ""); });
    await target.route("https://indexer.preprod.midnight.network/**", route => route.fulfill({ json: response }));
    await target.route("https://rpc.preprod.midnight.network/**", route => route.fulfill({ json: { result: route.request().postDataJSON().method === "chain_getHeader" ? { number: `0x${fixture.data.contractAction.transaction.block.height.toString(16)}` } : `0x${fixture.data.contractAction.transaction.block.hash}` } }));
  };
  const vault = withProgramDraft({ version: 1, role: "vendor", network: "preprod", contractAddress: address, programId: bytesToHex(program.programId), actorSecret: bytesToHex(secret), reports: [] }, draft);
  const password = "Vendor policy sharing test password", encrypted = await encryptRoleVault(vault, password);
  await services(page); await page.goto("/#roles");
  await page.getByLabel("Restore backups without connecting Lace").check();
  await page.getByLabel("Single-role backup file").setInputFiles({ name: "vendor.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Role restore password").fill(password); await page.getByRole("button", { name: "Restore role workspace" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Check public policy for sharing" }).click();
  const downloadButton = page.getByRole("button", { name: "Download public program policy" });
  await expect(downloadButton).toBeEnabled(); expect(requests).toHaveLength(4);
  const downloadPromise = page.waitForEvent("download"); await downloadButton.click();
  const path = testInfo.outputPath("public-policy.json"); await (await downloadPromise).saveAs(path);
  const text = await readFile(path, "utf8"); expect(JSON.parse(text)).toEqual(policy);
  expect(text).not.toContain(vault.actorSecret); expect(text).not.toContain(password);
  const context = await browser.newContext(testInfo.project.use);
  try {
    const verifier = await context.newPage(); await services(verifier);
    await verifier.goto(new URL(`/#verify?network=preprod&contract=${address}`, page.url()).href);
    await verifier.getByRole("button", { name: "Load public state" }).click();
    await verifier.getByLabel("Compare public program policy").setInputFiles(path);
    await expect(verifier.getByRole("heading", { name: "All six policy fields match" })).toBeVisible();
    expect(requests).toHaveLength(8);
    expect(requests.some(body => body.includes(policy.rewardPolicy) || body.includes(vault.actorSecret))).toBe(false);
  } finally { await context.close(); }
});
