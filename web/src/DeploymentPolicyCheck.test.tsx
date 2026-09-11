// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DeploymentCheckResult } from "./deployment-verification.js";
import { DeploymentPolicyCheck } from "./DeploymentPolicyCheck.js";
import type { SavedDeploymentInputs } from "./program.js";
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { instances.push(this); }
}
beforeEach(() => { instances.length = 0; vi.useFakeTimers(); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const saved: SavedDeploymentInputs = { programId: "12".repeat(32), scopeDigest: "34".repeat(32), responsePolicyDigest: "56".repeat(32), rewardPolicyDigest: "78".repeat(32), disclosurePolicyDigest: "ab".repeat(32), responseDays: "7", disclosureDelayDays: "90" };
it("compares only on request and displays mismatches without an address-selection action", async () => {
  const result: DeploymentCheckResult = { address: "cd".repeat(32), blockHeight: 10, checkedAt: "now", mismatches: ["rewardPolicyDigest"] };
  render(<DeploymentPolicyCheck network="preprod" transactionId="ef" saved={saved} />);
  expect(instances).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Compare saved deployment policy" }));
  act(() => instances[0]!.onmessage?.({ data: { result } }));
  expect(screen.getByRole("status")).toHaveTextContent("differs: rewardPolicyDigest");
  expect(screen.getByRole("status")).toHaveTextContent("does not authenticate");
  expect(screen.getAllByRole("button")).toHaveLength(1);
});
it.each(["cancel", "change", "unmount"])("ignores a late result after %s", async (operation) => {
  const view = render(<DeploymentPolicyCheck network="preprod" transactionId="ef" saved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "Compare saved deployment policy" }));
  const active = instances[0]!;
  if (operation === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel policy comparison" }));
  if (operation === "change") view.rerender(<DeploymentPolicyCheck network="preprod" transactionId="ab" saved={saved} />);
  if (operation === "unmount") view.unmount();
  expect(active.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  act(() => active.onmessage?.({ data: { result: { address: "cd".repeat(32), blockHeight: 10, checkedAt: "now", mismatches: [] } } }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each(["timeout", "load", "message", "empty"])("terminates worker and permits explicit retry after %s", (failure) => {
  render(<DeploymentPolicyCheck network="preprod" transactionId="ef" saved={saved} />);
  const button = screen.getByRole("button", { name: "Compare saved deployment policy" });
  fireEvent.click(button);
  expect(instances[0]!.postMessage).toHaveBeenCalledWith({ transactionId: "ef", saved, endpoints: { indexerUrl: "https://indexer.preprod.midnight.network/api/v4/graphql", rpcUrl: "https://rpc.preprod.midnight.network" } });
  act(() => {
    if (failure === "timeout") vi.advanceTimersByTime(30_000);
    if (failure === "load") instances[0]!.onerror?.();
    if (failure === "message") instances[0]!.onmessageerror?.();
    if (failure === "empty") instances[0]!.onmessage?.({ data: {} });
  });
  expect(instances[0]!.terminate).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(button).toBeEnabled();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(button);
  act(() => instances[0]!.onmessage?.({ data: { result: { mismatches: [] } } }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(instances).toHaveLength(2);
});


it.each(["match", "policy", "missing", "different", "unexpected", "absent", "duplicate"])("offers address review only when policy and all release keys match: %s", outcome => {
  const onChooseVerifiedAddress = vi.fn();
  const verifiers = { matched: ["submitReport", "beginTriage", "acceptReport", "rejectReport", "anchorPatch", "submitRetest", "authorizePayout", "closeReport"], mismatched: [] as string[], missing: [] as string[], unexpected: [] as string[] };
  if (outcome === "missing") verifiers.missing.push("closeReport");
  if (outcome === "different") verifiers.mismatched.push("closeReport");
  if (outcome === "unexpected") verifiers.unexpected.push("unknown");
  if (outcome === "duplicate") verifiers.matched[7] = "submitReport";
  render(<DeploymentPolicyCheck network="preprod" transactionId="ef" saved={saved} onChooseVerifiedAddress={onChooseVerifiedAddress} />);
  fireEvent.click(screen.getByRole("button", { name: "Compare saved deployment policy" }));
  act(() => instances[0]!.onmessage?.({ data: { result: { address: "cd".repeat(32), blockHeight: 10, checkedAt: "now", mismatches: outcome === "policy" ? ["scopeDigest"] : [], ...(outcome === "absent" ? {} : { verifiers }) } } }));
  expect(onChooseVerifiedAddress).not.toHaveBeenCalled();
  if (outcome === "match") {
    fireEvent.click(screen.getByRole("button", { name: "Review recovery at this address" }));
    expect(onChooseVerifiedAddress).toHaveBeenCalledWith("cd".repeat(32));
  } else expect(screen.queryByRole("button", { name: "Review recovery at this address" })).not.toBeInTheDocument();
});
