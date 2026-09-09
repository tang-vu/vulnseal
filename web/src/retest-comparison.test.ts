// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { bytesToHex, sha256, utf8 } from "@vulnseal/shared";
import { createVulnSealPrivateState } from "@vulnseal/contract";
import { VulnSealSimulator } from "../../contract/src/test/vulnseal-simulator.js";
import { savedRetestCommitment } from "./retest-comparison.js";

it.each([true, false])("matches the compiled retest circuit for passed=%s", async (passed) => {
  const bytes = (n: number) => new Uint8Array(32).fill(n);
  const programId = bytes(1), owner = bytes(11), text = "  retest evidence\n";
  const report = { programId, canonicalDigest: bytes(33), salt: bytes(44) };
  const simulator = new VulnSealSimulator(createVulnSealPrivateState(owner), { programId, scopeDigest: bytes(2), responsePolicyDigest: bytes(3), responseDays: 7n, rewardPolicyDigest: bytes(4), disclosurePolicyDigest: bytes(5), disclosureDelayDays: 90n });
  simulator.switchActor(createVulnSealPrivateState(bytes(22), report));
  const id = simulator.submitReport(bytes(55));
  simulator.switchActor(createVulnSealPrivateState(owner, undefined, { reportId: id, patchDigest: bytes(77) }));
  simulator.beginTriage(id); simulator.acceptReport(id, 3n, bytes(66));
  const patch = simulator.anchorPatch(id);
  simulator.switchActor(createVulnSealPrivateState(bytes(22), report, undefined, { reportId: id, patchCommitment: patch, evidenceDigest: await sha256(utf8(text)) }));
  const expected = bytesToHex(simulator.submitRetest(id, passed));
  const calculate = (note: string, choice: boolean, patchId = bytesToHex(patch)) => savedRetestCommitment(bytesToHex(id), patchId, note, choice);
  expect(await calculate(text, passed)).toBe(expected);
  expect(await calculate(text.trim(), passed)).not.toBe(expected);
  expect(await calculate(text, !passed)).not.toBe(expected);
  expect(await calculate(text, passed, bytesToHex(bytes(99)))).not.toBe(expected);
  await expect(calculate(text, passed, "invalid")).rejects.toThrow("Invalid saved retest");
});
