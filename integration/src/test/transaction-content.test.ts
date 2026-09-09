// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { inspectTransactionContent } from "../transaction-content.js";

const fixture = JSON.parse(await readFile(new URL("../../../docs/evidence/preprod-raw-transactions.json", import.meta.url), "utf8")) as { transactions: { expected: { identifier: string; transactionHash: string }; raw: string; content: ReturnType<typeof inspectTransactionContent> }[] };
it("decodes all seven captured contract lifecycle transactions and reproduces their hash-bound call projections", () => {
  expect(fixture.transactions).toHaveLength(7);
  for (const tx of fixture.transactions) {
    expect(inspectTransactionContent(tx.raw, tx.expected.identifier, tx.expected.transactionHash)).toEqual(tx.content);
  }
});
it("rejects unrelated identifiers, hashes, changed bytes and excessive or malformed input", () => {
  const tx = fixture.transactions.at(-1)!;
  expect(() => inspectTransactionContent(tx.raw, "ff".repeat(33), tx.expected.transactionHash)).toThrow("does not match");
  expect(() => inspectTransactionContent(tx.raw, tx.expected.identifier, "ff".repeat(32))).toThrow("does not match");
  const changed = tx.raw.slice(0, -2) + (tx.raw.endsWith("00") ? "01" : "00");
  expect(() => inspectTransactionContent(changed, tx.expected.identifier, tx.expected.transactionHash)).toThrow();
  for (const raw of ["", "0x1", "zz", "00".repeat(2 * 1024 * 1024 + 1)]) {
    expect(() => inspectTransactionContent(raw, tx.expected.identifier, tx.expected.transactionHash)).toThrow("raw transaction");
  }
});
