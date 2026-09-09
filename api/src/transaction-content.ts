// SPDX-License-Identifier: Apache-2.0
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import { ContractCall, Transaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";

/** Decode public bytes only after binding them to the requested identifier and hash.
 * This does not verify proofs, signatures, block inclusion or report effects. */
export function inspectTransactionContent(raw: string, identifier: string, expectedHash: string) {
  if (typeof raw !== "string" || raw.length > 4 * 1024 * 1024 + 2 || !/^(?:0x)?(?:[a-f0-9]{2})+$/i.test(raw)) throw new Error("Invalid or excessive raw transaction");
  const encoded = raw.replace(/^0x/i, "");
  if (encoded.length > 4 * 1024 * 1024) throw new Error("Invalid or excessive raw transaction");
  if (!/^(?:[a-f0-9]{64}|[a-f0-9]{66})$/i.test(identifier) || !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error("Invalid expected transaction identity");
  const tx = Transaction.deserialize("signature", "proof", "binding", hexToBytes(encoded));
  if (tx.transactionHash() !== expectedHash.toLowerCase() || !tx.identifiers().includes(identifier.toLowerCase())) throw new Error("Raw transaction does not match the requested identity");
  const calls = [];
  for (const [segment, intent] of tx.intents ?? []) {
    for (const action of intent.actions) {
      if (!(action instanceof ContractCall)) continue;
      calls.push({ segment, address: action.address, entryPoint: typeof action.entryPoint === "string" ? action.entryPoint : { hex: bytesToHex(action.entryPoint) }, guaranteedOperations: action.guaranteedTranscript?.program.length ?? 0, fallibleOperations: action.fallibleTranscript?.program.length ?? 0 });
    }
  }
  return { transactionHash: tx.transactionHash(), identifiers: tx.identifiers(), calls };
}
