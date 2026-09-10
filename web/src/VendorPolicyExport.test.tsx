// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { programConstructor } from "@vulnseal/api/program-policy";
import { bytesToHex } from "@vulnseal/shared";
const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("./public-verification.js", () => ({ verifyPublicContract: mocks.verify }));
import { VendorPolicyExport } from "./VendorPolicyExport.js";
const policy = { name: "Example", primaryScope: "api.example.test", additionalScope: "", responseDays: 7, disclosureDays: 90, rewardPolicy: "Tier 4" };
const draft = { ...policy, responseDays: "7", disclosureDays: "90" };
const program = await programConstructor(new Uint8Array(32).fill(1), policy);
const observed = { programId: bytesToHex(program.programId), scopeDigest: bytesToHex(program.scopeDigest), responsePolicyDigest: bytesToHex(program.responsePolicyDigest), rewardPolicyDigest: bytesToHex(program.rewardPolicyDigest), disclosurePolicyDigest: bytesToHex(program.disclosurePolicyDigest), responseDays: "7", disclosureDays: "90", blockHeight: 10, checkedAt: "now" };
const props = { draft, network: "preprod", programId: observed.programId, contractAddress: "ab".repeat(32) };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("exports only reviewed policy after explicit lookup and download", async () => {
  mocks.verify.mockResolvedValue(observed); const download = vi.fn();
  render(<VendorPolicyExport {...props} onDownload={download} />);
  expect(mocks.verify).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check public policy for sharing" }));
  const button = await screen.findByRole("button", { name: "Download public program policy" });
  expect(download).not.toHaveBeenCalled(); fireEvent.click(button);
  expect(JSON.parse(download.mock.calls[0]![0])).toEqual(policy);
});
it.each(["policy", "program"])("refuses export when %s differs", async mismatch => {
  mocks.verify.mockResolvedValue({ ...observed, ...(mismatch === "program" ? { programId: "ff".repeat(32) } : { rewardPolicyDigest: "ff".repeat(32) }) });
  render(<VendorPolicyExport {...props} onDownload={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Check public policy for sharing" }));
  if (mismatch === "program") {
    expect(await screen.findByRole("alert")).toHaveTextContent("Observed program differs");
    expect(screen.queryByRole("button", { name: "Download public program policy" })).not.toBeInTheDocument();
  } else {
    expect(await screen.findByRole("button", { name: "Download public program policy" })).toBeDisabled();
    expect(screen.getByText("Differences: Reward policy")).toBeInTheDocument();
  }
});
it("cancels and ignores a late result after the draft changes", async () => {
  let finish!: (value: typeof observed) => void;
  mocks.verify.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<VendorPolicyExport {...props} onDownload={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Check public policy for sharing" }));
  const signal = mocks.verify.mock.calls[0]![2] as AbortSignal;
  view.rerender(<VendorPolicyExport {...props} draft={{ ...draft, rewardPolicy: "Changed" }} onDownload={vi.fn()} />);
  expect(signal.aborted).toBe(true);
  await act(async () => { finish(observed); });
  expect(screen.queryByRole("button", { name: "Download public program policy" })).not.toBeInTheDocument();
});
it("does not substitute defaults for a backup without a policy draft", () => {
  render(<VendorPolicyExport {...props} draft={undefined} onDownload={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Check public policy for sharing" })).toBeDisabled();
});
it("retains the preview after a download error and clears the error on a successful retry", async () => {
  mocks.verify.mockResolvedValue(observed);
  const download = vi.fn().mockImplementationOnce(() => { throw new Error("Download unavailable"); });
  render(<VendorPolicyExport {...props} onDownload={download} />);
  fireEvent.click(screen.getByRole("button", { name: "Check public policy for sharing" }));
  const button = await screen.findByRole("button", { name: "Download public program policy" });
  fireEvent.click(button); expect(screen.getByRole("alert")).toHaveTextContent("Download unavailable");
  fireEvent.click(button); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.verify).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledTimes(2);
});
