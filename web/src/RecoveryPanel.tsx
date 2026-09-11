// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_RECOVERY_BYTES, type RecoverySnapshot } from "./recovery.js";
import { deleteStoredRecovery, listStoredRecoveries, readStoredRecovery, writeStoredRecovery, type StoredCopyLabel } from "./recovery-storage.js";

import { RecoveryAutosavePanel } from "./RecoveryAutosavePanel.js";

const downloadRecovery = (serialized: string, filename = "vulnseal-recovery.json") => {
  const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
};

export function RecoveryPanel({ onAutosaveStatus, snapshot, onExport, onImport, canImport }: {
  readonly onAutosaveStatus?: ((status: string) => void) | undefined;
  readonly snapshot?: RecoverySnapshot | undefined;
  readonly onExport: (password: string) => Promise<string>;
  readonly onImport: (serialized: string, password: string) => Promise<void>;
  readonly canImport: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [copies, setCopies] = useState<StoredCopyLabel[]>([]);
  const [selectedCopy, setSelectedCopy] = useState("");
  const [activeAutosaveId, setActiveAutosaveId] = useState<string>();
  const restoreAllowed = canImport && !activeAutosaveId;
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0), busy = useRef(false), importAllowed = useRef(canImport);
  importAllowed.current = restoreAllowed;
  const hasInputs = Boolean(password || confirmation || restorePassword || file);
  useEffect(() => {
    if (!hasInputs && !working) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasInputs, working]);
  const clearInputs = () => {
    if (busy.current) return;
    setPassword(""); setConfirmation(""); setRestorePassword(""); setFile(undefined);
    if (fileInput.current) fileInput.current.value = "";
    setError(""); setMessage("");
  };
  useEffect(() => () => { generation.current++; }, []);
  const run = async (event: Pick<FormEvent, "preventDefault">, action: (isCurrent: () => boolean) => Promise<void>) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const pending = ++generation.current, isCurrent = () => generation.current === pending;
    setError(""); setMessage(""); setWorking(true);
    try { await action(isCurrent); }
    catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Recovery operation failed"); }
    finally { if (isCurrent()) { busy.current = false; setWorking(false); } }
  };
  return <section className="page narrow-page recovery-page">
    <div className="page-heading"><div><span className="eyebrow accent">Private recovery</span><h1>Keep control of your disclosure</h1><p>Save an encrypted backup before closing this tab. Keep the file and password separately; neither can be recovered from the public ledger.</p></div></div>
    <div className="warning-box"><div><strong>This backup controls both experimental roles</strong><p>It includes vendor and researcher secrets, report decryption material, and private notes. Do not share it with a vendor, researcher, or public verifier. It is not a wallet seed backup.</p></div></div>
    <fieldset className="workflow-controls" disabled={working}>
    <form className="form-panel" onSubmit={(event) => void run(event, async (isCurrent) => {
      if (password !== confirmation) throw new Error("Backup passwords do not match");
      const serialized = await onExport(password);
      if (!isCurrent()) return;
      downloadRecovery(serialized);
      setPassword(""); setConfirmation("");
      setMessage("Encrypted backup download started. Confirm the file is saved, and make a new backup after new reports or private evidence.");
    })}>
      <h2>Download encrypted backup</h2>
      <p>The file is encrypted locally with AES-256-GCM. Your password and private material are not uploaded. This tab keeps its leave warning because starting a download does not confirm that you saved the file.</p>
      <label>Backup password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm backup password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <button className="primary-button" disabled={working}>Download encrypted backup</button>
      <button type="button" className="secondary-button" disabled={working} onClick={(event) => void run(event, async (isCurrent) => {
        if (password !== confirmation) throw new Error("Backup passwords do not match");
        const encrypted = await onExport(password);
        if (!isCurrent()) return;
        const saved = await writeStoredRecovery(crypto.randomUUID(), "Combined recovery", encrypted, null);
        if (!isCurrent()) return;
        const { encrypted: _encrypted, ...metadata } = saved;
        setCopies((current) => [metadata, ...current]); setSelectedCopy(saved.id);
        setPassword(""); setConfirmation("");
        setMessage("Encrypted browser copy saved. Save a new copy after changes and keep a separate file backup; clearing site data removes browser copies.");
      })}>Save encrypted browser copy</button>
    </form>
    <form className="form-panel" onSubmit={(event) => void run(event, async (isCurrent) => {
      if (!importAllowed.current) throw new Error("Restore in a fresh tab to preserve this active session");
      if (!file) throw new Error("Choose a recovery file");
      if (file.size > MAX_RECOVERY_BYTES) throw new Error("Recovery file is too large");
      const serialized = await file.text();
      if (!isCurrent()) return;
      if (!importAllowed.current) throw new Error("Restore in a fresh tab to preserve this active session");
      await onImport(serialized, restorePassword);
      if (isCurrent()) {
        setRestorePassword(""); setFile(undefined);
        if (fileInput.current) fileInput.current.value = "";
      }
    })}>
      <h2>Restore a saved session</h2>
      <p>Restore in a fresh tab. An existing draft is replaced. Network recovery connects Lace and checks the contract and report on the file’s network; it does not submit a transaction.</p>
      {!restoreAllowed && <p role="status">This tab has an active program/report or autosave writer. Open a fresh tab to restore without replacing it.</p>}
      <label>Recovery file<input ref={fileInput} type="file" accept=".json,application/json" required disabled={!restoreAllowed || working} onChange={(event) => setFile(event.target.files?.[0])} /></label>
      <label>Recovery password<input type="password" autoComplete="current-password" minLength={12} required value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} disabled={!restoreAllowed || working} /></label>
      <button className="primary-button" disabled={!restoreAllowed || working}>Restore encrypted backup</button>
    </form>
    <RecoveryAutosavePanel onStatus={onAutosaveStatus} snapshot={snapshot} onActive={setActiveAutosaveId} onSaved={(metadata) => setCopies((current) => [metadata, ...current.filter((copy) => copy.id !== metadata.id)])} />
    {activeAutosaveId && <p>Stop autosave before restoring another session or removing its active copy.</p>}
    <section className="form-panel" aria-label="Saved browser recovery copies">
      <h2>Saved browser copies</h2>
      <p>Copies contain both experimental roles and stay encrypted on this browser and site. Saving is manual: only the state at the last confirmed save can be recovered. Keep the password separately and retain a file backup for another device.</p>
      <button type="button" className="secondary-button" onClick={(event) => void run(event, async (isCurrent) => {
        const rows = await listStoredRecoveries();
        if (isCurrent()) { setCopies(rows); setSelectedCopy(""); setMessage(rows.length ? "Saved browser copies refreshed." : "No saved browser copies on this site."); }
      })}>Refresh browser copies</button>
      <label>Saved recovery copy<select value={selectedCopy} onChange={(event) => setSelectedCopy(event.target.value)}>
        <option value="">Choose a saved copy</option>
        {copies.map((copy) => <option key={copy.id} value={copy.id}>{copy.label} ? {new Date(copy.updatedAt).toLocaleString()} ? {copy.id.slice(0, 8)}</option>)}
      </select></label>
      <p>To restore, enter the Recovery password above. Downloading a selected copy keeps its existing encryption and password; it does not require unlocking this session. Removing a selected copy deletes only that browser copy, not downloaded files or the active session.</p>
      <button type="button" className="primary-button" disabled={!restoreAllowed || !selectedCopy || working} onClick={(event) => void run(event, async (isCurrent) => {
        if (!importAllowed.current) throw new Error("Restore in a fresh tab to preserve this active session");
        const saved = await readStoredRecovery(selectedCopy);
        if (!isCurrent()) return;
        if (!importAllowed.current) throw new Error("Restore in a fresh tab to preserve this active session");
        await onImport(saved.encrypted, restorePassword);
        if (isCurrent()) { setRestorePassword(""); setFile(undefined); if (fileInput.current) fileInput.current.value = ""; }
      })}>Restore selected browser copy</button>
      <button type="button" className="secondary-button" disabled={!selectedCopy || working} onClick={(event) => void run(event, async (isCurrent) => {
        const saved = await readStoredRecovery(selectedCopy);
        if (!isCurrent()) return;
        downloadRecovery(saved.encrypted, `vulnseal-recovery-${saved.id}-r${saved.revision}.json`);
        setMessage(`Encrypted browser copy download started (revision ${saved.revision}). Confirm the file is saved before removing this browser copy. Its existing password is still required to restore it.`);
      })}>Download selected browser copy</button>
      <button type="button" className="secondary-button" disabled={!selectedCopy || selectedCopy === activeAutosaveId || working} onClick={(event) => void run(event, async (isCurrent) => {
        const selected = copies.find((copy) => copy.id === selectedCopy);
        if (!selected) throw new Error("Refresh and select a browser copy first");
        await deleteStoredRecovery(selected.id, selected.revision);
        if (isCurrent()) { setCopies((current) => current.filter((copy) => copy.id !== selected.id)); setSelectedCopy(""); setMessage("Selected browser copy removed. Other copies, files and the active session remain available."); }
      })}>Remove selected browser copy</button>
    </section>
    <p>Unfinished recovery inputs stay in this tab when you switch screens. Clear them when finished; closing or reloading the tab discards them.</p>
    <button type="button" className="secondary-button" disabled={working || !hasInputs} onClick={clearInputs}>Clear recovery inputs</button>
    </fieldset>
    {error && <div className="operation-notice error" role="alert"><strong>{error}</strong></div>}
    {working && <div className="operation-notice" role="status"><strong>Processing recovery material. A network restore may wait for Lace and the indexer.</strong></div>}
    {message && <div className="operation-notice" role="status"><strong>{message}</strong></div>}
  </section>;
}
