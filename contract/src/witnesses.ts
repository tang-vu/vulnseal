// SPDX-License-Identifier: Apache-2.0
import type { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { Ledger } from "./managed/vulnseal/contract/index.js";

const BYTE_LENGTH = 32;

export type ReportPreimage = {
  readonly programId: Uint8Array;
  readonly canonicalDigest: Uint8Array;
  readonly salt: Uint8Array;
};

export type PatchEvidence = {
  readonly reportId: Uint8Array;
  readonly patchDigest: Uint8Array;
};

export type RetestEvidence = {
  readonly reportId: Uint8Array;
  readonly patchCommitment: Uint8Array;
  readonly evidenceDigest: Uint8Array;
};

/**
 * Security-critical local state. Applications must persist it only in an
 * encrypted private-state provider; it must never be logged or serialized to
 * the ciphertext store. The active evidence slots support one in-flight proof.
 */
export type VulnSealPrivateState = {
  readonly actorSecret: Uint8Array;
  readonly report: ReportPreimage;
  readonly patch: PatchEvidence;
  readonly retest: RetestEvidence;
};

const zero = (): Uint8Array => new Uint8Array(BYTE_LENGTH);

const bytes32 = (value: Uint8Array, label: string): Uint8Array => {
  if (value.byteLength !== BYTE_LENGTH) {
    throw new Error(`${label} must be exactly ${BYTE_LENGTH} bytes`);
  }
  return new Uint8Array(value);
};

export const createVulnSealPrivateState = (
  actorSecret: Uint8Array,
  report?: Partial<ReportPreimage>,
  patch?: Partial<PatchEvidence>,
  retest?: Partial<RetestEvidence>,
): VulnSealPrivateState => ({
  actorSecret: bytes32(actorSecret, "actorSecret"),
  report: {
    programId: bytes32(report?.programId ?? zero(), "report.programId"),
    canonicalDigest: bytes32(
      report?.canonicalDigest ?? zero(),
      "report.canonicalDigest",
    ),
    salt: bytes32(report?.salt ?? zero(), "report.salt"),
  },
  patch: {
    reportId: bytes32(patch?.reportId ?? zero(), "patch.reportId"),
    patchDigest: bytes32(patch?.patchDigest ?? zero(), "patch.patchDigest"),
  },
  retest: {
    reportId: bytes32(retest?.reportId ?? zero(), "retest.reportId"),
    patchCommitment: bytes32(
      retest?.patchCommitment ?? zero(),
      "retest.patchCommitment",
    ),
    evidenceDigest: bytes32(
      retest?.evidenceDigest ?? zero(),
      "retest.evidenceDigest",
    ),
  },
});

type Context = WitnessContext<Ledger, VulnSealPrivateState>;

export const witnesses = {
  actorSecret: ({ privateState }: Context): [VulnSealPrivateState, Uint8Array] => [
    privateState,
    bytes32(privateState.actorSecret, "actorSecret"),
  ],
  reportPreimage: ({
    privateState,
  }: Context): [
    VulnSealPrivateState,
    [Uint8Array, Uint8Array, Uint8Array],
  ] => [
    privateState,
    [
      bytes32(privateState.report.programId, "report.programId"),
      bytes32(privateState.report.canonicalDigest, "report.canonicalDigest"),
      bytes32(privateState.report.salt, "report.salt"),
    ],
  ],
  patchEvidence: ({
    privateState,
  }: Context): [VulnSealPrivateState, [Uint8Array, Uint8Array]] => [
    privateState,
    [
      bytes32(privateState.patch.reportId, "patch.reportId"),
      bytes32(privateState.patch.patchDigest, "patch.patchDigest"),
    ],
  ],
  retestEvidence: ({
    privateState,
  }: Context): [
    VulnSealPrivateState,
    [Uint8Array, Uint8Array, Uint8Array],
  ] => [
    privateState,
    [
      bytes32(privateState.retest.reportId, "retest.reportId"),
      bytes32(privateState.retest.patchCommitment, "retest.patchCommitment"),
      bytes32(privateState.retest.evidenceDigest, "retest.evidenceDigest"),
    ],
  ],
};
