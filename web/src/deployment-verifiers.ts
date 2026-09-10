// SPDX-License-Identifier: Apache-2.0
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import type { VulnSealCircuitKeys } from "@vulnseal/api/types";

const circuits = Object.keys({ submitReport: true, beginTriage: true, acceptReport: true, rejectReport: true, anchorPatch: true, submitRetest: true, authorizePayout: true, closeReport: true } satisfies Record<VulnSealCircuitKeys, true>);
export type DeploymentVerifierComparison = { matched: string[]; mismatched: string[]; missing: string[]; unexpected: string[] };

/** Compare the SDK-exposed key version with this release's local reference files. */
export async function compareDeploymentVerifiers(serialized: string, keyBase: string, signal: AbortSignal): Promise<DeploymentVerifierComparison> {
  const state = ContractState.deserialize(hexToBytes(serialized));
  const names = state.operations().map(name => typeof name === "string" ? name : `0x${bytesToHex(name)}`);
  const result: DeploymentVerifierComparison = { matched: [], mismatched: [], missing: circuits.filter(name => !names.includes(name)), unexpected: names.filter(name => !circuits.includes(name)) };
  // Only fixed known entrypoints can select a file; no indexer string becomes a URL.
  for (const name of circuits.filter(name => names.includes(name))) {
    signal.throwIfAborted();
    const response = await fetch(new URL(`${name}.verifier`, keyBase), { signal, redirect: "error", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
      await response.body?.cancel();
      throw new Error(`Release verifier file unavailable: ${name}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Empty release verifier file: ${name}`);
    const buffer = new Uint8Array(64 * 1024); let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); signal.throwIfAborted();
        if (done) break;
        if (value.length > buffer.length - length) { await reader.cancel(); throw new Error(`Release verifier file exceeds 64 KiB: ${name}`); }
        buffer.set(value, length); length += value.length;
      }
    } finally { reader.releaseLock(); }
    const actual = state.operation(name)!.verifierKey;
    (length === actual.length && actual.every((byte, index) => byte === buffer[index]) ? result.matched : result.mismatched).push(name);
  }
  return result;
}
