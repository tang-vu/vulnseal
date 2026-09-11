// SPDX-License-Identifier: Apache-2.0
import type { TransactionEvidence } from "@vulnseal/api/types";
import type { ReportStatusName } from "@vulnseal/shared";
import type { RecoverySnapshot } from "./recovery.js";
import { reportJournalBlockReason, validTransactionIdentifier, type ReportAttempt } from "./report-journal.js";
import type { RecoveryPersistenceLease } from "./RecoveryAutosavePanel.js";
import { submissionWait } from "./submission-wait.js";
import { continuationDeadline } from "./midnight/continuation-deadline.js";

export async function journalReportTransaction(options: {
  snapshot: RecoverySnapshot; circuit: ReportAttempt["circuit"]; reportId: string; nextStatus: ReportStatusName;
  lease: RecoveryPersistenceLease; wait: ReturnType<typeof submissionWait>;
  prepare: () => Promise<unknown>; submit: () => Promise<TransactionEvidence>;
  installCheckpoint: (checkpoint: (id: string) => Promise<void>) => void;
  onAttempts: (attempts: readonly ReportAttempt[]) => void; onWarning: (message: string) => void; assertCurrent: () => void;
}): Promise<TransactionEvidence> {
  const { lease, wait, assertCurrent } = options;
  const base = structuredClone(options.snapshot);
  const previous = base.reportAttempts ?? [];
  const blocked = reportJournalBlockReason(previous);
  if (blocked) { lease.release(); throw new Error(blocked); }
  let attempt: ReportAttempt = { circuit: options.circuit, reportId: options.reportId, startedAt: new Date().toISOString(), request: { nextStatus: options.nextStatus, severity: base.severity, rationale: base.rationale, patchReference: base.patchReference, retestNotes: base.retestNotes }, outcome: "unknown" };
  const snapshot = (): RecoverySnapshot => ({ ...base, version: 8, reportAttempts: [...previous, attempt] });
  let checkpointStarted = false;
  const check = () => { wait.assertActive(); assertCurrent(); };
  options.installCheckpoint(async id => {
    check();
    if (checkpointStarted || !validTransactionIdentifier(id)) throw new Error("Invalid or duplicate report checkpoint; broadcast is blocked");
    checkpointStarted = true;
    attempt = { ...attempt, transactionId: id }; options.onAttempts([...previous, attempt]);
    await lease.save(snapshot()); check(); wait.checkpoint(id);
  });
  options.onAttempts([...previous, attempt]);
  try {
    const evidence = await wait.run(async () => {
      check(); await lease.save(snapshot()); check();
      await options.prepare(); check();
      const result = await options.submit(); check();
      if (!wait.transactionId || result.txId !== wait.transactionId || result.circuit !== options.circuit) throw new Error("SDK result does not match the durable report checkpoint; investigate the saved identifier");
      return result;
    });
    assertCurrent();
    attempt = { ...attempt, outcome: "sdk-confirmed" };
    const pending = base.pendingReport;
    const confirmed: RecoverySnapshot = {
      ...snapshot(), uncertainTransition: null, pendingReport: null,
      report: options.circuit === "submitReport" ? pending!.report : base.report,
      status: options.nextStatus, history: [...base.history, options.nextStatus],
    };
    try {
      await continuationDeadline(60_000, "Saving the confirmed report result timed out", async checkSave => { assertCurrent(); checkSave(); await lease.save(confirmed); assertCurrent(); checkSave(); });
    } catch (cause) {
      lease.stop(); assertCurrent();
      options.onWarning(`The report transaction returned matching SDK confirmation, but its recovery update was not confirmed. Keep this tab and download a fresh encrypted backup. A late save may have committed. ${cause instanceof Error ? cause.message : "Storage error"}`);
    }
    assertCurrent(); options.onAttempts([...previous, attempt]);
    lease.release();
    return evidence;
  } catch (cause) { lease.stop(); throw cause; }
}
