// SPDX-License-Identifier: Apache-2.0
import { findPreviousContractAction } from "@vulnseal/api/contract-history";
import { replayReportTransaction } from "@vulnseal/api/replay-report-transaction";
import { bytesToHex, contractStatusName } from "@vulnseal/shared";
import { readBoundedJson } from "./bounded-json.js";
import { observeTransaction } from "./transaction-verification.js";

export type ReportCheckInput = { transactionId: string; contractAddress: string; circuit: string; programId: string; reportId: string; indexerUrl: string; rpcUrl: string; websocketUrl: string };
export type ReplayedPublicValues = { decisionDigest: string; severity: string; rewardTier: string; ciphertextDigest?: string };
export type ReportCheckResult = { checkedAt: string; reportId: string; before: string; after: string; blockHeight: number; previousBlockHeight: number; actionsRead: number; publicValues?: ReplayedPublicValues };
const post = async (url: string, body: unknown) => {
  const signal = AbortSignal.timeout(20_000);
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("Report evidence service is unavailable");
  return readBoundedJson(response, 16 * 1024 * 1024, signal);
};
const query = async (input: ReportCheckInput, document: string, variables: unknown) => {
  const payload = await post(input.indexerUrl, { query: document, variables });
  if (payload.errors?.length || !payload.data) throw new Error("Indexer could not provide report evidence");
  return payload.data;
};
export async function reconcileReport(input: ReportCheckInput): Promise<ReportCheckResult> {
  if (![input.contractAddress, input.programId, input.reportId].every((value) => /^[a-f0-9]{64}$/.test(value)) || input.circuit === "constructor") throw new Error("A saved report and report-operation intent are required");
  const observation = await observeTransaction(input.transactionId, input);
  if (observation.kind !== "finalized" || observation.status !== "SUCCESS") throw new Error("Report replay requires a finalized successful transaction; the outcome still needs reconciliation");
  const data = await query(input, `query ReportReplayTarget($offset: TransactionOffset!) { transactions(offset: $offset) {
    hash raw ... on RegularTransaction { identifiers transactionResult { status segments { id success } } }
    contractActions { __typename address state ... on ContractCall { entryPoint deploy { transaction { block { height } } } } }
  } }`, { offset: { identifier: observation.transactionId } });
  if (!Array.isArray(data.transactions)) throw new Error("Missing report transaction");
  const matches = data.transactions.filter((tx: any) => Array.isArray(tx?.identifiers) && tx.identifiers.includes(observation.transactionId));
  if (matches.length !== 1 || matches[0].hash !== observation.transactionHash) throw new Error("Report transaction identity is inconsistent");
  const target = matches[0];
  if (!Array.isArray(target.contractActions)) throw new Error("Missing report contract action");
  const calls = target.contractActions.filter((action: any) => action.__typename === "ContractCall" && action.address === input.contractAddress && action.entryPoint === input.circuit);
  if (calls.length !== 1) throw new Error("Transaction does not uniquely match the recorded contract and circuit");
  const call = calls[0];
  const history = await findPreviousContractAction({ ...input, deploymentHeight: call.deploy?.transaction?.block?.height });
  if (history.target.transactionHash !== observation.transactionHash || history.target.blockHash !== observation.blockHash || history.target.blockHeight !== observation.blockHeight) throw new Error("History disagrees with finalized transaction evidence");
  const prior = (await query(input, `query ReportReplayPrior($address: HexEncoded!, $offset: ContractActionOffset!) {
    contractAction(address: $address, offset: $offset) { address state transaction { hash } }
  }`, { address: input.contractAddress, offset: { transactionOffset: { hash: history.previous.transactionHash } } })).contractAction;
  if (!prior || prior.address !== input.contractAddress || prior.transaction?.hash !== history.previous.transactionHash) throw new Error("Previous report state does not match its transaction");
  for (const action of [history.previous, history.target]) {
    const rpc = await post(input.rpcUrl, { jsonrpc: "2.0", id: 1, method: "chain_getBlockHash", params: [action.blockHeight] });
    if (rpc.error || typeof rpc.result !== "string" || rpc.result.toLowerCase().replace(/^0x/, "") !== action.blockHash) throw new Error("History and RPC disagree on a report-state block");
  }
  const replay = replayReportTransaction({ raw: target.raw, identifier: observation.transactionId, transactionHash: target.hash, contractAddress: input.contractAddress, circuit: input.circuit, beforeState: prior.state, afterState: call.state, status: target.transactionResult?.status, segments: target.transactionResult?.segments });
  if (replay.programId !== input.programId) throw new Error("Replayed program differs from this backup");
  if (replay.changedReports.length !== 1 || replay.changedReports[0]!.reportId !== input.reportId) throw new Error("Transaction did not change exactly the report recorded in this backup");
  const change = replay.changedReports[0]!;
  return { checkedAt: new Date().toISOString(), reportId: input.reportId, before: change.before ? contractStatusName(change.before.status) : "Absent", after: change.after ? contractStatusName(change.after.status) : "Removed", blockHeight: observation.blockHeight, previousBlockHeight: history.previous.blockHeight, actionsRead: history.actionsRead, ...(change.after ? { publicValues: { ciphertextDigest: bytesToHex(change.after.ciphertextDigest), decisionDigest: bytesToHex(change.after.decisionDigest), severity: change.after.severity.toString(), rewardTier: change.after.rewardTier.toString() } } : {}) };
}
