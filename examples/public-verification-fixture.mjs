// SPDX-License-Identifier: Apache-2.0
// Offline SDK example: captured public data, simulated RPC, no network requests.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyPublicReceipt } from "@vulnseal/api/public-verification";

const fixture = JSON.parse(await readFile(new URL("../e2e/fixtures/preprod-public-state.json", import.meta.url), "utf8"));
const { address, transaction: { block } } = fixture.data.contractAction;
const receipt = { kind: "vulnseal-public-receipt", version: 1, network: "preprod", contractAddress: address, reportId: "9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db", ciphertextDigest: "37ba2e7521ce64fa255ddef4655750609674ba1a8a16c179bb6435eff982eff9" };
const endpoints = { indexerUrl: "https://indexer.example.test", rpcUrl: "https://rpc.example.test" };
const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (url, init) => {
  assert.ok(Object.values(endpoints).includes(String(url)), "Unexpected fixture destination");
  assert.equal(init.credentials, "omit");
  const body = JSON.parse(init.body); requests++;
  if (String(url) === endpoints.indexerUrl) return Response.json(fixture);
  return Response.json({ jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: `0x${block.height.toString(16)}` } : `0x${block.hash}` });
};
try {
  const result = await verifyPublicReceipt(JSON.stringify(receipt), endpoints);
  assert.equal(requests, 4); assert.equal(result.report.status, "PAYOUT_AUTHORIZED");
  console.log(JSON.stringify({ mode: "offline fixture; RPC finality simulated", report: result.report, blockHeight: result.verification.blockHeight }, null, 2));
} finally { globalThis.fetch = originalFetch; }
