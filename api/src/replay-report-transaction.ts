// SPDX-License-Identifier: Apache-2.0
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import { ContractCall, ContractState, CostModel, QueryContext, Transaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { StateValue, ChargedState } from "@midnight-ntwrk/midnight-js-protocol/onchain-runtime";
import { ledger, type ReportRecord } from "@vulnseal/contract";
import { inspectTransactionContent } from "./transaction-content.js";

const equalBytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((value, index) => value === right[index]);
const equalReport = (left: ReportRecord | undefined, right: ReportRecord | undefined) => {
  if (!left || !right) return left === right;
  const keys = Object.keys(left) as (keyof ReportRecord)[];
  return keys.length === Object.keys(right).length && keys.every((key) => {
    const a = left[key], b = right[key];
    return a instanceof Uint8Array && b instanceof Uint8Array ? equalBytes(a, b) : a === b;
  });
};
const decodeState = (raw: string) => {
  if (typeof raw !== "string" || raw.length > 8 * 1024 * 1024 || !/^(?:0x)?(?:[a-f0-9]{2})+$/i.test(raw)) throw new Error("Invalid historical contract state");
  return ContractState.deserialize(hexToBytes(raw));
};
const reports = (state: ReturnType<typeof decodeState>["data"]) => {
  // Ledger and onchain-runtime own different WASM classes; cross via encoded data.
  const decoded = ledger(new ChargedState(StateValue.decode(state.state.encode())));
  return { programId: bytesToHex(decoded.programId), reports: new Map([...decoded.reports].map(([id, record]) => [bytesToHex(id), record])) };
};

/** Replay a single successful call against supplied historical state, using the SDK VM.
 * The caller must establish the provenance of states and success metadata separately. */
export function replayReportTransaction(input: {
  raw: string; identifier: string; transactionHash: string; contractAddress: string; circuit: string;
  beforeState: string; afterState: string; status: string; segments: readonly { id: number; success: boolean }[] | null;
}) {
  inspectTransactionContent(input.raw, input.identifier, input.transactionHash);
  if (input.status !== "SUCCESS") throw new Error("Replay requires a successful transaction result");
  const tx = Transaction.deserialize("signature", "proof", "binding", hexToBytes(input.raw));
  const actions = [...(tx.intents ?? [])].flatMap(([segment, intent]) => intent.actions.map((action) => ({ segment, action })));
  if (actions.length !== 1) throw new Error("Replay supports exactly one contract action");
  const { segment, action } = actions[0]!;
  if (!(action instanceof ContractCall) || action.address !== input.contractAddress || action.entryPoint !== input.circuit) throw new Error("Replay contract or circuit mismatch");
  // The indexer schema supplies segments for PARTIAL_SUCCESS. SUCCESS maps to
  // SucceedEntirely in the official provider and normally has null segments.
  if (input.segments !== null) {
    if (!Array.isArray(input.segments)) throw new Error("Invalid segment evidence");
    const outcomes = input.segments.filter((entry) => entry.id === segment);
    if (outcomes.length !== 1 || outcomes[0]!.success !== true) throw new Error("Replay requires unambiguous successful segment evidence");
  }
  const before = decodeState(input.beforeState), after = decodeState(input.afterState);
  let context = new QueryContext(before.data, input.contractAddress);
  if (!action.guaranteedTranscript && !action.fallibleTranscript) throw new Error("Missing call transcript");
  const costs = CostModel.initialCostModel();
  if (action.guaranteedTranscript) context = context.runTranscript(action.guaranteedTranscript, costs);
  if (action.fallibleTranscript) context = context.runTranscript(action.fallibleTranscript, costs);
  // Compare SDK-canonical serialized data by replacing only data in the same
  // post-state container. Its other fields are held fixed, not authenticated here.
  const expectedBytes = Uint8Array.from(after.serialize());
  after.data = context.state;
  if (!equalBytes(after.serialize(), expectedBytes)) throw new Error("Replayed state does not match the supplied post-transaction state");
  const previous = reports(before.data), resulting = reports(context.state);
  if (previous.programId !== resulting.programId) throw new Error("Replay changed program identity");
  const changed = [...new Set([...previous.reports.keys(), ...resulting.reports.keys()])].filter((id) => !equalReport(previous.reports.get(id), resulting.reports.get(id)));
  return { programId: resulting.programId, segment, changedReports: changed.map((reportId) => ({ reportId, before: previous.reports.get(reportId) ?? null, after: resulting.reports.get(reportId) ?? null })) };
}
