// SPDX-License-Identifier: Apache-2.0
import { CompactTypeBoolean, CompactTypeBytes, CompactTypeVector, persistentHash } from "@midnight-ntwrk/compact-runtime";
import { bytesToHex, hexToBytes, sha256, utf8 } from "@vulnseal/shared";

/** Mirrors deriveRetestCommitment in the retained Compact contract. */
export async function savedRetestCommitment(reportId: string, patchCommitment: string, text: string, passed: boolean): Promise<string> {
  if (![reportId, patchCommitment].every((value) => /^[a-f0-9]{64}$/.test(value)) || typeof passed !== "boolean") throw new Error("Invalid saved retest comparison inputs");
  const domain = new Uint8Array(32); domain.set(utf8("vulnseal:retest:v1"));
  return bytesToHex(persistentHash(new CompactTypeVector(5, new CompactTypeBytes(32)), [domain, hexToBytes(reportId), hexToBytes(patchCommitment), await sha256(utf8(text)), persistentHash(CompactTypeBoolean, passed)]));
}
