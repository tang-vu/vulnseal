// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { findPreviousContractAction } from "@vulnseal/api/contract-history";
import { replayReportTransaction } from "./replay-report-transaction.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--write-evidence")) throw new Error("Usage: preprod-discovered-replay [--write-evidence]");
const root = new URL("../../", import.meta.url);
const source = JSON.parse(await readFile(new URL("docs/evidence/preprod-lifecycle.json", root), "utf8")) as { contractAddress: string; transactions: { txId: string }[] };
const identifier = source.transactions.at(-1)!.txId, address = source.contractAddress;
const indexerUrl = "https://indexer.preprod.midnight.network/api/v4/graphql", websocketUrl = "wss://indexer.preprod.midnight.network/api/v4/graphql/ws";
const post = async (query: string, variables: unknown) => {
  const response = await fetch(indexerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data) throw new Error("Indexer could not provide replay data");
  return payload.data;
};
const payload = await post(`query($offset: TransactionOffset!) { transactions(offset: $offset) {
  hash raw ... on RegularTransaction { identifiers transactionResult { status segments { id success } } }
  contractActions { __typename address state ... on ContractCall { entryPoint deploy { transaction { block { height } } } } }
} }`, { offset: { identifier } });
const matches = payload.transactions.filter((tx: any) => tx.identifiers?.includes(identifier));
if (matches.length !== 1) throw new Error("Target transaction is missing or ambiguous");
const target = matches[0], calls = target.contractActions.filter((action: any) => action.address === address && action.__typename === "ContractCall");
if (calls.length !== 1) throw new Error("Target must contain one matching contract call");
const call = calls[0], deploymentHeight = call.deploy.transaction.block.height;
const history = await findPreviousContractAction({ websocketUrl, contractAddress: address, transactionId: identifier, deploymentHeight });
if (history.target.transactionHash !== target.hash || history.target.entryPoint !== call.entryPoint) throw new Error("HTTP and WebSocket target data disagree");
const prior = (await post(`query($address: HexEncoded!, $offset: ContractActionOffset!) {
  contractAction(address: $address, offset: $offset) { address state transaction { hash } }
}`, { address, offset: { transactionOffset: { hash: history.previous.transactionHash } } })).contractAction;
if (!prior || prior.address !== address || prior.transaction.hash !== history.previous.transactionHash) throw new Error("Discovered predecessor state does not match its transaction");
const replay = replayReportTransaction({ raw: target.raw, identifier, transactionHash: target.hash, contractAddress: address, circuit: call.entryPoint, beforeState: prior.state, afterState: call.state, ...target.transactionResult });
const result = { checkedAt: new Date().toISOString(), indexerUrl, websocketUrl, scope: "Source-reported predecessor discovery followed by SDK VM replay. Not an authenticated history-completeness or inclusion proof; no retry or payment authorization. No transaction submitted.", deploymentHeight, history, reportChanges: replay.changedReports.map((entry) => ({ reportId: entry.reportId, beforeStatus: entry.before?.status ?? null, afterStatus: entry.after?.status ?? null })) };
if (args.includes("--write-evidence")) await writeFile(new URL("docs/evidence/preprod-discovered-replay.json", root), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
