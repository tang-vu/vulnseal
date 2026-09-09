// SPDX-License-Identifier: Apache-2.0
import type { TransactionEvidence } from "@vulnseal/api/types";
import type { ReportStatusName } from "@vulnseal/shared";

export type WorkflowEvent = {
  readonly status: ReportStatusName;
  readonly evidence?: TransactionEvidence;
  readonly source?: "recovered" | "ledger";
};

export const workflowTimeline = (events: readonly WorkflowEvent[]) => {
  const upcoming: ReportStatusName[] = ["COMMITTED", "TRIAGED", "ACCEPTED", "PATCH_READY", "RETEST_PASSED", "PAYOUT_AUTHORIZED"];
  const last = events.at(-1)?.status;
  const next = last === "RETEST_FAILED" ? 3 : last === undefined ? 0 : upcoming.indexOf(last) + 1;
  const remaining = last === "REJECTED" || last === "CLOSED" ? [] : upcoming.slice(next);
  return [
    ...events.map((event, index) => ({ entry: event.status, complete: true, current: index === events.length - 1, evidence: event.evidence, source: event.source })),
    ...remaining.map((entry) => ({ entry, complete: false, current: false, evidence: undefined, source: undefined })),
  ];
};

export type WorkflowTimeline = ReturnType<typeof workflowTimeline>;

export const workflowStatement: Record<ReportStatusName, string> = {
  COMMITTED: "A sealed report commitment is recorded. Vendor review has not started.",
  TRIAGED: "The report is in triage. Acceptance and remediation are still pending.",
  ACCEPTED: "The vendor accepted the report. No patch or passing retest is recorded yet.",
  REJECTED: "The vendor rejected the report. No successful resolution or payout authorization is claimed.",
  PATCH_READY: "A patch commitment is recorded. A passing retest is still required before payout authorization.",
  RETEST_FAILED: "The researcher reported a failed retest. A new patch and passing retest are required.",
  RETEST_PASSED: "The researcher reported a passing retest. Payout authorization is still pending.",
  PAYOUT_AUTHORIZED: "The report reached payout authorization after acceptance, a patch, and a passing retest, without exposing the exploit. No funds transfer is claimed.",
  CLOSED: "The vendor closed the report. Closure alone does not imply a passing retest or payout authorization; inspect the recorded steps below.",
};
