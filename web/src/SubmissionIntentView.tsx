// SPDX-License-Identifier: Apache-2.0
import type { SubmissionAttempt } from "./role-recovery.js";

/** Local metadata is deliberately separate from public transaction observations. */
export function SubmissionIntentView({ entry }: { readonly entry: SubmissionAttempt }) {
  return <><p>{entry.intent
    ? <>Recorded intent: {entry.intent.circuit}{entry.intent.reportId ? <> · report {entry.intent.reportId}</> : " · program deployment"}. This is local backup metadata, not verified transaction contents.</>
    : "Operation and report were not recorded in this older journal entry."}</p>
    {entry.finalization && <p>Saved SDK finalization: block {entry.finalization.blockHeight}, recorded {entry.finalization.recordedAt}. This is a local backup claim; use a public check to verify the transaction again. It does not authorize retry or prove a payment.</p>}
  </>;
}
