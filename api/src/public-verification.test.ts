// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../e2e/fixtures/preprod-public-state.json";
import { verifyPublicReceipt, parsePublicReceipt, publicReceiptLink } from "./public-verification.js";
const action = fixture.data.contractAction;
const receipt = { kind: "vulnseal-public-receipt", version: 1, network: "preprod", contractAddress: action.address, reportId: "9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db", ciphertextDigest: "37ba2e7521ce64fa255ddef4655750609674ba1a8a16c179bb6435eff982eff9" };
const endpoints = { indexerUrl: "https://indexer.example.test", rpcUrl: "https://rpc.example.test" };
function mock() {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return Response.json(body.query ? fixture : { result: body.method === "chain_getHeader" ? { number: `0x${action.transaction.block.height.toString(16)}` } : `0x${action.transaction.block.hash}` });
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
it.each(["javascript:alert(1)", "data:text/html,unsafe", "file:///private/backup.json"])("refuses unsafe verifier link base %s", base => {
  expect(() => publicReceiptLink(base, parsePublicReceipt(JSON.stringify(receipt)))).toThrow("HTTP or HTTPS");
});
it("validates runtime receipt fields and preserves the release path while removing URL secrets", () => {
  const valid = parsePublicReceipt(JSON.stringify(receipt));
  const url = new URL(publicReceiptLink("https://user:password@app.example.test/releases/v1/?token=private#old", valid));
  expect(url.pathname).toBe("/releases/v1/"); expect(url.username).toBe(""); expect(url.password).toBe(""); expect(url.search).toBe("");
  expect(() => publicReceiptLink(url.href, { ...valid, actorSecret: "private" } as typeof valid)).toThrow("public receipt");
});
it("matches a public receipt to the captured report without wallet or ciphertext access", async () => {
  const fetcher = mock(); const result = await verifyPublicReceipt(JSON.stringify(receipt), endpoints);
  expect(result.receipt).toEqual(receipt); expect(result.report.status).toBe("PAYOUT_AUTHORIZED");
  expect(result.report.ciphertextDigest).toBe(receipt.ciphertextDigest);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(fetcher.mock.calls.every(([url]) => Object.values(endpoints).includes(url))).toBe(true);
});
it.each(["reportId", "ciphertextDigest"] as const)("rejects a receipt with mismatched %s", async field => {
  mock(); await expect(verifyPublicReceipt(JSON.stringify({ ...receipt, [field]: "ff".repeat(32) }), endpoints)).rejects.toThrow(field === "reportId" ? "absent" : "differs");
});
it("rejects private fields before making a request", async () => {
  const fetcher = mock(); await expect(verifyPublicReceipt(JSON.stringify({ ...receipt, actorSecret: "private" }), endpoints)).rejects.toThrow("public receipt");
  expect(fetcher).not.toHaveBeenCalled();
});
