// SPDX-License-Identifier: Apache-2.0
import { JournalEntries } from "./JournalEntries.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { decryptRoleVault, MAX_ROLE_BACKUP_BYTES, type SubmissionAttempt } from "./role-recovery.js";
import { listStoredRoles, readStoredRole, type StoredRoleLabel } from "./role-storage.js";
import { SubmissionIntentView } from "./SubmissionIntentView.js";
import { ReportEffectCheck } from "./ReportEffectCheck.js";
import { TransactionCheck } from "./TransactionCheck.js";

type JournalView = { programId: string; network: string; contractAddress: string | null; attempts: readonly SubmissionAttempt[] };

/** Read-only recovery: only the journal projection enters React state, never actor authority. */
export function RecoveryJournal() {
  const [source, setSource] = useState("file");
  const [file, setFile] = useState<File>();
  const [rows, setRows] = useState<StoredRoleLabel[]>([]);
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<JournalView>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const clear = () => { generation.current++; setView(undefined); setError(""); setWorking(false); };
  const inspect = async (event: FormEvent) => {
    event.preventDefault(); clear(); const token = generation.current; setWorking(true);
    try {
      let encrypted: string;
      if (source === "file") {
        if (!file) throw new Error("Choose an encrypted role backup");
        if (file.size > MAX_ROLE_BACKUP_BYTES) throw new Error("Role backup is too large");
        encrypted = await file.text();
      } else { encrypted = (await readStoredRole(selected)).encrypted; }
      const vault = await decryptRoleVault(encrypted, password);
      if (token !== generation.current) return;
      setView({ programId: vault.programId, network: vault.network, contractAddress: vault.contractAddress, attempts: (vault.submissionAttempts ?? []).map(({ transactionId, recordedAt, intent, finalization }) => ({ transactionId, recordedAt, intent: intent ?? null, finalization: finalization ?? null })) });
      setPassword("");
    } catch (cause) { if (token === generation.current) setError(cause instanceof Error ? cause.message : "Could not inspect the recovery journal"); }
    finally { if (token === generation.current) setWorking(false); }
  };
  return <section className="form-panel">
    <h2>Inspect recovery journal without a wallet</h2>
    <p>Read transaction identifiers from an encrypted role backup when workspace recovery is unavailable. This does not open a role session or verify authority. Decryption stays on this device; public services are contacted only when you choose a status or report-effects check.</p>
    <form onSubmit={(event) => void inspect(event)}>
      <fieldset className="workflow-controls" disabled={working}>
        <label>Journal recovery source<select value={source} onChange={(event) => { clear(); setPassword(""); setSource(event.target.value); }}><option value="file">Downloaded role backup</option><option value="browser">Saved browser copy</option></select></label>
        {source === "file" ? <label>Journal backup file<input type="file" accept=".json,application/json" required onChange={(event) => { clear(); setFile(event.target.files?.[0]); }} /></label> : <>
          <button type="button" className="secondary-button" onClick={async () => {
            clear(); const token = generation.current; setWorking(true);
            try { const values = await listStoredRoles(); if (token === generation.current) { setRows(values); setSelected(""); } }
            catch (cause) { if (token === generation.current) setError(cause instanceof Error ? cause.message : "Could not list browser copies"); }
            finally { if (token === generation.current) setWorking(false); }
          }}>Load journal browser copies</button>
          <label>Journal browser copy<select value={selected} required onChange={(event) => { clear(); setSelected(event.target.value); }}><option value="">Choose an encrypted copy</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.label} · revision {row.revision}</option>)}</select></label>
        </>}
        <label>Journal backup password<input type="password" autoComplete="current-password" required minLength={12} value={password} onChange={(event) => { clear(); setPassword(event.target.value); }} /></label>
        <button type="submit" className="primary-button">Read recovery journal</button>
      </fieldset>
    </form>
    <button type="button" className="secondary-button" onClick={() => { clear(); setPassword(""); }}>Clear inspected journal</button>
    {working && <p role="status">Reading encrypted journal…</p>}
    {error && <p role="alert">{error}</p>}
    {view && <div>
      <p>Backup network: {view.network}. These are local backup claims, not verified authority or transaction outcomes.</p>
      {view.contractAddress && <p className="public-value">Backup contract: {view.contractAddress}</p>}
      {view.attempts.length ? <JournalEntries entries={view.attempts} label="Search inspected journal">{(entry) => <li className="public-value" key={entry.transactionId}>{entry.transactionId} · recorded {entry.recordedAt}<SubmissionIntentView entry={entry} /><TransactionCheck network={view.network} transactionId={entry.transactionId} contractAddress={view.contractAddress} circuit={entry.intent?.circuit} />{view.contractAddress && entry.intent?.reportId && <ReportEffectCheck network={view.network} transactionId={entry.transactionId} contractAddress={view.contractAddress} programId={view.programId} reportId={entry.intent.reportId} circuit={entry.intent.circuit} />}</li>}</JournalEntries> : <p>This backup contains no recorded submission attempts. It may predate a transaction; this does not prove that nothing was sent.</p>}
    </div>}
  </section>;
}
