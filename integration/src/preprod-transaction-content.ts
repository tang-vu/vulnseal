// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inspectTransactionContent } from "./transaction-content.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--write-fixture")) throw new Error("Usage: preprod-transaction-content [--write-fixture]");
const root = new URL("../../", import.meta.url);
const source = JSON.parse(await readFile(new URL("docs/evidence/preprod-indexer-verification.json", root), "utf8")) as { contractAddress: string; transactions: { circuit: string; identifier: string; transactionHash: string }[] };
const indexerUrl = "https://indexer.preprod.midnight.network/api/v4/graphql";
const query = `query RawRecoveryTransaction($offset: TransactionOffset!) {
  transactions(offset: $offset) { raw hash ... on RegularTransaction { identifiers } }
}`;
const transactions = [];
for (const expected of source.transactions) {
  if (expected.circuit === "nightToDustRegistration") continue;
  const response = await fetch(indexerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables: { offset: { identifier: expected.identifier } } }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
  const payload = await response.json() as { errors?: unknown[]; data?: { transactions?: { raw: string; hash: string; identifiers?: string[] }[] } };
  if (payload.errors?.length || !Array.isArray(payload.data?.transactions)) throw new Error("Indexer did not return transactions");
  const matching = payload.data.transactions.filter((tx) => tx.identifiers?.includes(expected.identifier));
  if (matching.length !== 1 || matching[0]!.hash !== expected.transactionHash) throw new Error("Historical transaction identity changed or is ambiguous");
  const raw = matching[0]!.raw;
  const content = inspectTransactionContent(raw, expected.identifier, expected.transactionHash);
  if (expected.circuit !== "constructor" && !content.calls.some((call) => call.address === source.contractAddress && call.entryPoint === expected.circuit)) throw new Error("Expected historical contract call missing from raw bytes");
  transactions.push({ expected, raw, content });
  console.log(`${expected.circuit}: raw hash/identifier match; ${content.calls.length} contract calls`);
}
if (args.includes("--write-fixture")) {
  const target = new URL("docs/evidence/preprod-raw-transactions.json", root);
  await writeFile(target, JSON.stringify({ capturedAt: new Date().toISOString(), indexerUrl, contractAddress: source.contractAddress, scope: "Public historical bytes checked against retained hashes and SDK-derived identifiers. Decoding is not proof/signature verification or authenticated block inclusion. No report-effect or payment claim. No new transaction submitted.", transactions }, null, 2) + "\n");
  console.log(`Saved ${fileURLToPath(target)}`);
}
