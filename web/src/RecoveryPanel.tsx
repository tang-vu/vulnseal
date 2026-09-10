// SPDX-License-Identifier: Apache-2.0
import { useState, type FormEvent } from "react";
import { MAX_RECOVERY_BYTES } from "./recovery.js";

export function RecoveryPanel({ onExport, onImport, canImport }: {
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
  const run = async (event: FormEvent, action: () => Promise<void>) => {
    event.preventDefault();
    if (working) return;
    setError(""); setMessage(""); setWorking(true);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Recovery operation failed"); }
    finally { setWorking(false); }
  };
  return <section className="page narrow-page recovery-page">
    <div className="page-heading"><div><span className="eyebrow accent">Private recovery</span><h1>Keep control of your disclosure</h1><p>Save an encrypted backup before closing this tab. Keep the file and password separately; neither can be recovered from the public ledger.</p></div></div>
    <div className="warning-box"><div><strong>This backup controls both experimental roles</strong><p>It includes vendor and researcher secrets, report decryption material, and private notes. Do not share it with a vendor, researcher, or public verifier. It is not a wallet seed backup.</p></div></div>
    <form className="form-panel" onSubmit={(event) => void run(event, async () => {
      if (password !== confirmation) throw new Error("Backup passwords do not match");
      const serialized = await onExport(password);
      const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "vulnseal-recovery.json";
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPassword(""); setConfirmation("");
      setMessage("Encrypted backup download started. Confirm the file is saved, and make a new backup after new reports or private evidence.");
    })}>
      <h2>Download encrypted backup</h2>
      <p>The file is encrypted locally with AES-256-GCM. Your password and private material are not uploaded. This tab keeps its leave warning because starting a download does not confirm that you saved the file.</p>
      <label>Backup password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm backup password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <button className="primary-button" disabled={working}>Download encrypted backup</button>
    </form>
    <form className="form-panel" onSubmit={(event) => void run(event, async () => {
      if (!file) throw new Error("Choose a recovery file");
      if (file.size > MAX_RECOVERY_BYTES) throw new Error("Recovery file is too large");
      await onImport(await file.text(), restorePassword);
      setRestorePassword("");
    })}>
      <h2>Restore a saved session</h2>
      <p>Restore in a fresh tab. An existing draft is replaced. Network recovery connects Lace and checks the contract and report on the file’s network; it does not submit a transaction.</p>
      {!canImport && <p role="status">This tab already has a prepared report, sealed report or deployed program. Open a fresh tab to restore without replacing it.</p>}
      <label>Recovery file<input type="file" accept=".json,application/json" required disabled={!canImport || working} onChange={(event) => setFile(event.target.files?.[0])} /></label>
      <label>Recovery password<input type="password" autoComplete="current-password" minLength={12} required value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} disabled={!canImport || working} /></label>
      <button className="primary-button" disabled={!canImport || working}>Restore encrypted backup</button>
    </form>
    {error && <div className="operation-notice error" role="alert"><strong>{error}</strong></div>}
    {working && <div className="operation-notice" role="status"><strong>Processing recovery material. A network restore may wait for Lace and the indexer.</strong></div>}
    {message && <div className="operation-notice" role="status"><strong>{message}</strong></div>}
  </section>;
}
