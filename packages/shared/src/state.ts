// SPDX-License-Identifier: Apache-2.0
import { REPORT_STATUS, type ReportStatusName } from "./types.js";

export const contractStatusName = (value: number | bigint): ReportStatusName => {
  const numeric = Number(value);
  const name = REPORT_STATUS[numeric];
  if (name === undefined) throw new Error(`Unknown contract report status: ${numeric}`);
  return name;
};

export const publicStatusLabel: Record<ReportStatusName, string> = {
  COMMITTED: "Sealed",
  TRIAGED: "In triage",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  PATCH_READY: "Patch ready",
  RETEST_PASSED: "Retest passed",
  RETEST_FAILED: "Retest failed",
  PAYOUT_AUTHORIZED: "Payout authorized",
  CLOSED: "Closed",
};
