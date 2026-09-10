// SPDX-License-Identifier: Apache-2.0
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { verifyDeploymentState } from "@vulnseal/api/transaction-content";
import { ledger } from "@vulnseal/contract";
import { hexToBytes } from "@vulnseal/shared";
import { captureDeploymentInputs, validateDeploymentInputs, type SavedDeploymentInputs } from "./program.js";
import { observeTransaction } from "./transaction-verification.js";
import { readBoundedJson } from "./bounded-json.js";

export type DeploymentCheckInput = { transactionId: string; saved: SavedDeploymentInputs; endpoints: { indexerUrl: string; rpcUrl: string } };
export type DeploymentCheckResult = Awaited<ReturnType<typeof compareDeploymentPolicy>>;

/** Compare local intent with the historical state claimed by the indexer, never today's draft. */
export async function compareDeploymentPolicy(transactionId: string, saved: SavedDeploymentInputs, endpoints: { indexerUrl: string; rpcUrl: string }, signal?: AbortSignal) {
  const expected = validateDeploymentInputs(saved);
  const pending = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const observed = await observeTransaction(transactionId, endpoints, pending);
  if (observed.kind !== "finalized" || observed.status !== "SUCCESS" || observed.contractActions?.length !== 1 || observed.contractActions[0]?.kind !== "ContractDeploy") throw new Error("Policy comparison requires one finalized successful deployment action");
  const address = observed.contractActions[0].address;
  const response = await fetch(endpoints.indexerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    query: `query DeploymentPolicy($offset: TransactionOffset!) { transactions(offset: $offset) {
      hash raw block { height hash } ... on RegularTransaction { identifiers transactionResult { status } }
      contractActions { __typename address state }
    } }`, variables: { offset: { identifier: observed.transactionId } },
  }), signal: pending, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("Deployment policy service is unavailable");
  const payload = await readBoundedJson(response, 16 * 1024 * 1024, pending);
  if (payload.errors?.length || !Array.isArray(payload.data?.transactions)) throw new Error("Missing deployment policy evidence");
  const matches = payload.data.transactions.filter((tx: any) => Array.isArray(tx?.identifiers) && tx.identifiers.includes(observed.transactionId));
  if (matches.length !== 1) throw new Error("Deployment transaction is not uniquely identified");
  const tx = matches[0];
  if (tx.hash !== observed.transactionHash || tx.block?.height !== observed.blockHeight || tx.block?.hash !== observed.blockHash || tx.transactionResult?.status !== "SUCCESS") throw new Error("Deployment state disagrees with the finalized transaction observation");
  if (!Array.isArray(tx.contractActions) || tx.contractActions.length !== 1) throw new Error("Deployment state has ambiguous actions");
  const action = tx.contractActions[0];
  if (action?.__typename !== "ContractDeploy" || action.address !== address) throw new Error("Deployment state names another action or address");
  verifyDeploymentState({ raw: tx.raw, identifier: observed.transactionId, transactionHash: observed.transactionHash, contractAddress: address, state: action.state });
  let actual: SavedDeploymentInputs;
  try {
    if (typeof action.state !== "string" || !/^(?:0x)?(?:[a-f0-9]{2})+$/i.test(action.state)) throw new Error("Invalid state");
    actual = captureDeploymentInputs(ledger(ContractState.deserialize(hexToBytes(action.state)).data));
  } catch { throw new Error("Deployment state is incompatible with this VulnSeal schema"); }
  return { address, blockHeight: observed.blockHeight, checkedAt: new Date().toISOString(), mismatches: (Object.keys(expected) as (keyof SavedDeploymentInputs)[]).filter((key) => expected[key] !== actual[key]) };
}
