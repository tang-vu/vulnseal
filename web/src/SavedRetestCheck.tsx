// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import type { ReportNotes } from "./role-recovery.js";
import type { ReplayedPublicValues } from "./report-reconciliation.js";
import { savedRetestCommitment } from "./retest-comparison.js";

export function SavedRetestCheck({ reportId, notes, passed, patch, values }: { reportId: string; notes?: ReportNotes | null | undefined; passed?: boolean | null | undefined; patch?: string | null | undefined; values?: ReplayedPublicValues | undefined }) {
  const [result, setResult] = useState<{ mismatches: string[]; error?: string }>();
  const available = !!notes && typeof passed === "boolean" && !!values;
  useEffect(() => {
    let active = true; setResult(undefined);
    if (!notes || typeof passed !== "boolean" || !values) return;
    void (async () => {
      if (notes.reportId !== reportId) throw new Error("Saved retest notes refer to a different report.");
      if (!values.patchCommitment || !values.retestCommitment || !/^[a-f0-9]{64}$/.test(values.retestCommitment) || typeof values.retestPassed !== "boolean") throw new Error("No valid replayed retest evidence is available for comparison.");
      const expected = await savedRetestCommitment(reportId, patch ?? values.patchCommitment, notes.text, passed);
      const mismatches = [];
      if (patch != null && patch !== values.patchCommitment) mismatches.push("selected patch");
      if (passed !== values.retestPassed) mismatches.push("Pass/Fail choice");
      if (expected !== values.retestCommitment) mismatches.push("retest commitment");
      if (active) setResult({ mismatches });
    })().catch((error) => { if (active) setResult({ mismatches: [], error: error instanceof Error ? error.message : "Saved retest comparison failed" }); });
    return () => { active = false; };
  }, [reportId, notes, passed, patch, values]);
  if (!available) return <p>No saved retest comparison is available: both attempt notes and an explicit Pass/Fail choice are required. Older choices are not inferred from chain state.</p>;
  if (!result) return <p role="status">Comparing this attempt's saved retest locally…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return <div>{result.mismatches.length ? <p role="alert">Saved retest differs from the replayed report: {result.mismatches.join(", ")}. Investigate before taking further action; do not resubmit automatically.</p> : <p>Saved retest matches the replayed report: Pass/Fail choice and retest commitment.</p>}
    <p>{patch == null ? "The intended patch was not saved in this older entry; this partial comparison uses the replayed patch." : "The saved selected patch was also compared; commitment calculation uses that saved patch, not the observed replacement."} This does not authenticate backup or chain data, verify all arguments, or make retry safe. Private notes remain on this device.</p>
  </div>;
}
