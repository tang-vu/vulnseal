// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { verifyDeploymentState } from "./transaction-content.js";
const evidence = JSON.parse(readFileSync(new URL("../../docs/evidence/preprod-raw-transactions.json", import.meta.url), "utf8"));
const captured = JSON.parse(readFileSync(new URL("../../e2e/fixtures/preprod-deployment-state.json", import.meta.url), "utf8")).data.transactions[0];
const laterState = JSON.parse(readFileSync(new URL("../../e2e/fixtures/preprod-public-state.json", import.meta.url), "utf8")).data.contractAction.state;
const input = { raw: evidence.transactions[0].raw, identifier: evidence.transactions[0].expected.identifier, transactionHash: captured.hash, contractAddress: captured.contractActions[0].address, state: captured.contractActions[0].state };
it("binds the captured deployment address and complete initial state to SDK-checked transaction bytes", () => {
  expect(verifyDeploymentState(input)).toEqual({ address: input.contractAddress, transactionHash: input.transactionHash, stateBytes: 18181 });
});
it.each(["hash", "identifier", "address", "state", "raw", "size", "call"])("rejects substituted deployment evidence: %s", (field) => {
  const changed = { ...input };
  if (field === "hash") changed.transactionHash = "12".repeat(32);
  if (field === "identifier") changed.identifier = "12".repeat(32);
  if (field === "address") changed.contractAddress = "12".repeat(32);
  if (field === "state") changed.state = laterState; // Valid serialized state of the same contract after report calls.
  if (field === "raw") changed.raw = "00";
  if (field === "size") changed.state = "00".repeat(4 * 1024 * 1024 + 1);
  if (field === "call") {
    const call = evidence.transactions[1];
    changed.raw = call.raw; changed.identifier = call.expected.identifier; changed.transactionHash = call.expected.transactionHash;
  }
  expect(() => verifyDeploymentState(changed)).toThrow(field === "state" ? /differs from the raw transaction/ : undefined);
});
