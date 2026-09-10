// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("./public-verification.js", async (original) => ({ ...await original<typeof import("./public-verification.js")>(), verifyPublicContract: mocks.verify }));
import { PublicLookup } from "./PublicLookup.js";
import type { PublicVerification } from "./public-verification.js";

afterEach(() => { cleanup(); vi.resetAllMocks(); window.location.hash = ""; });
const address = "ab".repeat(32);
const receipt = JSON.stringify({ kind: "vulnseal-public-receipt", version: 1, network: "preprod", contractAddress: address, reportId: "cd".repeat(32), ciphertextDigest: "ef".repeat(32) });
const verified: PublicVerification = { scopeDigest: "03".repeat(32), responsePolicyDigest: "04".repeat(32), rewardPolicyDigest: "05".repeat(32), disclosurePolicyDigest: "06".repeat(32), contractAddress: address, programId: "01".repeat(32), reports: [], responseDays: "7", disclosureDays: "30", checkedAt: "now", blockHeight: 1, blockHash: "02".repeat(32), finalizedHead: 2, indexerUrl: "https://example.test" };

it("aborts a canceled lookup and keeps a replacement pending when the old result arrives", async () => {
  let first!: (value: PublicVerification) => void, second!: (value: PublicVerification) => void;
  mocks.verify.mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
  render(<PublicLookup />);
  fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: "Load public state" }));
  const signal = mocks.verify.mock.calls[0]![2] as AbortSignal;
  fireEvent.click(screen.getByRole("button", { name: "Cancel public lookup" }));
  expect(signal.aborted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Load public state" }));
  await act(async () => first(verified));
  expect(screen.queryByRole("heading", { name: "Finalized public state" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel public lookup" })).toBeInTheDocument();
  await act(async () => second(verified));
  expect(screen.getByRole("heading", { name: "Finalized public state" })).toBeInTheDocument();
  expect(mocks.verify).toHaveBeenCalledTimes(2);
});

it("cancels a pending receipt without letting its late contents replace edited fields", async () => {
  let finish!: (value: string) => void;
  const file = new File([receipt], "receipt.json");
  Object.defineProperty(file, "text", { value: () => new Promise<string>((resolve) => { finish = resolve; }) });
  render(<PublicLookup />);
  fireEvent.change(screen.getByLabelText("Import public receipt"), { target: { files: [file] } });
  expect(screen.getByRole("status")).toHaveTextContent("Reading public receipt");
  expect(screen.getByRole("button", { name: "Load public state" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel receipt import" }));
  fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: "my edited address" } });
  await act(async () => finish(receipt));
  expect(screen.getByLabelText("Contract address")).toHaveValue("my edited address");
  expect(screen.getByLabelText("Report commitment (optional)")).toHaveValue("");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(mocks.verify).not.toHaveBeenCalled();
});

it("allows importing the same receipt again after edits without starting a lookup", async () => {
  const file = new File([receipt], "receipt.json");
  Object.defineProperty(file, "text", { value: async () => receipt });
  render(<PublicLookup />);
  const input = screen.getByLabelText("Import public receipt");
  await act(async () => fireEvent.change(input, { target: { files: [file] } }));
  expect(input).toHaveValue("");
  expect(screen.getByLabelText("Contract address")).toHaveValue(address);
  fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: "edited" } });
  await act(async () => fireEvent.change(input, { target: { files: [file] } }));
  expect(screen.getByLabelText("Contract address")).toHaveValue(address);
  expect(mocks.verify).not.toHaveBeenCalled();
});
