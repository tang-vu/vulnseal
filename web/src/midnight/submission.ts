// SPDX-License-Identifier: Apache-2.0
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { toHex } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";

/** A connector error cannot establish whether the network received the transaction. */
export class SubmissionOutcomeUnknown extends Error {
  readonly transactionId: TransactionId;
  constructor(transactionId: TransactionId, cause: unknown) {
    super(`Wallet submission outcome is unknown for transaction ${transactionId}. Check this identifier in the wallet or indexer before submitting again; a connector error does not prove the transaction failed.`, { cause });
    this.name = "SubmissionOutcomeUnknown";
    this.transactionId = transactionId;
  }
}

/** Resolve all local prerequisites before calling the connector's broadcast method. */
export const submitIdentifiedTransaction = async (
  transaction: FinalizedTransaction,
  submit: (serialized: string) => Promise<unknown>,
): Promise<TransactionId> => {
  const identifier = transaction.identifiers()[0];
  if (typeof identifier !== "string" || !identifier.length) throw new Error("Transaction has no identifier; it was not submitted");
  const serialized = toHex(transaction.serialize());
  try { await submit(serialized); }
  catch (cause) { throw new SubmissionOutcomeUnknown(identifier, cause); }
  return identifier;
};
