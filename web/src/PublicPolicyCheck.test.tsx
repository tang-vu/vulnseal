// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { programConstructor } from "@vulnseal/api/program-policy";
import { bytesToHex } from "@vulnseal/shared";
import { PublicPolicyCheck } from "./PublicPolicyCheck.js";
const policy = { name: "Example", primaryScope: "api.example.test", additionalScope: "", responseDays: 7, disclosureDays: 90, rewardPolicy: "Tier 4" };
const program = await programConstructor(new Uint8Array(32).fill(1), policy);
const observed = { programId: bytesToHex(program.programId), scopeDigest: bytesToHex(program.scopeDigest), responsePolicyDigest: bytesToHex(program.responsePolicyDigest), rewardPolicyDigest: bytesToHex(program.rewardPolicyDigest), disclosurePolicyDigest: bytesToHex(program.disclosurePolicyDigest), responseDays: "7", disclosureDays: "90" };
afterEach(cleanup);
function upload(value: unknown) {
  const file = new File([JSON.stringify(value)], "policy.json");
  Object.defineProperty(file, "text", { value: async () => JSON.stringify(value) });
  fireEvent.change(screen.getByLabelText("Compare public program policy"), { target: { files: [file] } });
}
it("compares a policy then clears the old match for changed/private input", async () => {
  render(<PublicPolicyCheck observed={observed} />);
  upload(policy); await screen.findByRole("heading", { name: "All six policy fields match" });
  upload({ ...policy, primaryScope: "different.example.test" });
  await screen.findByRole("heading", { name: "Policy differs from observed state" });
  expect(screen.getByText("Scope digest: Differs")).toBeInTheDocument();
  upload({ ...policy, actorSecret: "private" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid program policy fields");
  expect(screen.queryByRole("heading", { name: "All six policy fields match" })).not.toBeInTheDocument();
});
it("ignores a delayed file when a newer policy has already been selected", async () => {
  let finish!: (value: string) => void;
  const file = new File(["pending"], "slow.json");
  Object.defineProperty(file, "text", { value: () => new Promise<string>(resolve => { finish = resolve; }) });
  render(<PublicPolicyCheck observed={observed} />);
  fireEvent.change(screen.getByLabelText("Compare public program policy"), { target: { files: [file] } });
  upload({ ...policy, rewardPolicy: "Changed reward" });
  await screen.findByRole("heading", { name: "Policy differs from observed state" });
  await act(async () => { finish(JSON.stringify(policy)); });
  expect(screen.getByText("Reward policy digest: Differs")).toBeInTheDocument();
});
it("discards a comparison when the observed program changes", async () => {
  const view = render(<PublicPolicyCheck observed={observed} />);
  upload(policy); await screen.findByRole("heading", { name: "All six policy fields match" });
  view.rerender(<PublicPolicyCheck observed={{ ...observed, rewardPolicyDigest: "ff".repeat(32) }} />);
  expect(screen.queryByRole("heading", { name: "All six policy fields match" })).not.toBeInTheDocument();
  upload(policy); await screen.findByRole("heading", { name: "Policy differs from observed state" });
});
