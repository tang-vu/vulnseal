// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
vi.mock("@vulnseal/contract", () => ({ compiledVulnSealContract: {}, ledger: vi.fn() }));
import { VulnSealApi, type SafeLogger } from "./api.js";

const receipt = { txId: "ab".repeat(32), blockHeight: 7 };
const make = (logger: SafeLogger, failure?: Error) => {
  const call = failure ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue({ public: receipt });
  const api = Reflect.construct(VulnSealApi, [
    { deployTxData: { public: { contractAddress: "cd".repeat(32) } }, callTx: { beginTriage: call } },
    { privateStateProvider: { setContractAddress: vi.fn() } }, logger,
  ]) as VulnSealApi;
  return { api, call };
};

it.each(["Submitting authorized contract transition", "Contract transition finalized"])("preserves one successful SDK call when logging %s throws", async message => {
  const { api, call } = make({ info: (text) => { if (text === message) throw new Error("Logger offline"); }, error: vi.fn() });
  await expect(api.beginTriage(new Uint8Array(32))).resolves.toEqual({ circuit: "beginTriage", txId: receipt.txId, blockHeight: "7" });
  expect(call).toHaveBeenCalledTimes(1);
});

it("preserves the original SDK failure when error logging throws", async () => {
  const original = new Error("SDK failed after submission");
  const { api, call } = make({ info: vi.fn(), error: () => { throw new Error("Logger offline"); } }, original);
  await expect(api.beginTriage(new Uint8Array(32))).rejects.toBe(original);
  expect(call).toHaveBeenCalledTimes(1);
});

it("does not let a logger mutate the returned transaction evidence", async () => {
  const { api } = make({ info: (message, context) => {
    if (message === "Contract transition finalized") Object.assign(context as object, { txId: "corrupted", circuit: "closeReport", blockHeight: "-1" });
  }, error: vi.fn() });
  await expect(api.beginTriage(new Uint8Array(32))).resolves.toEqual({ circuit: "beginTriage", txId: receipt.txId, blockHeight: "7" });
});

it.each([false, true])("handles rejected async log sinks while preserving SDK failure=%s", async fails => {
  const original = new Error("SDK rejected");
  const sink = vi.fn(async () => { throw new Error("Async logger offline"); });
  const { api, call } = make({ info: sink, error: sink }, fails ? original : undefined);
  const pending = api.beginTriage(new Uint8Array(32));
  if (fails) await expect(pending).rejects.toBe(original);
  else await expect(pending).resolves.toMatchObject({ txId: receipt.txId });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(call).toHaveBeenCalledTimes(1);
  expect(sink).toHaveBeenCalledTimes(2);
});
