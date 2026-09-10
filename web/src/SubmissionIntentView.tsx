// SPDX-License-Identifier: Apache-2.0
import type { SubmissionAttempt } from "./role-recovery.js";

/** Local metadata is deliberately separate from public transaction observations. */
export function SubmissionIntentView({ entry, includePrivateNotes = false }: { readonly entry: SubmissionAttempt; readonly includePrivateNotes?: boolean }) {
  return <><p>{entry.intent
    ? <>Recorded intent: {entry.intent.circuit}{entry.intent.reportId ? <> · report {entry.intent.reportId}</> : " · program deployment"}. This is local backup metadata, not verified transaction contents.</>
    : "Operation and report were not recorded in this older journal entry."}</p>
    {includePrivateNotes && entry.intent?.circuit === "constructor" && (entry.deployment ? <details><summary>Deployment inputs saved with this attempt</summary><p>Selected program digests and windows, recorded before the wallet call. These are local intent, not verified transaction contents or deployed policy.</p><dl>{Object.entries(entry.deployment).map(([name, value]) => <div className="public-value" key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></details> : <p>Deployment inputs were not recorded for this older attempt.</p>)}
    {includePrivateNotes && entry.intent?.circuit === "submitRetest" && <p>{entry.retestPassed == null ? "Pass/fail choice was not recorded for this attempt." : `Saved retest choice: ${entry.retestPassed ? "Pass" : "Fail"}. This is local intent, not a verified outcome.`}</p>}
    {includePrivateNotes && entry.intent?.circuit === "submitRetest" && <p className="public-value">{entry.retestPatchCommitment ? `Saved selected patch: ${entry.retestPatchCommitment}` : "Selected patch was not recorded for this attempt."}</p>}
    {entry.finalization && <p>Saved SDK finalization: block {entry.finalization.blockHeight}, recorded {entry.finalization.recordedAt}. This is a local backup claim; use a public check to verify the transaction again. It does not authorize retry or prove a payment.</p>}
    {includePrivateNotes && (entry.notes ? <details><summary>Private notes saved with this attempt</summary><p>Selected tier: {entry.notes.tier}. Saved working context; this does not prove which arguments were submitted.</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.notes.text || "No working note was entered."}</p></details> : <p>No private notes were recorded with this attempt.</p>)}
  </>;
}
