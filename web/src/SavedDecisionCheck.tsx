// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { bytesToHex, sha256, utf8 } from "@vulnseal/shared";
import type { ReportNotes } from "./role-recovery.js";
import type { ReplayedPublicValues } from "./report-reconciliation.js";

export function SavedDecisionCheck({ circuit, reportId, notes, values }: { circuit: string; reportId: string; notes?: ReportNotes | null | undefined; values?: ReplayedPublicValues | undefined }) {
  const [comparison, setComparison] = useState<{ mismatches: string[]; checked: string[]; error?: string }>();
  const supported = ["acceptReport", "rejectReport", "authorizePayout"].includes(circuit);
  useEffect(() => {
    let active = true; setComparison(undefined);
    if (!supported || !notes || !values) return;
    void (async () => {
      if (notes.reportId !== reportId) throw new Error("Saved notes refer to a different report; no decision comparison was made.");
      const checked: string[] = [], mismatches: string[] = [];
      const compare = (label: string, expected: string, observed: string) => { checked.push(label); if (expected !== observed) mismatches.push(label); };
      if (circuit !== "authorizePayout") compare("decision text digest", bytesToHex(await sha256(utf8(notes.text))), values.decisionDigest);
      if (circuit === "acceptReport") compare("severity tier", notes.tier, values.severity);
      if (circuit === "authorizePayout") compare("reward tier", notes.tier, values.rewardTier);
      if (active) setComparison({ checked, mismatches });
    })().catch((error) => { if (active) setComparison({ checked: [], mismatches: [], error: error instanceof Error ? error.message : "Saved decision comparison failed" }); });
    return () => { active = false; };
  }, [circuit, reportId, notes, values, supported]);
  if (!supported) return <p>Saved argument comparison is not implemented for this operation.</p>;
  if (!notes || !values) return <p>No saved decision comparison is available for this journal entry.</p>;
  if (!comparison) return <p role="status">Comparing this attempt's saved decision locally…</p>;
  if (comparison.error) return <p role="alert">{comparison.error}</p>;
  return <div>
    {comparison.mismatches.length ? <p role="alert">Saved decision differs from the replayed report: {comparison.mismatches.join(", ")}. Investigate this discrepancy; do not resubmit automatically.</p> : <p>Saved decision matches the replayed report: {comparison.checked.join(", ")}.</p>}
    <p>This compares the note snapshot saved with this attempt, not later edits. Notes stay on this device. A match does not authenticate the backup or chain data, verify every argument, prove a transfer, or make retry safe.</p>
  </div>;
}
