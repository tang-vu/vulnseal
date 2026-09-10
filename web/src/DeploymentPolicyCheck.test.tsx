// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { compareDeploymentPolicy } from "./deployment-verification.js";
import { DeploymentPolicyCheck } from "./DeploymentPolicyCheck.js";
import type { SavedDeploymentInputs } from "./program.js";
vi.mock("./deployment-verification.js", () => ({ compareDeploymentPolicy: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const saved: SavedDeploymentInputs = { programId: "12".repeat(32), scopeDigest: "34".repeat(32), responsePolicyDigest: "56".repeat(32), rewardPolicyDigest: "78".repeat(32), disclosurePolicyDigest: "ab".repeat(32), responseDays: "7", disclosureDelayDays: "90" };
it("compares only on request and displays mismatches without an address-selection action", async () => {
  vi.mocked(compareDeploymentPolicy).mockResolvedValue({ address: "cd".repeat(32), blockHeight: 10, checkedAt: "now", mismatches: ["rewardPolicyDigest"] });
  render(<DeploymentPolicyCheck network="preprod" transactionId="ef" saved={saved} />);
  expect(compareDeploymentPolicy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Compare saved deployment policy" }));
  expect(await screen.findByRole("status")).toHaveTextContent("differs: rewardPolicyDigest");
  expect(screen.getByRole("status")).toHaveTextContent("does not authenticate");
  expect(screen.getAllByRole("button")).toHaveLength(1);
});
it.each(["cancel", "change", "unmount"])("ignores a late result after %s", async (operation) => {
  let finish!: (value: Awaited<ReturnType<typeof compareDeploymentPolicy>>) => void;
  vi.mocked(compareDeploymentPolicy).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<DeploymentPolicyCheck network="preprod" transactionId="ef" saved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "Compare saved deployment policy" }));
  const signal = vi.mocked(compareDeploymentPolicy).mock.calls[0]![3]!;
  if (operation === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel policy comparison" }));
  if (operation === "change") view.rerender(<DeploymentPolicyCheck network="preprod" transactionId="ab" saved={saved} />);
  if (operation === "unmount") view.unmount();
  expect(signal.aborted).toBe(true);
  finish({ address: "cd".repeat(32), blockHeight: 10, checkedAt: "now", mismatches: [] });
  await Promise.resolve();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
