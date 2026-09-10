// SPDX-License-Identifier: Apache-2.0
import { CompactTypeBytes, CompactTypeVector, persistentHash } from "@midnight-ntwrk/compact-runtime";
import { assertBytes32, utf8 } from "@vulnseal/shared";

/** Mirrors the private deriveSubmissionReceipt helper in the retained Compact source. */
export function submissionReceipt(commitment: Uint8Array, ciphertextDigest: Uint8Array, researcherKey: Uint8Array): Uint8Array {
  const domain = new Uint8Array(32); domain.set(utf8("vulnseal:submission:v1"));
  return persistentHash(new CompactTypeVector(4, new CompactTypeBytes(32)), [
    domain, assertBytes32(commitment, "commitment"), assertBytes32(ciphertextDigest, "ciphertextDigest"), assertBytes32(researcherKey, "researcherKey"),
  ]);
}
