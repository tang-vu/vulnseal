// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../e2e/fixtures/preprod-public-state.json";
import { parsePublicReceipt, publicReceiptLink, verifyPublicContract } from "./public-verification.js";

const action = fixture.data.contractAction;
const block = action.transaction.block;
const endpoints = { indexerUrl: "https://indexer.example.test", rpcUrl: "https://rpc.example.test" };
const receipt = { kind: "vulnseal-public-receipt", version: 1, network: "preprod", contractAddress: action.address, reportId: "9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db", ciphertextDigest: "37ba2e7521ce64fa255ddef4655750609674ba1a8a16c179bb6435eff982eff9" } as const;
const responses = (payload: unknown = fixture, height = block.height + 100, hash = block.hash) => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return Response.json(body.query ? payload : { jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: `0x${height.toString(16)}` } : `0x${hash}` });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());

describe("independent public verification", () => {
  it("stops oversized state evidence before decoding or RPC requests", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
    }, cancel })));
    vi.stubGlobal("fetch", fetcher);
    await expect(verifyPublicContract(action.address, endpoints)).rejects.toThrow("too large");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("decodes actual captured Preprod state and verifies its block without wallet or ciphertext access", async () => {
    const fetch = responses();
    const result = await verifyPublicContract(action.address, endpoints);
    expect(result.reports[0]?.status).toBe("PAYOUT_AUTHORIZED");
    expect(result.reports[0]?.reportId).toBe(receipt.reportId);
    expect(result.reports[0]?.ciphertextDigest).toBe(receipt.ciphertextDigest);
    expect(result.blockHeight).toBe(2371914);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([url]) => [endpoints.indexerUrl, endpoints.rpcUrl].includes(url))).toBe(true);
    expect(Object.keys(result.reports[0]!).sort()).toEqual(["ciphertextDigest", "createdSequence", "patchCommitment", "payoutReceipt", "reportId", "retestCommitment", "rewardTier", "severity", "status", "updatedSequence"]);
  });

  it("does not call services for invalid addresses", async () => {
    const fetch = responses();
    await expect(verifyPublicContract("invalid", endpoints)).rejects.toThrow("hexadecimal");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects missing contracts and failed actions", async () => {
    responses({ data: { contractAction: null } });
    await expect(verifyPublicContract(action.address, endpoints)).rejects.toThrow("Contract not found");
    responses({ data: { contractAction: { ...action, transaction: { ...action.transaction, transactionResult: { status: "FAILURE" } } } } });
    await expect(verifyPublicContract(action.address, endpoints)).rejects.toThrow("not successful");
  });

  it("rejects unfinalized state and indexer/RPC disagreement", async () => {
    responses(fixture, block.height - 1);
    await expect(verifyPublicContract(action.address, endpoints)).rejects.toThrow("not yet finalized");
    responses(fixture, block.height + 10, "ff".repeat(32));
    await expect(verifyPublicContract(action.address, endpoints)).rejects.toThrow("disagree");
  });

  it("rejects incompatible state instead of fabricating a workflow", async () => {
    responses({ data: { contractAction: { ...action, state: "00" } } });
    await expect(verifyPublicContract(action.address, endpoints)).rejects.toThrow("incompatible");
  });

  it("accepts only public receipt fields and strips existing URL query data", () => {
    expect(parsePublicReceipt(JSON.stringify(receipt))).toEqual(receipt);
    expect(() => parsePublicReceipt(JSON.stringify({ ...receipt, actorSecret: "private" }))).toThrow("Not a supported public receipt");
    expect(() => parsePublicReceipt(JSON.stringify({ format: "vulnseal-recovery", ciphertext: "encrypted" }))).toThrow("Not a supported public receipt");
    const link = publicReceiptLink("https://app.example.test/?private=remove#old", receipt);
    expect(link).not.toContain("private=");
    expect(link).toContain("#verify?network=preprod&contract=");
  });
});
