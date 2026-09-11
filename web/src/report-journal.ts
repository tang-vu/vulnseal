// SPDX-License-Identifier: Apache-2.0
import { utf8, type ReportStatusName } from "@vulnseal/shared";
import type { RecoverySnapshot, UncertainCircuit } from "./recovery.js";
export type ReportAttempt = {
  readonly circuit: UncertainCircuit | "submitReport";
  readonly reportId: string;
  readonly startedAt: string;
  readonly transactionId?: string;
  readonly request: { readonly nextStatus: ReportStatusName; readonly severity: number; readonly rationale: string; readonly patchReference: string; readonly retestNotes: string };
  readonly outcome: "unknown" | "sdk-confirmed";
};
const circuits = ["submitReport", "beginTriage", "acceptReport", "rejectReport", "anchorPatch", "submitRetest", "authorizePayout", "closeReport"];
export const validTransactionIdentifier = (value: unknown): value is string => typeof value === "string" && /^(?:[a-f0-9]{64}|[a-f0-9]{66})$/.test(value);
export function validateReportJournal(value: unknown, snapshot: RecoverySnapshot): readonly ReportAttempt[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000 || snapshot.mode !== "midnight" || !snapshot.contractAddress) throw new Error("Invalid report transaction journal");
  const identifiers = new Set<string>();
  return value.map((entry: ReportAttempt, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join() !== (entry.transactionId === undefined ? "circuit,outcome,reportId,request,startedAt" : "circuit,outcome,reportId,request,startedAt,transactionId")) throw new Error("Invalid report journal fields");
    if (!circuits.includes(entry.circuit) || typeof entry.reportId !== "string" || !/^[a-f0-9]{64}$/.test(entry.reportId) || typeof entry.startedAt !== "string" || !Number.isFinite(Date.parse(entry.startedAt)) || new Date(entry.startedAt).toISOString() !== entry.startedAt || !["unknown", "sdk-confirmed"].includes(entry.outcome)) throw new Error("Invalid report journal intent");
    const request = entry.request;
    const statuses: Record<string, readonly string[]> = { submitReport: ["COMMITTED"], beginTriage: ["TRIAGED"], acceptReport: ["ACCEPTED"], rejectReport: ["REJECTED"], anchorPatch: ["PATCH_READY"], submitRetest: ["RETEST_PASSED", "RETEST_FAILED"], authorizePayout: ["PAYOUT_AUTHORIZED"], closeReport: ["CLOSED"] };
    if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).sort().join() !== "nextStatus,patchReference,rationale,retestNotes,severity" || !statuses[entry.circuit]!.includes(request.nextStatus) || !Number.isInteger(request.severity) || request.severity < 1 || request.severity > 4 || [request.rationale, request.patchReference, request.retestNotes].some(text => typeof text !== "string" || utf8(text).length > 64 * 1024)) throw new Error("Invalid saved report request");
    if (entry.transactionId !== undefined) {
      if (!validTransactionIdentifier(entry.transactionId) || identifiers.has(entry.transactionId)) throw new Error("Invalid or duplicate report transaction identifier");
      identifiers.add(entry.transactionId);
    }
    if (entry.outcome === "sdk-confirmed" && !entry.transactionId) throw new Error("Confirmed report attempt requires its transaction identifier");
    if (entry.outcome === "unknown") {
      if (index !== value.length - 1) throw new Error("An unresolved report attempt must be last");
      if (entry.circuit === "submitReport") {
        if (!snapshot.pendingReport?.submissionStarted || snapshot.pendingReport.report.id !== entry.reportId) throw new Error("Report submission journal does not match pending recovery material");
      } else if (snapshot.report?.id !== entry.reportId || snapshot.uncertainTransition !== entry.circuit) throw new Error("Report journal does not match the uncertain transition");
    }
    return { ...entry, request: { ...request } };
  });
}
