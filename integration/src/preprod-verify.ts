// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preprodConfig } from "./preprod-config.js";

type ExpectedTransaction = {
  readonly circuit: string;
  readonly identifier: string;
  readonly transactionHash: string;
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly status: "SUCCESS";
};

type VerificationSnapshot = {
  readonly network: "preprod";
  readonly contractAddress: string;
  readonly transactions: readonly ExpectedTransaction[];
};

type IndexedTransaction = {
  readonly hash: string;
  readonly identifiers?: readonly string[];
  readonly transactionResult?: { readonly status: string };
  readonly block: { readonly height: number; readonly hash: string };
};

type GraphQlResponse<T> = {
  readonly data?: T;
  readonly errors?: ReadonlyArray<{ readonly message?: string }>;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotPath = path.join(repoRoot, "docs/evidence/preprod-indexer-verification.json");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const graphQl = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  const response = await fetch(preprodConfig.indexerHttpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  assert(response.ok, `Preprod indexer returned HTTP ${response.status}`);
  const payload = await response.json() as GraphQlResponse<T>;
  assert(payload.errors === undefined || payload.errors.length === 0,
    `Preprod indexer query failed: ${payload.errors?.[0]?.message ?? "unknown GraphQL error"}`);
  assert(payload.data !== undefined, "Preprod indexer response did not contain data");
  return payload.data;
};

const rpc = async <T>(method: string, params: readonly unknown[]): Promise<T> => {
  const response = await fetch(preprodConfig.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert(response.ok, `Preprod RPC returned HTTP ${response.status}`);
  const payload = await response.json() as { readonly result?: T; readonly error?: { readonly message?: string } };
  assert(payload.error === undefined, `Preprod RPC failed: ${payload.error?.message ?? "unknown RPC error"}`);
  assert(payload.result !== undefined, "Preprod RPC response did not contain a result");
  return payload.result;
};

const parseSnapshot = (value: unknown): VerificationSnapshot => {
  assert(value !== null && typeof value === "object", "Invalid Preprod verification snapshot");
  const record = value as Record<string, unknown>;
  assert(record.network === "preprod", "Verification snapshot is not for Preprod");
  assert(typeof record.contractAddress === "string" && /^[0-9a-f]{64}$/u.test(record.contractAddress),
    "Verification snapshot has an invalid contract address");
  assert(Array.isArray(record.transactions) && record.transactions.length > 0,
    "Verification snapshot has no transactions");
  for (const item of record.transactions) {
    assert(item !== null && typeof item === "object", "Verification snapshot has an invalid transaction");
    const transaction = item as Record<string, unknown>;
    assert(typeof transaction.circuit === "string", "Verification transaction has no circuit");
    assert(typeof transaction.identifier === "string", "Verification transaction has no identifier");
    assert(typeof transaction.transactionHash === "string", "Verification transaction has no hash");
    assert(typeof transaction.blockHeight === "number", "Verification transaction has no block height");
    assert(typeof transaction.blockHash === "string", "Verification transaction has no block hash");
    assert(transaction.status === "SUCCESS", "Verification snapshot contains a non-success transaction");
  }
  return record as VerificationSnapshot;
};

const transactionQuery = `
  query VerifyTx($offset: TransactionOffset!) {
    transactions(offset: $offset) {
      hash
      block { height hash }
      ... on RegularTransaction {
        identifiers
        transactionResult { status }
      }
    }
  }
`;

const contractQuery = `
  query VerifyContract($address: HexEncoded!) {
    contractAction(address: $address) {
      __typename
      address
      transaction {
        block { height hash }
        ... on RegularTransaction {
          identifiers
          transactionResult { status }
        }
      }
    }
  }
`;

const run = async (): Promise<void> => {
  const snapshot = parseSnapshot(JSON.parse(await readFile(snapshotPath, "utf8")));
  await Promise.all(snapshot.transactions.map(async (expected) => {
    const data = await graphQl<{ readonly transactions: readonly IndexedTransaction[] }>(
      transactionQuery,
      { offset: { identifier: expected.identifier } },
    );
    const transaction = data.transactions.find((candidate) =>
      candidate.identifiers?.includes(expected.identifier),
    );
    assert(transaction !== undefined, `Indexer cannot find ${expected.circuit} identifier`);
    assert(transaction.transactionResult?.status === expected.status,
      `${expected.circuit} is not successful`);
    assert(transaction.hash === expected.transactionHash, `${expected.circuit} transaction hash changed`);
    assert(transaction.block.height === expected.blockHeight, `${expected.circuit} block height changed`);
    assert(transaction.block.hash === expected.blockHash, `${expected.circuit} block hash changed`);
  }));

  const contractData = await graphQl<{
    readonly contractAction: {
      readonly __typename: string;
      readonly address: string;
      readonly transaction: IndexedTransaction;
    } | null;
  }>(contractQuery, { address: snapshot.contractAddress });
  assert(contractData.contractAction !== null, "Indexer cannot find the deployed VulnSeal contract");
  const lifecycleTip = snapshot.transactions.at(-1);
  assert(lifecycleTip !== undefined, "Verification snapshot has no lifecycle tip");
  assert(contractData.contractAction.address === snapshot.contractAddress, "Indexer returned another contract");
  assert(contractData.contractAction.transaction.transactionResult?.status === "SUCCESS",
    "Latest contract action is not successful");
  assert(contractData.contractAction.transaction.identifiers?.includes(lifecycleTip.identifier),
    "Latest contract action is not the recorded payout authorization");
  assert(contractData.contractAction.transaction.block.height === lifecycleTip.blockHeight,
    "Latest contract action block does not match the lifecycle tip");

  const finalizedHeadHash = await rpc<string>("chain_getFinalizedHead", []);
  const finalizedHeader = await rpc<{ readonly number: string }>("chain_getHeader", [finalizedHeadHash]);
  const finalizedHeadHeight = Number.parseInt(finalizedHeader.number.replace(/^0x/u, ""), 16);
  assert(Number.isSafeInteger(finalizedHeadHeight), "RPC returned an invalid finalized height");
  assert(finalizedHeadHeight >= lifecycleTip.blockHeight, "Lifecycle tip is above the finalized head");

  process.stdout.write(`${JSON.stringify({
    verifiedAt: new Date().toISOString(),
    network: "preprod",
    contractAddress: snapshot.contractAddress,
    verifiedTransactions: snapshot.transactions.length,
    allTransactionsSuccessful: true,
    finalCircuit: lifecycleTip.circuit,
    finalBlockHeight: lifecycleTip.blockHeight,
    finalizedHeadHeight,
    lifecycleFinalized: true,
  }, null, 2)}\n`);
};

await run();
