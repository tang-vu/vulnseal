// SPDX-License-Identifier: Apache-2.0
import { continuationDeadline } from "./continuation-deadline.js";
import type { ProofProvider } from "@midnight-ntwrk/midnight-js-types";

export const PROOF_GENERATION_TIMEOUT_MS = 600_000;

/** Bound the complete proof step, including artifact fallback and HTTP retries. */
export const boundedProofProvider = (provider: ProofProvider): ProofProvider => ({
  proveTx: (transaction, config) => continuationDeadline(PROOF_GENERATION_TIMEOUT_MS,
    "Proof generation timed out after 10 minutes. The proof server may still be working, but this attempt will not continue to wallet balancing or submission.",
    async () => provider.proveTx(transaction, config)),
});
