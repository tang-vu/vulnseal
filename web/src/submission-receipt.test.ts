// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { createVulnSealPrivateState } from "@vulnseal/contract";
import { VulnSealSimulator } from "../../contract/src/test/vulnseal-simulator.js";
import { submissionReceipt } from "./submission-receipt.js";

it("matches the compiled submitReport receipt and binds every immutable field", () => {
  const bytes = (value: number) => new Uint8Array(32).fill(value);
  const programId = bytes(1);
  const simulator = new VulnSealSimulator(createVulnSealPrivateState(bytes(11)), { programId, scopeDigest: bytes(2), responsePolicyDigest: bytes(3), responseDays: 7n, rewardPolicyDigest: bytes(4), disclosurePolicyDigest: bytes(5), disclosureDelayDays: 90n });
  simulator.switchActor(createVulnSealPrivateState(bytes(22), { programId, canonicalDigest: bytes(33), salt: bytes(44) }));
  const id = simulator.submitReport(bytes(55));
  const record = simulator.getLedger().reports.lookup(id);
  expect(submissionReceipt(id, record.ciphertextDigest, record.researcherKey)).toEqual(record.submissionReceipt);
  expect(submissionReceipt(bytes(99), record.ciphertextDigest, record.researcherKey)).not.toEqual(record.submissionReceipt);
  expect(submissionReceipt(id, bytes(99), record.researcherKey)).not.toEqual(record.submissionReceipt);
  expect(submissionReceipt(id, record.ciphertextDigest, bytes(99))).not.toEqual(record.submissionReceipt);
});
