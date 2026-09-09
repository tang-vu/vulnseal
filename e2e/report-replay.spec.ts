// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { encryptRoleVault, withSubmissionAttempt } from "../web/src/role-recovery.js";
import { recoveryFixture } from "../web/src/test/recovery-fixture.js";
import { savedPatchCommitment } from "../web/src/patch-comparison.js";

const raw = JSON.parse(await readFile("docs/evidence/preprod-raw-transactions.json", "utf8"));
const states = JSON.parse(await readFile("docs/evidence/preprod-transcript-replay.json", "utf8")).states;
const evidence = JSON.parse(await readFile("docs/evidence/preprod-indexer-verification.json", "utf8")).transactions;
const target = raw.transactions.at(-1), prior = raw.transactions.at(-2);
const meta = evidence.find((entry: any) => entry.identifier === target.expected.identifier);
async function routes(page: Page) {
  await page.context().route("https://indexer.preprod.midnight.network/api/v4/graphql", (route) => {
    const request = route.request().postDataJSON();
    const tx = { hash: meta.transactionHash, identifiers: target.content.identifiers, block: { height: meta.blockHeight, hash: meta.blockHash }, transactionResult: { status: "SUCCESS", segments: null } };
    if (request.query.includes("ReportReplayPrior")) return route.fulfill({ json: { data: { contractAction: { address: raw.contractAddress, state: states.at(-2).state, transaction: { hash: prior.expected.transactionHash } } } } });
    const action = { __typename: "ContractCall", address: raw.contractAddress, entryPoint: "authorizePayout", state: states.at(-1).state, deploy: { transaction: { block: { height: states[0].transaction.block.height } } } };
    return route.fulfill({ json: { data: { transactions: [{ ...tx, raw: target.raw, contractActions: [action] }] } } });
  });
  await page.context().route("https://rpc.preprod.midnight.network/", (route) => {
    const request = route.request().postDataJSON();
    const blockHash = evidence.find((entry: any) => entry.blockHeight === request.params[0])?.blockHash ?? meta.blockHash;
    return route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: request.method === "chain_getHeader" ? { number: `0x${meta.blockHeight.toString(16)}` } : `0x${blockHash}` } });
  });
  await page.context().routeWebSocket("wss://indexer.preprod.midnight.network/api/v4/graphql/ws", (socket) => {
    socket.onMessage((data) => {
      const message = JSON.parse(String(data));
      if (message.type === "connection_init") socket.send(JSON.stringify({ type: "connection_ack" }));
      if (message.type === "subscribe") for (const entry of raw.transactions) {
        const block = evidence.find((item: any) => item.identifier === entry.expected.identifier);
        socket.send(JSON.stringify({ type: "next", id: "history", payload: { data: { contractActions: { __typename: entry.expected.circuit === "constructor" ? "ContractDeploy" : "ContractCall", address: raw.contractAddress, entryPoint: entry.expected.circuit, transaction: { hash: block.transactionHash, identifiers: entry.content.identifiers, block: { height: block.blockHeight, hash: block.blockHash }, transactionResult: { status: "SUCCESS" } } } } } }));
      }
    });
  });
}
test("production worker replays historical report effects and rejects a different report", async ({ page }) => {
  await routes(page); await page.goto("/#roles");
  const workerFile = (await readdir("web/dist/assets")).find((name) => /^report-replay\.worker-.*\.js$/.test(name))!;
  const input = { transactionId: target.expected.identifier, contractAddress: raw.contractAddress, circuit: "authorizePayout", programId: "cbc22b04631c26d223793a29d69a8d7471efd704774fd4e05453a4595833c282", reportId: "9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db", indexerUrl: "https://indexer.preprod.midnight.network/api/v4/graphql", rpcUrl: "https://rpc.preprod.midnight.network", websocketUrl: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws" };
  const run = (value: typeof input) => page.evaluate(({ workerFile, value }) => new Promise<any>((resolve, reject) => {
    const worker = new Worker(`/assets/${workerFile}`, { type: "module" });
    worker.onmessage = (event) => { worker.terminate(); resolve(event.data); };
    worker.onerror = () => { worker.terminate(); reject(new Error("Worker failed")); };
    worker.postMessage(value);
  }), { workerFile, value });
  const result = await run(input);
  expect(result.error).toBeUndefined();
  expect(result.result).toMatchObject({ before: "RETEST_PASSED", after: "PAYOUT_AUTHORIZED", actionsRead: 7 });
  expect(result.result.publicValues).toMatchObject({ decisionDigest: createHash("sha256").update("accepted:p2").digest("hex"), severity: "3", rewardTier: "3" });
  expect(result.result.publicValues.ciphertextDigest).toBe("37ba2e7521ce64fa255ddef4655750609674ba1a8a16c179bb6435eff982eff9");
  expect(result.result.publicValues.patchCommitment).toBe(await savedPatchCommitment(input.reportId, "release:preprod-wave-1-demo"));
  expect((await run({ ...input, reportId: "ff".repeat(32) })).error).toContain("did not change exactly the report");
});
test("journal report checking is explicit, rejects a different program, and can be cancelled", async ({ page }) => {
  await routes(page);
  const { snapshot } = await recoveryFixture();
  const vault = await withSubmissionAttempt({ version: 1, role: "vendor", network: "preprod", programId: snapshot.programId, contractAddress: raw.contractAddress, actorSecret: snapshot.vendorSecret, reports: [{ network: "preprod", programId: snapshot.programId, contractAddress: raw.contractAddress, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] }, target.expected.identifier, { circuit: "authorizePayout", reportId: snapshot.report!.id });
  const encrypted = await encryptRoleVault(vault, "Report reconciliation password");
  const requests: string[] = []; page.context().on("request", (request) => { if (request.url().startsWith("https://")) requests.push(request.url()); });
  await page.goto("/#roles");
  await page.getByLabel("Journal backup file").setInputFiles({ name: "journal.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByLabel("Journal backup password").fill("Report reconciliation password");
  await page.getByRole("button", { name: "Read recovery journal" }).click();
  await page.getByText("Reconcile this report operation", { exact: true }).click();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Check report effects" }).click();
  await expect(page.getByRole("alert")).toHaveText("Replayed program differs from this backup", { timeout: 25_000 });
  await expect(page.getByText(/Replayed report change:/)).toHaveCount(0);
  await page.getByRole("button", { name: "Check report effects" }).click();
  await page.getByRole("button", { name: "Cancel report check" }).click();
  await expect(page.getByRole("alert")).toHaveText("Report check cancelled. No recovery decision was made.");
  await page.getByRole("button", { name: "Clear inspected journal" }).click();
  await expect(page.getByRole("button", { name: "Check report effects" })).toHaveCount(0);
});
