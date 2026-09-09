// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { observeTransaction } from "./transaction-verification.js";
const id = "00315eaad1b87f436849790da0f0072be407dfdf9079b78f15e73c838b9ede2c19", hash = "34".repeat(32), head = "56".repeat(32);
const endpoints = { indexerUrl: "https://indexer.test/graphql", rpcUrl: "https://rpc.test" };
const tx = { identifiers: [id], hash: "78".repeat(32), block: { height: 100, hash }, transactionResult: { status: "SUCCESS" } };
afterEach(() => vi.unstubAllGlobals());
const mock = (transactions: unknown, finalized = "0x64", canonical = hash) => {
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    return Response.json(request.query ? { data: { transactions } } : { result: request.method === "chain_getFinalizedHead" ? `0x${head}` : request.method === "chain_getHeader" ? { number: finalized } : `0x${canonical}` });
  }); vi.stubGlobal("fetch", fetcher); return fetcher;
};
it("matches the exact identifier and checks canonical finalized block evidence", async () => {
  const fetcher = mock([{ ...tx, identifiers: ["90".repeat(32)] }, tx]);
  expect(await observeTransaction(id, endpoints)).toMatchObject({ kind: "finalized", status: "SUCCESS", blockHeight: 100, transactionId: id });
  expect(fetcher).toHaveBeenCalledTimes(4);
  const request = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
  expect(request.variables).toEqual({ offset: { identifier: id } });
});
it("does not turn missing data into rejection", async () => {
  const fetcher = mock([]);
  expect(await observeTransaction(id, endpoints)).toMatchObject({ kind: "not-found" });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("distinguishes an included transaction from a finalized one", async () => {
  mock([tx], "0x63");
  expect(await observeTransaction(id, endpoints)).toMatchObject({ kind: "included", finalizedHead: 99 });
});
it("preserves non-success indexer status without claiming success", async () => {
  mock([{ ...tx, transactionResult: { status: "FAILURE" } }]);
  expect(await observeTransaction(id, endpoints)).toMatchObject({ kind: "finalized", status: "FAILURE" });
});
it("rejects conflicting, ambiguous and malformed evidence", async () => {
  mock([tx], "0x64", "90".repeat(32));
  await expect(observeTransaction(id, endpoints)).rejects.toThrow("disagree");
  mock([tx, tx]); await expect(observeTransaction(id, endpoints)).rejects.toThrow("ambiguous");
  mock([tx], "invalid"); await expect(observeTransaction(id, endpoints)).rejects.toThrow("invalid finalized height");
  mock(null); await expect(observeTransaction(id, endpoints)).rejects.toThrow("could not answer");
});
it("rejects HTTP failures and invalid identifiers before publishing observations", async () => {
  const fetcher = vi.fn(async () => new Response("", { status: 503 })); vi.stubGlobal("fetch", fetcher);
  await expect(observeTransaction("invalid", endpoints)).rejects.toThrow("identifier"); expect(fetcher).not.toHaveBeenCalled();
  await expect(observeTransaction(id, endpoints)).rejects.toThrow("HTTP 503");
});
