// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { observeTransaction, type TransactionObservation } from "./transaction-verification.js";
import { TransactionCheck } from "./TransactionCheck.js";

vi.mock("./transaction-verification.js", async (original) => ({ ...await original<typeof import("./transaction-verification.js")>(), observeTransaction: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const transactionId = "cd".repeat(32), address = "ab".repeat(32);
const observed: Exclude<TransactionObservation, { kind: "not-found" }> = { kind: "finalized", status: "SUCCESS", transactionId, checkedAt: "2026-09-09T00:00:00.000Z", indexerUrl: "https://indexer.example.test", transactionHash: "01".repeat(32), blockHash: "02".repeat(32), blockHeight: 100, finalizedHead: 101, contractActions: [{ kind: "ContractDeploy", address, entryPoint: null }] };

it("offers a candidate only after an explicit check and only fills the form on selection", async () => {
  vi.mocked(observeTransaction).mockResolvedValue(observed);
  const choose = vi.fn();
  render(<TransactionCheck network="preprod" transactionId={transactionId} circuit="constructor" onChooseDeploymentAddress={choose} />);
  expect(observeTransaction).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Use observed address in reconnect form" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check transaction status" }));
  const button = await screen.findByRole("button", { name: "Use observed address in reconnect form" });
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledExactlyOnceWith(address);
  expect(screen.getByText(/connecting must still verify/)).toBeInTheDocument();
});

it.each([
  { kind: "included" as const }, { status: "FAILURE" }, { status: "PARTIAL_SUCCESS" },
  { contractActions: null }, { contractActions: [] },
  { contractActions: [...observed.contractActions!, ...observed.contractActions!] },
  { contractActions: [{ kind: "ContractCall" as const, address, entryPoint: "constructor" }] },
])("does not offer deployment recovery from incomplete or ambiguous evidence: %j", async (change) => {
  vi.mocked(observeTransaction).mockResolvedValue({ ...observed, ...change });
  const choose = vi.fn();
  render(<TransactionCheck network="preprod" transactionId={transactionId} circuit="constructor" onChooseDeploymentAddress={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Check transaction status" }));
  await screen.findByRole("status");
  expect(screen.queryByRole("button", { name: "Use observed address in reconnect form" })).not.toBeInTheDocument();
  expect(choose).not.toHaveBeenCalled();
});

it.each([{ circuit: undefined }, { circuit: "beginTriage" }, { circuit: "constructor", contractAddress: address }])("does not select an address for unrelated or already bound intent: %j", async (props) => {
  vi.mocked(observeTransaction).mockResolvedValue(observed);
  render(<TransactionCheck network="preprod" transactionId={transactionId} onChooseDeploymentAddress={vi.fn()} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Check transaction status" }));
  await screen.findByRole("status");
  expect(screen.queryByRole("button", { name: "Use observed address in reconnect form" })).not.toBeInTheDocument();
});
