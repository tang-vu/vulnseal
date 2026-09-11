// SPDX-License-Identifier: Apache-2.0
import type { VulnerabilityReport } from "@vulnseal/shared";
import { AttachmentReview } from "./AttachmentFields.js";
import { useEffect, useRef, useState } from "react";
import { decryptRecovery, MAX_RECOVERY_BYTES, type RecoverySnapshot } from "./recovery.js";
import { readStoredRecovery } from "./recovery-storage.js";
import { continuationDeadline } from "./midnight/continuation-deadline.js";
import { ReportTransactionJournal } from "./ReportTransactionJournal.js";

type InspectionSource = { kind: "file"; name: string; bytes: number } | { kind: "browser"; id: string; label: string; revision: number; updatedAt: string };

/** Read-only local inspection deliberately has no provider or session-install callback. */
export function RecoveryInspection({ selectedCopy }: { selectedCopy: string }) {
  const [password, setPassword] = useState(""), [file, setFile] = useState<File>();
  const [inspection, setInspection] = useState<{ source: InspectionSource; snapshot: RecoverySnapshot; report?: VulnerabilityReport | undefined; prepared?: VulnerabilityReport | undefined }>();
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
        let serialized: string, source: InspectionSource;
        if (browserCopy) {
          const saved = await readStoredRecovery(selectedCopy);
          serialized = saved.encrypted;
          source = { kind: "browser", id: saved.id, label: saved.label, revision: saved.revision, updatedAt: saved.updatedAt };
        } else {
          serialized = await file!.text();
          source = { kind: "file", name: file!.name, bytes: file!.size };
        }
        active();
        const result = await decryptRecovery(serialized, password);
        active(); return { source, snapshot: result.snapshot, report: result.sealed ? JSON.parse(result.sealed.canonicalReport) as VulnerabilityReport : undefined, prepared: result.pendingSeal ? JSON.parse(result.pendingSeal.canonicalReport) as VulnerabilityReport : undefined };
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
      <section aria-label="Inspected backup source" className="public-value">
        <h3>Source of this inspection</h3>
        {inspection.source.kind === "file" ? <p>File: {inspection.source.name} ({inspection.source.bytes.toLocaleString()} bytes)</p> : <dl>
          <dt>Browser copy</dt><dd>{inspection.source.label}</dd><dt>Copy identifier</dt><dd>{inspection.source.id}</dd>
          <dt>Inspected revision</dt><dd>{inspection.source.revision}</dd><dt>Saved at</dt><dd>{inspection.source.updatedAt}</dd>
        </dl>}
        <p>These details identify what was opened. Changing the selection or saving a newer revision does not update this inspection; inspect again to read it. Filenames and copy metadata are not ledger evidence.</p>
      </section>
      <dl><dt>Saved network</dt><dd>{snapshot.network}</dd><dt>Contract address</dt><dd className="public-value">{snapshot.contractAddress || "No address saved"}</dd><dt>Saved report status</dt><dd>{snapshot.status}</dd><dt>Report identifier</dt><dd className="public-value">{snapshot.report?.id || snapshot.pendingReport?.report.id || "No report identifier saved"}</dd></dl>
      {snapshot.deploymentAttempt && <p>Deployment outcome is unresolved.</p>}
      {snapshot.deploymentTransactionId && <p className="public-value">Deployment transaction: {snapshot.deploymentTransactionId}</p>}
      {snapshot.pendingReport && <p>Prepared report: {snapshot.pendingReport.submissionStarted ? "submission may have started" : "no submission start recorded; this copy may predate a later attempt"}.</p>}
      {snapshot.uncertainTransition && <p>Unresolved action: {snapshot.uncertainTransition}</p>}
      {inspection.report && <InspectedReport report={inspection.report} label="Read sealed report from backup" />}
      {inspection.prepared && <InspectedReport report={inspection.prepared} label="Read prepared report from backup" />}
      <details className="received-disclosure"><summary>Saved private draft and notes</summary>
        <p>This is the editable draft saved in this backup. It may be unfinished or differ from the sealed report above.</p>
        <ReportFields report={snapshot.draft} />
        <h4>Draft attachment metadata</h4>
        {snapshot.draft.attachments.length ? snapshot.draft.attachments.map((attachment, index) => <dl key={index}>
          <dt>Filename</dt><dd>{attachment.filename}</dd><dt>Media type</dt><dd>{attachment.mediaType}</dd>
          <dt>Size in bytes</dt><dd>{attachment.size}</dd><dt>SHA-256</dt><dd>{attachment.sha256}</dd>
        </dl>) : <p>No attachments recorded in the draft.</p>}
        <h4>Saved working notes</h4><dl className="policy-text">
          <dt>Decision rationale</dt><dd>{snapshot.rationale || "Not provided"}</dd>
          <dt>Patch reference</dt><dd>{snapshot.patchReference || "Not provided"}</dd>
          <dt>Retest notes</dt><dd>{snapshot.retestNotes || "Not provided"}</dd>
        </dl>
        {snapshot.attachmentDraft && Object.values(snapshot.attachmentDraft).some(Boolean) && <>
          <h4>Unfinished attachment entry</h4><p>These saved inputs may be incomplete and have not been added to the draft attachment list.</p>
          <dl><dt>Filename</dt><dd>{snapshot.attachmentDraft.filename || "Not provided"}</dd>
          <dt>Media type</dt><dd>{snapshot.attachmentDraft.mediaType || "Not provided"}</dd>
          <dt>Size input</dt><dd>{snapshot.attachmentDraft.size || "Not provided"}</dd>
          <dt>SHA-256 input</dt><dd>{snapshot.attachmentDraft.digest || "Not provided"}</dd></dl>
        </>}
      </details>
      <ReportTransactionJournal key={`${snapshot.programId}:${snapshot.reportAttempts?.length}`} attempts={snapshot.reportAttempts ?? []} network={snapshot.network} contractAddress={snapshot.contractAddress ?? ""} allowLookup={false} />
    </div>}
  </section>;
}

function InspectedReport({ report, label }: { report: VulnerabilityReport; label: string }) {
  return <details className="received-disclosure"><summary>{label}</summary>
    <p>This is the report decrypted from the saved envelope and checked against its saved commitment. It can differ from the editable draft. No current ledger state has been checked.</p>
    <ReportFields report={report} />
    <AttachmentReview attachments={report.attachments} />
  </details>;
}

function ReportFields({ report }: { report: VulnerabilityReport }) {
  return <>
    <h3>{report.title || "Untitled report"}</h3><p>{report.affectedAsset || "No affected asset provided"} / {report.weakness || "No weakness provided"}</p>
    <h4>Summary</h4><p className="policy-text">{report.summary || "Not provided"}</p>
    <h4>Impact</h4><p className="policy-text">{report.impact || "Not provided"}</p>
    <h4>Reproduction</h4><ol>{report.reproductionSteps.map((step, index) => <li className="policy-text" key={index}>{step}</li>)}</ol>
    <h4>Suggested remediation</h4><p className="policy-text">{report.suggestedRemediation || "Not provided"}</p>
    <h4>Researcher contact</h4><p>{report.researcherContact || "Not provided"}</p>
  </>;
}
