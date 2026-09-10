// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { ledger } from "@vulnseal/contract";
import { hexToBytes } from "@vulnseal/shared";
import fixture from "../../e2e/fixtures/preprod-deployment-state.json";
import { captureDeploymentInputs } from "./program.js";
import { observeTransaction, type TransactionObservation } from "./transaction-verification.js";
import { compareDeploymentPolicy } from "./deployment-verification.js";
vi.mock("./transaction-verification.js", () => ({ observeTransaction: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
const captured = fixture.data.transactions[0]!, action = captured.contractActions[0]!, transactionId = captured.identifiers[0]!;
const endpoints = { indexerUrl: "https://indexer.example.test", rpcUrl: "https://rpc.example.test" };
const saved = captureDeploymentInputs(ledger(ContractState.deserialize(hexToBytes(action.state)).data));
const observation: Exclude<TransactionObservation, { kind: "not-found" }> = { kind: "finalized", status: "SUCCESS", transactionId, checkedAt: "2026-09-10T00:00:00.000Z", indexerUrl: endpoints.indexerUrl, transactionHash: captured.hash, blockHash: captured.block.hash, blockHeight: captured.block.height, finalizedHead: captured.block.height + 1, contractActions: [{ kind: "ContractDeploy", address: action.address, entryPoint: null }] };
const setup = () => {
  // Captured deployment bytes; RPC observation is mocked for deterministic negative cases.
  const tx = { hash: observation.transactionHash, raw: captured.raw, identifiers: [transactionId], block: { ...captured.block }, transactionResult: { status: "SUCCESS" }, contractActions: [{ __typename: "ContractDeploy", address: action.address, state: action.state }] };
  const payload = { data: { transactions: [tx] } };
  vi.mocked(observeTransaction).mockResolvedValue(observation);
  const fetcher = vi.fn(async () => Response.json(payload)); vi.stubGlobal("fetch", fetcher);
  return { tx, payload, fetcher };
};
it("compares decoded state locally and sends only the transaction identifier", async () => {
  const { fetcher } = setup();
  expect(await compareDeploymentPolicy(transactionId, saved, endpoints)).toMatchObject({ address: action.address, mismatches: [], blockHeight: observation.blockHeight });
  const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1];
  expect(JSON.parse(String(init.body)).variables).toEqual({ offset: { identifier: transactionId } });
  expect(String(init.body)).not.toContain(saved.scopeDigest);
  expect(init).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
});
it.each(Object.keys(saved) as (keyof typeof saved)[])("identifies a mismatched %s without claiming success", async (field) => {
  setup();
  const changed = { ...saved, [field]: field.endsWith("Days") ? "999" : "ff".repeat(32) };
  expect((await compareDeploymentPolicy(transactionId, changed, endpoints)).mismatches).toEqual([field]);
});
it.each(["hash", "height", "blockHash", "status", "address", "kind", "duplicate", "ambiguous", "state"])("rejects inconsistent historical evidence: %s", async (field) => {
  const { tx, payload } = setup();
  if (field === "hash") tx.hash = "56".repeat(32);
  if (field === "height") tx.block.height++;
  if (field === "blockHash") tx.block.hash = "56".repeat(32);
  if (field === "status") tx.transactionResult.status = "FAILURE";
  if (field === "address") tx.contractActions[0]!.address = "56".repeat(32);
  if (field === "kind") tx.contractActions[0]!.__typename = "ContractCall";
  if (field === "duplicate") payload.data.transactions.push(tx);
  if (field === "ambiguous") tx.contractActions.push(tx.contractActions[0]!);
  if (field === "state") tx.contractActions[0]!.state = "00";
  await expect(compareDeploymentPolicy(transactionId, saved, endpoints)).rejects.toThrow();
});
it.each([{ kind: "included" as const }, { status: "FAILURE" }, { contractActions: null }, { contractActions: [] }])("requires a finalized unique deployment before fetching state: %j", async (change) => {
  const { fetcher } = setup(); vi.mocked(observeTransaction).mockResolvedValue({ ...observation, ...change });
  await expect(compareDeploymentPolicy(transactionId, saved, endpoints)).rejects.toThrow("one finalized successful deployment");
  expect(fetcher).not.toHaveBeenCalled();
});
