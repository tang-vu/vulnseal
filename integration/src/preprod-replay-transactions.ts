// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { replayReportTransaction } from "./replay-report-transaction.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--write-fixture")) throw new Error("Usage: preprod-replay-transactions [--write-fixture]");
const root = new URL("../../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("docs/evidence/preprod-raw-transactions.json", root), "utf8")) as { contractAddress: string; transactions: { expected: { circuit: string; identifier: string; transactionHash: string }; raw: string }[] };
const indexerUrl = "https://indexer.preprod.midnight.network/api/v4/graphql";
const query = `query ReplayState($address: HexEncoded!, $offset: ContractActionOffset!) {
  contractAction(address: $address, offset: $offset) {
    address state transaction { hash block { height }
      ... on RegularTransaction { transactionResult { status segments { id success } } }
    }
  }
}`;
type HistoricalState = { address: string; state: string; transaction: { hash: string; block: { height: number }; transactionResult: { status: string; segments: { id: number; success: boolean }[] | null } } };
const states: HistoricalState[] = [];
for (const { expected } of fixture.transactions) {
  const response = await fetch(indexerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables: { address: fixture.contractAddress, offset: { transactionOffset: { identifier: expected.identifier } } } }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
  const payload = await response.json() as { errors?: unknown[]; data?: { contractAction?: HistoricalState } };
  const state = payload.data?.contractAction;
  if (payload.errors?.length || !state || state.address !== fixture.contractAddress || state.transaction.hash !== expected.transactionHash) throw new Error("Historical action state does not match the requested contract/transaction");
  states.push(state);
}
const results = [];
for (let index = 1; index < fixture.transactions.length; index++) {
  const tx = fixture.transactions[index]!, state = states[index]!;
  const replay = replayReportTransaction({ raw: tx.raw, identifier: tx.expected.identifier, transactionHash: tx.expected.transactionHash, circuit: tx.expected.circuit, contractAddress: fixture.contractAddress, beforeState: states[index - 1]!.state, afterState: state.state, ...state.transaction.transactionResult });
  const changedReports = replay.changedReports.map((entry) => ({ reportId: entry.reportId, beforeStatus: entry.before?.status ?? null, afterStatus: entry.after?.status ?? null }));
  results.push({ circuit: tx.expected.circuit, identifier: tx.expected.identifier, programId: replay.programId, segment: replay.segment, changedReports });
  console.log(`${tx.expected.circuit}: complete replayed data state matches; ${changedReports.length} report records changed`);
}
if (args.includes("--write-fixture")) await writeFile(new URL("docs/evidence/preprod-transcript-replay.json", root), JSON.stringify({ capturedAt: new Date().toISOString(), indexerUrl, scope: "SDK VM replay against indexer-supplied historical states using the initial cost model. Full contract data state equality, not proof/signature verification, authenticated inclusion or safe retry. No new transaction submitted.", states, results }, (_, value: unknown) => typeof value === "bigint" ? value.toString() : value, 2) + "\n");
