// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { workflowTimeline, type WorkflowEvent } from "./workflow.js";

describe("report-scoped workflow history", () => {
  it("does not mark an empty program as committed", () => {
    expect(workflowTimeline([]).every((event) => !event.complete)).toBe(true);
  });

  it("binds evidence to its event rather than deployment or array position", () => {
    const events: WorkflowEvent[] = [
      { status: "COMMITTED", evidence: { circuit: "submitReport", txId: "report-tx", blockHeight: "102" } },
      { status: "TRIAGED", evidence: { circuit: "beginTriage", txId: "triage-tx", blockHeight: "108" } },
      { status: "REJECTED", evidence: { circuit: "rejectReport", txId: "reject-tx", blockHeight: "110" } },
      { status: "CLOSED", evidence: { circuit: "closeReport", txId: "close-tx", blockHeight: "120" } },
    ];
    const timeline = workflowTimeline(events);
    expect(timeline.map((event) => [event.entry, event.evidence?.blockHeight])).toEqual([
      ["COMMITTED", "102"], ["TRIAGED", "108"], ["REJECTED", "110"], ["CLOSED", "120"],
    ]);
    expect(timeline.some((event) => event.entry === "RETEST_PASSED")).toBe(false);
  });

  it("preserves failed attempts when a new patch is recorded", () => {
    const statuses = ["COMMITTED", "TRIAGED", "ACCEPTED", "PATCH_READY", "RETEST_FAILED", "PATCH_READY"] as const;
    const timeline = workflowTimeline(statuses.map((status) => ({ status })));
    expect(timeline.filter((event) => event.complete).map((event) => event.entry)).toEqual(statuses);
    expect(timeline.filter((event) => !event.complete).map((event) => event.entry)).toEqual(["RETEST_PASSED", "PAYOUT_AUTHORIZED"]);
  });
});
