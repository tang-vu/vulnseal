// SPDX-License-Identifier: Apache-2.0
import type { ProofProvider } from "@midnight-ntwrk/midnight-js-types";

export const PROOF_GENERATION_TIMEOUT_MS = 600_000;

/** Bound the complete proof step, including artifact fallback and HTTP retries. */
export const boundedProofProvider = (provider: ProofProvider): ProofProvider => ({
  async proveTx(transaction, config) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Proof generation timed out after 10 minutes. The proof server may still be working, but this attempt will not continue to wallet balancing or submission.")), PROOF_GENERATION_TIMEOUT_MS);
    });
    // The SDK has no operation-wide abort signal. Return only the race winner;
    // a late proof or rejection remains handled and cannot resume the caller.
    try { return await Promise.race([provider.proveTx(transaction, config), timeout]); }
    finally { clearTimeout(timer); }
  },
});
