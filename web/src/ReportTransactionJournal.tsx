// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type { ReportAttempt } from "./report-journal.js";
import { TransactionCheck } from "./TransactionCheck.js";
export function ReportTransactionJournal({ attempts, network, contractAddress, allowLookup = true }: { allowLookup?: boolean; attempts: readonly ReportAttempt[]; network: string; contractAddress: string }) {
  const [selected, setSelected] = useState("");
  const index = selected === "" ? attempts.length - 1 : Number(selected), attempt = attempts[index];
  if (!attempt) return null;
  return <section className="form-panel" aria-label="Report transaction journal">
    <h2>Report transaction journal</h2>
    <p>These encrypted recovery records retain each requested action. SDK confirmation is a local observation; restoring a record does not authenticate finality or authorize another submission.</p>
    <label>Saved report attempt<select value={index} onChange={event => setSelected(event.target.value)}>{attempts.map((entry, position) => <option key={position} value={position}>{position + 1}. {entry.circuit} · {entry.startedAt} · {entry.outcome}</option>)}</select></label>
    <p className="public-value">Report: {attempt.reportId}</p>
    <p>Requested state: {attempt.request.nextStatus} · severity tier {attempt.request.severity}</p>
    <details><summary>Private inputs saved with this attempt</summary><dl><dt>Decision rationale</dt><dd>{attempt.request.rationale || "None"}</dd><dt>Patch reference</dt><dd>{attempt.request.patchReference || "None"}</dd><dt>Retest notes</dt><dd>{attempt.request.retestNotes || "None"}</dd></dl></details>
    {attempt.transactionId ? <><p className="public-value">Transaction: {attempt.transactionId}</p>{allowLookup && <TransactionCheck key={attempt.transactionId} network={network} transactionId={attempt.transactionId} contractAddress={contractAddress} circuit={attempt.circuit} />}</> : <p>No identifier was saved for this attempt. This does not prove that no transaction was sent.</p>}
    <p>Unknown attempts remain blocked after restore. Keep an independent file backup; a status lookup does not make retry safe.</p>
  </section>;
}
