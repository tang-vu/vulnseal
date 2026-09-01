// SPDX-License-Identifier: Apache-2.0

export type AttachmentDigest = {
  readonly filename: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sha256: string;
};

/** All fields in this object remain inside the encrypted artifact. */
export type VulnerabilityReport = {
  readonly schemaVersion: 1;
  readonly title: string;
  readonly summary: string;
  readonly affectedAsset: string;
  readonly weakness: string;
  readonly reproductionSteps: readonly string[];
  readonly impact: string;
  readonly suggestedRemediation: string;
  readonly attachments: readonly AttachmentDigest[];
  readonly researcherContact: string;
};

export type CiphertextEnvelope = {
  readonly version: 1;
  readonly algorithm: "AES-256-GCM";
  readonly keyDerivation: "none-random-256-bit-key";
  readonly iv: string;
  readonly aad: string;
  readonly ciphertext: string;
};

export type SealedReport = {
  readonly canonicalReport: string;
  readonly canonicalReportDigest: Uint8Array;
  readonly key: Uint8Array;
  readonly envelope: CiphertextEnvelope;
  readonly serializedEnvelope: string;
  readonly ciphertextDigest: Uint8Array;
  readonly contentAddress: string;
};

export type CommitmentInputs = {
  readonly programId: Uint8Array;
  readonly canonicalReportDigest: Uint8Array;
  readonly reportSalt: Uint8Array;
};

export const REPORT_STATUS = [
  "COMMITTED",
  "TRIAGED",
  "ACCEPTED",
  "REJECTED",
  "PATCH_READY",
  "RETEST_PASSED",
  "RETEST_FAILED",
  "PAYOUT_AUTHORIZED",
  "CLOSED",
] as const;

export type ReportStatusName = (typeof REPORT_STATUS)[number];
