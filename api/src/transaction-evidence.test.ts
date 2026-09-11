// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
vi.mock("@vulnseal/contract", () => ({ compiledVulnSealContract: {}, ledger: vi.fn() }));
import { VulnSealApi } from "./api.js";

const submit = (data: unknown) => {
  const logger = { info: vi.fn(), error: vi.fn() };
  const api = Reflect.construct(VulnSealApi, [
    { deployTxData: { public: { contractAddress: "ab".repeat(32) } }, callTx: { beginTriage: vi.fn().mockResolvedValue({ public: data }) } },
    { privateStateProvider: { setContractAddress: vi.fn() } }, logger,
  ]) as VulnSealApi;
  return { result: api.beginTriage(new Uint8Array(32)), logger };
};

it.each([null, undefined, [], 12, {}, { txId: "", blockHeight: 1 }, { txId: "fake", blockHeight: 1 }, { txId: "ab".repeat(31), blockHeight: 1 }, { txId: "zz".repeat(32), blockHeight: 1 }])("rejects malformed transaction evidence %j", async data => {
  const { result, logger } = submit(data);
  await expect(result).rejects.toThrow("Invalid Midnight transaction evidence");
  expect(logger.info).not.toHaveBeenCalledWith("Contract transition finalized", expect.anything());
});

it.each([-1, -1n, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "", "-1", "1.2", "1e3", "01", " ", null, undefined])("rejects invalid block height %s", async blockHeight => {
  const { result, logger } = submit({ txId: "ab".repeat(32), blockHeight });
  await expect(result).rejects.toThrow("Invalid Midnight transaction evidence");
  expect(logger.info).not.toHaveBeenCalledWith("Contract transition finalized", expect.anything());
});

it.each([0, 42, 42n, "42", "9007199254740993"])("preserves exact valid height %s and transaction identifiers", async blockHeight => {
  for (const bytes of [32, 33]) for (const field of ["txId", "txHash"]) {
    const txId = "ab".repeat(bytes);
    await expect(submit({ [field]: txId, blockHeight }).result).resolves.toEqual({ circuit: "beginTriage", txId, blockHeight: String(blockHeight) });
  }
});
