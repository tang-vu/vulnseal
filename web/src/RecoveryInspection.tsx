// SPDX-License-Identifier: Apache-2.0
import type { VulnerabilityReport } from "@vulnseal/shared";
import { AttachmentReview } from "./AttachmentFields.js";
import { useEffect, useRef, useState } from "react";
import { decryptRecovery, MAX_RECOVERY_BYTES, type RecoverySnapshot } from "./recovery.js";
import { readStoredRecovery } from "./recovery-storage.js";
import { continuationDeadline } from "./midnight/continuation-deadline.js";
import { ReportTransactionJournal } from "./ReportTransactionJournal.js";

/** Read-only local inspection deliberately has no provider or session-install callback. */
export function RecoveryInspection({ selectedCopy }: { selectedCopy: string }) {
  const [password, setPassword] = useState(""), [file, setFile] = useState<File>();
  const [inspection, setInspection] = useState<{ snapshot: RecoverySnapshot; report?: VulnerabilityReport | undefined; prepared?: VulnerabilityReport | undefined }>();
  const snapshot = inspection?.snapshot;
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const generation = useRef(0), busy = useRef(false), input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; }, []);
  const clear = () => {
    generation.current++; busy.current = false; setWorking(false);
    setInspection(undefined); setPassword(""); setFile(undefined); setError("");
    if (input.current) input.current.value = "";
  };
  const inspect = async (browserCopy: boolean) => {
    if (busy.current) return;
    const current = ++generation.current;
    busy.current = true; setWorking(true); setError(""); setInspection(undefined);
    try {
      const restored = await continuationDeadline(180_000, "Backup inspection timed out. Retry explicitly when ready.", async check => {
        const active = () => { check(); if (generation.current !== current) throw new Error("Inspection closed"); };
        active();
        if (!browserCopy && !file) throw new Error("Choose a backup to inspect");
        if (file && !browserCopy && file.size > MAX_RECOVERY_BYTES) throw new Error("Recovery file is too large");
        const serialized = browserCopy ? (await readStoredRecovery(selectedCopy)).encrypted : await file!.text();
        active();
        const result = await decryptRecovery(serialized, password);
        active(); return { snapshot: result.snapshot, report: result.sealed ? JSON.parse(result.sealed.canonicalReport) as VulnerabilityReport : undefined, prepared: result.pendingSeal ? JSON.parse(result.pendingSeal.canonicalReport) as VulnerabilityReport : undefined };
      });
      if (generation.current !== current) return;
      setInspection(restored); setPassword("");
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : "Backup inspection failed");
    } finally {
      if (generation.current === current) { busy.current = false; setWorking(false); }
    }
  };
  return <section className="form-panel" aria-label="Offline backup inspection">
    <h2>Inspect a backup offline</h2>
    <p>Read a file or the selected browser copy without connecting Lace or replacing this session. Saved status and journal entries are historical observations, not current ledger verification or permission to retry a transaction.</p>
    <label>Backup to inspect<input ref={input} type="file" accept=".json,application/json" disabled={working} onChange={event => { setFile(event.target.files?.[0]); setInspection(undefined); setError(""); }} /></label>
    <label>Inspection password<input type="password" autoComplete="current-password" value={password} disabled={working} onChange={event => setPassword(event.target.value)} /></label>
    <button type="button" className="secondary-button" disabled={working || !file || !password} onClick={() => void inspect(false)}>Inspect encrypted file</button>
    <button type="button" className="secondary-button" disabled={working || !selectedCopy || !password} onClick={() => void inspect(true)}>Inspect selected browser copy</button>
    <button type="button" className="secondary-button" onClick={clear}>Clear inspected backup</button>
    {working && <p role="status">Decrypting backup locally.</p>}
    {error && <p role="alert">{error}</p>}
    {snapshot && <div>
      <p role="status">Backup inspected locally. This session has not been replaced. Clear the inspected backup when finished; navigating between screens keeps it in this tab.</p>
      <dl><dt>Saved network</dt><dd>{snapshot.network}</dd><dt>Contract address</dt><dd className="public-value">{snapshot.contractAddress || "No address saved"}</dd><dt>Saved report status</dt><dd>{snapshot.status}</dd><dt>Report identifier</dt><dd className="public-value">{snapshot.report?.id || snapshot.pendingReport?.report.id || "No report identifier saved"}</dd></dl>
      {snapshot.deploymentAttempt && <p>Deployment outcome is unresolved.</p>}
      {snapshot.deploymentTransactionId && <p className="public-value">Deployment transaction: {snapshot.deploymentTransactionId}</p>}
      {snapshot.pendingReport && <p>Prepared report: {snapshot.pendingReport.submissionStarted ? "submission may have started" : "no submission start recorded; this copy may predate a later attempt"}.</p>}
      {snapshot.uncertainTransition && <p>Unresolved action: {snapshot.uncertainTransition}</p>}
      {inspection.report && <InspectedReport report={inspection.report} label="Read sealed report from backup" />}
      {inspection.prepared && <InspectedReport report={inspection.prepared} label="Read prepared report from backup" />}
      <details><summary>Saved private draft and notes</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify({ draft: snapshot.draft, rationale: snapshot.rationale, patchReference: snapshot.patchReference, retestNotes: snapshot.retestNotes, attachmentDraft: snapshot.attachmentDraft }, null, 2)}</pre></details>
      <ReportTransactionJournal key={`${snapshot.programId}:${snapshot.reportAttempts?.length}`} attempts={snapshot.reportAttempts ?? []} network={snapshot.network} contractAddress={snapshot.contractAddress ?? ""} allowLookup={false} />
    </div>}
  </section>;
}

function InspectedReport({ report, label }: { report: VulnerabilityReport; label: string }) {
  return <details className="received-disclosure"><summary>{label}</summary>
    <p>This is the report decrypted from the saved envelope and checked against its saved commitment. It can differ from the editable draft. No current ledger state has been checked.</p>
    <h3>{report.title}</h3><p>{report.affectedAsset} / {report.weakness}</p>
    <h4>Summary</h4><p className="policy-text">{report.summary}</p>
    <h4>Impact</h4><p className="policy-text">{report.impact}</p>
    <h4>Reproduction</h4><ol>{report.reproductionSteps.map((step, index) => <li className="policy-text" key={index}>{step}</li>)}</ol>
    <h4>Suggested remediation</h4><p className="policy-text">{report.suggestedRemediation || "Not provided"}</p>
    <h4>Researcher contact</h4><p>{report.researcherContact || "Not provided"}</p>
    <AttachmentReview attachments={report.attachments} />
  </details>;
}
