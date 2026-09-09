// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import type { ReportNotes } from "./role-recovery.js";
import type { ReplayedPublicValues } from "./report-reconciliation.js";
import { savedRetestCommitment } from "./retest-comparison.js";

export function SavedRetestCheck({ reportId, notes, passed, values }: { reportId: string; notes?: ReportNotes | null | undefined; passed?: boolean | null | undefined; values?: ReplayedPublicValues | undefined }) {
  const [result, setResult] = useState<{ mismatches: string[]; error?: string }>();
  const available = !!notes && typeof passed === "boolean" && !!values;
  useEffect(() => {
    let active = true; setResult(undefined);
    if (!notes || typeof passed !== "boolean" || !values) return;
    void (async () => {
      if (notes.reportId !== reportId) throw new Error("Saved retest notes refer to a different report.");
      if (!values.patchCommitment || !values.retestCommitment || !/^[a-f0-9]{64}$/.test(values.retestCommitment) || typeof values.retestPassed !== "boolean") throw new Error("No valid replayed retest evidence is available for comparison.");
      const expected = await savedRetestCommitment(reportId, values.patchCommitment, notes.text, passed);
      const mismatches = [];
      if (passed !== values.retestPassed) mismatches.push("Pass/Fail choice");
      if (expected !== values.retestCommitment) mismatches.push("retest commitment");
      if (active) setResult({ mismatches });
    })().catch((error) => { if (active) setResult({ mismatches: [], error: error instanceof Error ? error.message : "Saved retest comparison failed" }); });
    return () => { active = false; };
  }, [reportId, notes, passed, values]);
  if (!available) return <p>No saved retest comparison is available: both attempt notes and an explicit Pass/Fail choice are required. Older choices are not inferred from chain state.</p>;
  if (!result) return <p role="status">Comparing this attempt's saved retest locally…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return <div>{result.mismatches.length ? <p role="alert">Saved retest differs from the replayed report: {result.mismatches.join(", ")}. Investigate before taking further action; do not resubmit automatically.</p> : <p>Saved retest matches the replayed report: Pass/Fail choice and retest commitment.</p>}
    <p>This uses the replayed patch commitment with the saved note snapshot and choice. It does not establish which patch the user originally intended, authenticate backup or chain data, verify all arguments, or make retry safe. Private notes remain on this device.</p>
  </div>;
}
