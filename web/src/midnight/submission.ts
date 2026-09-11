// SPDX-License-Identifier: Apache-2.0
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { continuationDeadline } from "./continuation-deadline.js";
import { toHex } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";

export const WALLET_SUBMISSION_TIMEOUT_MS = 120_000;

/** A connector error cannot establish whether the network received the transaction. */
export class SubmissionOutcomeUnknown extends Error {
  readonly transactionId: TransactionId;
  constructor(transactionId: TransactionId, cause: unknown) {
    super(`Wallet submission outcome is unknown for transaction ${transactionId}. Check this identifier in the wallet or indexer before submitting again; a connector error does not prove the transaction failed.`, { cause });
    this.name = "SubmissionOutcomeUnknown";
    this.transactionId = transactionId;
  }
}

/** Resolve local prerequisites first. Submit callbacks must recheck assertActive after awaited preparation and before broadcast. */
export const submitIdentifiedTransaction = async (
  transaction: FinalizedTransaction,
  submit: (serialized: string, signal: AbortSignal, assertActive: () => void) => Promise<unknown>,
  beforeSubmit?: (transactionId: TransactionId) => Promise<void>,
): Promise<TransactionId> => {
  const identifier = transaction.identifiers()[0];
  if (typeof identifier !== "string" || !identifier.length) throw new Error("Transaction has no identifier; it was not submitted");
  const serialized = toHex(transaction.serialize());
  await beforeSubmit?.(identifier);
  // The deadline starts only after durable local prerequisites have completed.
  // Aborting stops our wait; an already invoked wallet broadcast cannot be undone.
  try {
    await continuationDeadline(WALLET_SUBMISSION_TIMEOUT_MS,
      "Wallet submission response deadline exceeded; the wallet may still complete the transaction",
      async (assertActive, signal) => submit(serialized, signal, assertActive));
  } catch (cause) { throw new SubmissionOutcomeUnknown(identifier, cause); }
  return identifier;
};
