// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { bytesToHex, sha256, utf8 } from "@vulnseal/shared";
import { createVulnSealPrivateState } from "@vulnseal/contract";
import { VulnSealSimulator } from "../../contract/src/test/vulnseal-simulator.js";
import { savedPatchCommitment } from "./patch-comparison.js";

it("matches the compiled anchorPatch circuit and binds exact text to its report", async () => {
  const bytes = (n: number) => new Uint8Array(32).fill(n);
  const programId = bytes(1), owner = bytes(11), text = "  patch:commit-123\n";
  const simulator = new VulnSealSimulator(createVulnSealPrivateState(owner), { programId, scopeDigest: bytes(2), responsePolicyDigest: bytes(3), responseDays: 7n, rewardPolicyDigest: bytes(4), disclosurePolicyDigest: bytes(5), disclosureDelayDays: 90n });
  simulator.switchActor(createVulnSealPrivateState(bytes(22), { programId, canonicalDigest: bytes(33), salt: bytes(44) }));
  const id = simulator.submitReport(bytes(55));
  simulator.switchActor(createVulnSealPrivateState(owner, undefined, { reportId: id, patchDigest: await sha256(utf8(text)) }));
  simulator.beginTriage(id); simulator.acceptReport(id, 3n, bytes(66));
  const expected = bytesToHex(simulator.anchorPatch(id));
  expect(await savedPatchCommitment(bytesToHex(id), text)).toBe(expected);
  expect(await savedPatchCommitment(bytesToHex(id), text.trim())).not.toBe(expected);
  expect(await savedPatchCommitment(bytesToHex(bytes(99)), text)).not.toBe(expected);
  await expect(savedPatchCommitment("invalid", text)).rejects.toThrow("Invalid report ID");
});
