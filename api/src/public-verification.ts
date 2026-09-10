// SPDX-License-Identifier: Apache-2.0
import { readBoundedJson } from "./bounded-json.js";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { ledger, type Ledger } from "@vulnseal/contract";
import { bytesToHex, contractStatusName, hexToBytes } from "@vulnseal/shared";

export type PublicReceipt = { readonly kind: "vulnseal-public-receipt"; readonly version: 1; readonly network: string; readonly contractAddress: string; readonly reportId: string; readonly ciphertextDigest: string };
export const publicHex = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("Enter a 32-byte hexadecimal identifier");
  return normalized;
};
export const parsePublicReceipt = (serialized: string): PublicReceipt => {
  if (serialized.length > 8192) throw new Error("Public receipt is too large. Do not import private recovery files here.");
  const value = JSON.parse(serialized) as Record<string, unknown>;
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["ciphertextDigest", "contractAddress", "kind", "network", "reportId", "version"]) || value.kind !== "vulnseal-public-receipt" || value.version !== 1 || !["local", "preview", "preprod", "mainnet"].includes(String(value.network)) || [value.contractAddress, value.reportId, value.ciphertextDigest].some((field) => typeof field !== "string")) throw new Error("Not a supported public receipt. Never share a private recovery file.");
  return { kind: "vulnseal-public-receipt", version: 1, network: String(value.network), contractAddress: publicHex(String(value.contractAddress)), reportId: publicHex(String(value.reportId)), ciphertextDigest: publicHex(String(value.ciphertextDigest)) };
};
export const publicReceiptLink = (base: string, receipt: PublicReceipt): string => {
  receipt = parsePublicReceipt(JSON.stringify(receipt));
  const url = new URL(base);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Public verifier links require an HTTP or HTTPS base URL");
  url.username = ""; url.password = "";
  url.search = "";
  url.hash = `verify?${new URLSearchParams({ network: receipt.network, contract: receipt.contractAddress, report: receipt.reportId, ciphertext: receipt.ciphertextDigest })}`;
  return url.toString();
};

export const projectPublicLedger = (state: Ledger) => ({
  programId: bytesToHex(state.programId),
  responseDays: String(state.responseDays), disclosureDays: String(state.disclosureDelayDays),
  reports: [...state.reports].map(([id, report]) => ({
    reportId: bytesToHex(id), ciphertextDigest: bytesToHex(report.ciphertextDigest),
    status: contractStatusName(report.status), severity: Number(report.severity), rewardTier: Number(report.rewardTier),
    patchCommitment: bytesToHex(report.patchCommitment), retestCommitment: bytesToHex(report.retestCommitment), payoutReceipt: bytesToHex(report.payoutReceipt),
    createdSequence: String(report.createdSequence), updatedSequence: String(report.updatedSequence),
  })),
});
export type PublicLedgerView = ReturnType<typeof projectPublicLedger>;
export type PublicVerification = PublicLedgerView & { readonly contractAddress: string; readonly checkedAt: string; readonly blockHeight: number; readonly blockHash: string; readonly finalizedHead: number; readonly indexerUrl: string };

const query = `query PublicVulnSeal($address: HexEncoded!) {
  contractAction(address: $address) { address state transaction { block { height hash } ... on RegularTransaction { transactionResult { status } } } }
}`;

/** Read only: no wallet, proof provider, private state, or ciphertext requests. */
export const verifyPublicContract = async (
  address: string,
  endpoints: { readonly indexerUrl: string; readonly rpcUrl: string },
  signal?: AbortSignal,
): Promise<PublicVerification> => {
  const contractAddress = publicHex(address);
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const post = async (url: string, body: unknown) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: requestSignal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`Public data service returned HTTP ${response.status}`);
    return readBoundedJson(response, 16 * 1024 * 1024, requestSignal);
  };
  const payload = await post(endpoints.indexerUrl, { query, variables: { address: contractAddress } });
  if (payload.errors?.length) throw new Error("The indexer could not answer the contract query");
  const action = payload.data?.contractAction;
  if (!action) throw new Error("Contract not found on this network. Check the address or whether the test network was reset.");
  if (publicHex(action.address) !== contractAddress || typeof action.state !== "string" || !/^(?:0x)?(?:[0-9a-fA-F]{2})+$/.test(action.state)) throw new Error("Indexer returned malformed contract state");
  if (action.transaction?.transactionResult?.status !== "SUCCESS") throw new Error("The latest contract action is not successful");
  const blockHeight = action.transaction.block?.height;
  const blockHash = action.transaction.block?.hash;
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0 || typeof blockHash !== "string") throw new Error("Indexer returned invalid block evidence");
  const rpc = async (method: string, params: unknown[]) => {
    const response = await post(endpoints.rpcUrl, { jsonrpc: "2.0", id: 1, method, params });
    if (response.error || response.result === undefined) throw new Error("RPC could not verify block finality");
    return response.result;
  };
  const reportedHead = await rpc("chain_getFinalizedHead", []);
  if (typeof reportedHead !== "string" || !/^(?:0x)?[0-9a-f]{64}$/i.test(reportedHead)) throw new Error("RPC returned an invalid finalized block hash");
  const headHash = `0x${publicHex(reportedHead)}`;
  const [header, canonicalBlockHash] = await Promise.all([rpc("chain_getHeader", [headHash]), rpc("chain_getBlockHash", [blockHeight])]);
  if (typeof header?.number !== "string" || !/^0x[0-9a-f]+$/i.test(header.number)) throw new Error("RPC returned an invalid finalized height");
  const finalizedHead = Number.parseInt(header.number.slice(2), 16);
  if (!Number.isSafeInteger(finalizedHead) || finalizedHead < blockHeight) throw new Error("The contract state is not yet finalized. Try again shortly.");
  if (typeof canonicalBlockHash !== "string" || publicHex(canonicalBlockHash) !== publicHex(blockHash)) throw new Error("Indexer and RPC disagree on the contract block");
  let projection: PublicLedgerView;
  try { projection = projectPublicLedger(ledger(ContractState.deserialize(hexToBytes(action.state)).data)); }
  catch { throw new Error("The contract state is incompatible with this VulnSeal schema"); }
  return { ...projection, contractAddress, checkedAt: new Date().toISOString(), blockHeight, blockHash, finalizedHead, indexerUrl: endpoints.indexerUrl };
};

/** Match a public receipt to an observed report; endpoints/inclusion remain caller-trusted. */
export const verifyPublicReceipt = async (
  serialized: string,
  endpoints: { readonly indexerUrl: string; readonly rpcUrl: string },
  signal?: AbortSignal,
) => {
  const receipt = parsePublicReceipt(serialized);
  const verification = await verifyPublicContract(receipt.contractAddress, endpoints, signal);
  const report = verification.reports.find(report => report.reportId === receipt.reportId);
  if (!report) throw new Error("The receipt's report is absent from the observed contract");
  if (report.ciphertextDigest !== receipt.ciphertextDigest) throw new Error("The receipt's ciphertext digest differs from the observed report");
  return { receipt, report, verification };
};
