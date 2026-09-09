// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { replayReportTransaction } from "../replay-report-transaction.js";

const root = new URL("../../../docs/evidence/", import.meta.url);
const raw = JSON.parse(await readFile(new URL("preprod-raw-transactions.json", root), "utf8")) as { contractAddress: string; transactions: { raw: string; expected: { identifier: string; transactionHash: string; circuit: string } }[] };
const fixture = JSON.parse(await readFile(new URL("preprod-transcript-replay.json", root), "utf8")) as { states: { state: string; transaction: { transactionResult: { status: string; segments: null } } }[] };
const input = (index: number) => ({ ...raw.transactions[index]!.expected, raw: raw.transactions[index]!.raw, contractAddress: raw.contractAddress, beforeState: fixture.states[index - 1]!.state, afterState: fixture.states[index]!.state, ...fixture.states[index]!.transaction.transactionResult });

it("replays all six historical calls through the SDK VM and identifies the report transitions", () => {
  const transitions = [[null, 0], [0, 1], [1, 2], [2, 4], [4, 5], [5, 7]];
  for (let index = 1; index <= 6; index++) {
    const result = replayReportTransaction(input(index));
    expect(result.changedReports).toHaveLength(1);
    const changed = result.changedReports[0]!;
    expect(changed.reportId).toBe("9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db");
    expect([changed.before?.status ?? null, changed.after?.status]).toEqual(transitions[index - 1]);
    expect(Buffer.from(changed.after!.commitment).toString("hex")).toBe(changed.reportId);
    if (changed.before) expect(changed.after!.updatedSequence).toBeGreaterThan(changed.before.updatedSequence);
  }
});
it("refuses unrelated pre/post states, wrong subject/circuit and unsuccessful or ambiguous segment results", () => {
  const value = input(6);
  expect(() => replayReportTransaction({ ...value, beforeState: fixture.states[0]!.state })).toThrow();
  expect(() => replayReportTransaction({ ...value, afterState: value.beforeState })).toThrow("does not match");
  expect(() => replayReportTransaction({ ...value, contractAddress: "ff".repeat(32) })).toThrow("contract or circuit mismatch");
  expect(() => replayReportTransaction({ ...value, circuit: "closeReport" })).toThrow("contract or circuit mismatch");
  for (const status of ["FAILURE", "PARTIAL_SUCCESS", "UNKNOWN"]) expect(() => replayReportTransaction({ ...value, status })).toThrow("successful transaction");
  const segment = replayReportTransaction(value).segment;
  for (const segments of [[], [{ id: segment, success: false }], [{ id: segment, success: true }, { id: segment, success: true }]]) {
    expect(() => replayReportTransaction({ ...value, segments })).toThrow("segment evidence");
  }
  expect(replayReportTransaction({ ...value, segments: [{ id: segment, success: true }] }).changedReports).toHaveLength(1);
});
