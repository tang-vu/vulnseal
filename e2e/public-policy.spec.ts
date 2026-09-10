// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { createConstructorContext } from "@midnight-ntwrk/compact-runtime";
import { Contract, createVulnSealPrivateState, witnesses } from "@vulnseal/contract";
import { bytesToHex } from "@vulnseal/shared";
import { programConstructor } from "@vulnseal/api/program-policy";
import fixture from "./fixtures/preprod-public-state.json" with { type: "json" };

test("public policy comparison matches compiled state and detects changed text without uploading the file", async ({ page }) => {
  const policy = { name: "Public policy example", primaryScope: "api.example.test", additionalScope: "", responseDays: 7, disclosureDays: 90, rewardPolicy: "Critical: tier 4" };
  const program = await programConstructor(new Uint8Array(32).fill(1), policy);
  const state = new Contract(witnesses).initialState(createConstructorContext(createVulnSealPrivateState(new Uint8Array(32).fill(2)), "0".repeat(64)), program.programId, program.scopeDigest, program.responsePolicyDigest, program.responseDays, program.rewardPolicyDigest, program.disclosurePolicyDigest, program.disclosureDelayDays).currentContractState;
  const response = structuredClone(fixture); response.data.contractAction.state = bytesToHex(state.serialize());
  const requests: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") requests.push(request.postData() ?? ""); });
  await page.route("https://indexer.preprod.midnight.network/**", route => route.fulfill({ json: response }));
  await page.route("https://rpc.preprod.midnight.network/**", route => route.fulfill({ json: { result: route.request().postDataJSON().method === "chain_getHeader" ? { number: `0x${fixture.data.contractAction.transaction.block.height.toString(16)}` } : `0x${fixture.data.contractAction.transaction.block.hash}` } }));
  await page.goto(`/#verify?network=preprod&contract=${fixture.data.contractAction.address}`);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect(page.getByRole("heading", { name: "Program policy commitments" })).toBeVisible();
  expect(requests).toHaveLength(4);
  const compare = async (value: unknown) => page.getByLabel("Compare public program policy").setInputFiles({ name: "policy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await compare(policy);
  await expect(page.getByRole("heading", { name: "All six policy fields match" })).toBeVisible();
  await compare({ ...policy, rewardPolicy: "Different public reward" });
  await expect(page.getByText("Reward policy digest: Differs", { exact: true })).toBeVisible();
  await compare({ ...policy, actorSecret: "private" });
  await expect(page.getByRole("alert")).toContainText("Invalid program policy fields");
  await expect(page.getByRole("heading", { name: "All six policy fields match" })).toHaveCount(0);
  expect(requests).toHaveLength(4);
  expect(requests.some(body => body.includes(policy.rewardPolicy) || body.includes("actorSecret"))).toBe(false);
  await page.getByLabel("Contract address").fill("34".repeat(32));
  await expect(page.getByRole("heading", { name: "Program policy commitments" })).toHaveCount(0);
});
