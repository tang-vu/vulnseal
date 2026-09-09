// SPDX-License-Identifier: Apache-2.0
import { CompactTypeBytes, CompactTypeVector, persistentHash } from "@midnight-ntwrk/compact-runtime";
import { bytesToHex, hexToBytes, sha256, utf8 } from "@vulnseal/shared";

/** Mirrors derivePatchCommitment in the retained Compact contract. */
export async function savedPatchCommitment(reportId: string, text: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(reportId)) throw new Error("Invalid report ID for saved patch comparison");
  const domain = new Uint8Array(32); domain.set(utf8("vulnseal:patch:v1"));
  return bytesToHex(persistentHash(new CompactTypeVector(3, new CompactTypeBytes(32)), [domain, hexToBytes(reportId), await sha256(utf8(text))]));
}
