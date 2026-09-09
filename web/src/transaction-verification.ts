// SPDX-License-Identifier: Apache-2.0
export type TransactionObservation = {
  readonly transactionId: string; readonly checkedAt: string; readonly indexerUrl: string;
} & ({ readonly kind: "not-found" } | {
  readonly kind: "included" | "finalized"; readonly status: string; readonly transactionHash: string;
  readonly blockHeight: number; readonly blockHash: string; readonly finalizedHead: number;
});
const hex = (value: unknown): string => {
  if (typeof value !== "string" || !/^(?:0x)?[a-f0-9]{64}$/i.test(value)) throw new Error("Invalid transaction or block identifier");
  return value.toLowerCase().replace(/^0x/, "");
};
const query = `query ReconcileTransaction($offset: TransactionOffset!) {
  transactions(offset: $offset) { hash block { height hash }
    ... on RegularTransaction { identifiers transactionResult { status } }
  }
}`;

/** Read-only observation. A missing identifier never establishes rejection or retry safety. */
export const observeTransaction = async (
  identifier: string,
  endpoints: { readonly indexerUrl: string; readonly rpcUrl: string },
  signal?: AbortSignal,
): Promise<TransactionObservation> => {
  if (typeof identifier !== "string" || !/^(?:0x)?(?:[a-f0-9]{64}|[a-f0-9]{66})$/i.test(identifier)) throw new Error("Invalid transaction identifier");
  const transactionId = identifier.toLowerCase().replace(/^0x/, "");
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const post = async (url: string, body: unknown) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: requestSignal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`Transaction data service returned HTTP ${response.status}`);
    return response.json();
  };
  const payload = await post(endpoints.indexerUrl, { query, variables: { offset: { identifier: transactionId } } });
  if (payload.errors?.length || !Array.isArray(payload.data?.transactions)) throw new Error("Indexer could not answer the transaction query");
  const matches = payload.data.transactions.filter((entry: { identifiers?: unknown }) => Array.isArray(entry?.identifiers) && entry.identifiers.some((id: unknown) => typeof id === "string" && id.toLowerCase().replace(/^0x/, "") === transactionId));
  const base = { transactionId, checkedAt: new Date().toISOString(), indexerUrl: endpoints.indexerUrl };
  if (!matches.length) return { ...base, kind: "not-found" };
  if (matches.length !== 1) throw new Error("Indexer returned ambiguous transaction matches");
  const tx = matches[0], transactionHash = hex(tx.hash), blockHash = hex(tx.block?.hash), blockHeight = tx.block?.height;
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0 || typeof tx.transactionResult?.status !== "string" || !/^[A-Z_]{1,64}$/.test(tx.transactionResult.status)) throw new Error("Indexer returned malformed transaction evidence");
  const rpc = async (method: string, params: unknown[]) => {
    const response = await post(endpoints.rpcUrl, { jsonrpc: "2.0", id: 1, method, params });
    if (response.error || response.result === undefined) throw new Error("RPC could not verify transaction finality");
    return response.result;
  };
  const head = hex(await rpc("chain_getFinalizedHead", []));
  const [header, canonicalHash] = await Promise.all([rpc("chain_getHeader", [`0x${head}`]), rpc("chain_getBlockHash", [blockHeight])]);
  if (typeof header?.number !== "string" || !/^0x[0-9a-f]+$/i.test(header.number)) throw new Error("RPC returned an invalid finalized height");
  const finalizedHead = Number.parseInt(header.number.slice(2), 16);
  if (!Number.isSafeInteger(finalizedHead)) throw new Error("RPC returned an invalid finalized height");
  if (hex(canonicalHash) !== blockHash) throw new Error("Indexer and RPC disagree on the transaction block");
  return { ...base, checkedAt: new Date().toISOString(), kind: finalizedHead >= blockHeight ? "finalized" : "included", status: tx.transactionResult.status, transactionHash, blockHeight, blockHash, finalizedHead };
};
