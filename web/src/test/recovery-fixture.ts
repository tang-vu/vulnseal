// SPDX-License-Identifier: Apache-2.0
import { pureCircuits } from "@vulnseal/contract";
import { bytesToHex, hexToBytes, sealReport, type VulnerabilityReport } from "@vulnseal/shared";
import { defaultProgram } from "../program.js";
import type { RecoverySnapshot } from "../recovery.js";

export const recoveryDraft: VulnerabilityReport = { schemaVersion: 1, title: "Private vulnerability", summary: "Private summary", affectedAsset: "api.example.test", weakness: "CWE-862", reproductionSteps: ["Private reproduction"], impact: "Private impact", suggestedRemediation: "", attachments: [], researcherContact: "private@example.test" };
export const recoveryFixture = async () => {
  const programId = "12".repeat(32);
  const salt = "23".repeat(32);
  const sealed = await sealReport(recoveryDraft, programId);
  const id = bytesToHex(pureCircuits.deriveReportCommitment(hexToBytes(programId), Uint8Array.from(sealed.canonicalReportDigest), hexToBytes(salt)));
  const snapshot: RecoverySnapshot = {
    version: 1, mode: "guided-local", network: "undeployed", contractAddress: null, programId, policy: defaultProgram,
    vendorSecret: "34".repeat(32), researcherSecret: "45".repeat(32), draft: recoveryDraft,
    report: { envelope: sealed.serializedEnvelope, key: bytesToHex(sealed.key), salt, id },
    status: "COMMITTED", history: ["COMMITTED"], patch: null, retest: null, payout: null, severity: 3,
    rationale: "Private vendor rationale", patchReference: "Private release", retestNotes: "Private retest",
  };
  return { snapshot, sealed };
};
