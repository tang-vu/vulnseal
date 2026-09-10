// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent } from "react";
import { decryptRoleVault, encryptRoleVault, type RoleVault } from "./role-recovery.js";
import { listStoredRoles, readStoredRole, writeStoredRole, type StoredRoleLabel } from "./role-storage.js";
import { RoleAutosave } from "./role-autosave.js";
import { RoleCopyCatalog } from "./RoleCopyCatalog.js";
import { BrowserStorageHealth } from "./BrowserStorageHealth.js";

export function LocalRoleStorage({ vault, disabled, onRestore, onSaved, onPersistence }: {
  readonly vault: RoleVault | undefined; readonly disabled: boolean;
  readonly onRestore: (vault: RoleVault) => Promise<void>;
  readonly onSaved: (vault: RoleVault | undefined) => void;
  readonly onPersistence?: (persist: ((vault: RoleVault) => Promise<void>) | undefined) => void;
}) {
  const [rows, setRows] = useState<StoredRoleLabel[]>([]);
  const [selected, setSelected] = useState("");
  const [label, setLabel] = useState("My encrypted workspace");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [writer, setWriter] = useState<RoleAutosave>();
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState(0);
  const [scheduled, setScheduled] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeWriter = useRef<RoleAutosave | undefined>(undefined);
  const saved = useRef<RoleVault | undefined>(undefined);
  const savedCopyId = useRef<string | undefined>(undefined);
  const autosaveTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ vault, onRestore, onSaved }); latest.current = { vault, onRestore, onSaved };
  const mounted = useRef(true), busy = useRef(false);
  const persistenceListener = useRef(onPersistence); persistenceListener.current = onPersistence;
  useEffect(() => {
    persistenceListener.current?.(writer ? async (snapshot) => {
      if (!mounted.current || activeWriter.current !== writer) throw new Error("Encrypted browser autosave is unavailable; recovery copy was not saved");
      // A delayed older draft must never overwrite the new pre-wallet journal.
      window.clearTimeout(autosaveTimer.current); autosaveTimer.current = undefined; setScheduled(false);
      setMessage("");
      setPending((value) => value + 1);
      try {
        const row = await writer.save(snapshot);
        if (!mounted.current || activeWriter.current !== writer) throw new Error("Workspace closed during recovery save; confirm the saved copy before leaving");
        saved.current = snapshot;
        setMessage(`Saved encrypted recovery checkpoint · revision ${row.revision}`);
      } catch (cause) {
        writer.stop(); activeWriter.current = undefined; setWriter(undefined);
        setError(cause instanceof Error ? cause.message : "Recovery checkpoint save failed"); throw cause;
      } finally { if (mounted.current) setPending((value) => value - 1); }
    } : undefined);
    return () => persistenceListener.current?.(undefined);
  }, [writer]);
  useEffect(() => {
    mounted.current = true;
    void listStoredRoles().then((value) => { if (mounted.current) setRows(value); }).catch(() => { if (mounted.current) setMessage("Browser storage is unavailable here. Downloaded file backups remain available."); });
    return () => { mounted.current = false; activeWriter.current?.stop(); };
  }, []);
  useEffect(() => {
    if (!writer || !vault || saved.current === vault) return;
    const captured = vault;
    setScheduled(true); setMessage("");
    const timer = window.setTimeout(() => {
      autosaveTimer.current = undefined; setScheduled(false);
      saved.current = captured; setPending((value) => value + 1); setError("");
      void writer.save(captured).then((row) => {
        if (!mounted.current || activeWriter.current !== writer) return;
        if (latest.current.vault === captured) { latest.current.onSaved(captured); setMessage(`Saved encrypted browser copy · revision ${row.revision} · ${row.updatedAt}`); }
      }).catch((cause) => {
        if (!mounted.current || activeWriter.current !== writer) return;
        activeWriter.current = undefined; setWriter(undefined); setError(cause instanceof Error ? cause.message : "Browser autosave failed");
      }).finally(() => { if (mounted.current) setPending((value) => value - 1); });
    }, 400);
    autosaveTimer.current = timer;
    return () => { window.clearTimeout(timer); setScheduled(false); };
  }, [vault, writer]);
  const bind = (next: RoleAutosave, snapshot: RoleVault) => { activeWriter.current?.stop(); activeWriter.current = next; saved.current = snapshot; setWriter(next); };
  const run = async (event: FormEvent, action: () => Promise<void>) => {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setWorking(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Encrypted browser storage failed"); }
    finally { busy.current = false; if (mounted.current) setWorking(false); }
  };
  return <section className="form-panel local-role-storage">
    <h2>Encrypted browser copies</h2>
    <p>Keep a password-encrypted role vault on this device. Only the label, update time and revision are visible without the password. Keep a downloaded backup too: clearing browser data removes these copies.</p>
    <BrowserStorageHealth />
    {message && <p>{message}</p>}{pending > 0 && <p role="status">Saving encrypted browser copy… Keep this tab open until saved.</p>}
    {error && <p className="operation-notice error" role="status">{error}{vault && " Your open workspace is retained; download a file backup before closing."}</p>}
    {scheduled && <p role="status">Draft or workspace changes are waiting to be encrypted. Keep this tab open until saved.</p>}
    <fieldset className="workflow-controls" disabled={disabled || working || pending > 0 || scheduled}>
      {writer ? <><p>Autosave is active for role identity, deployment address, prepared/received reports, the current report or vendor program draft and working notes for each report. Receiving keys are not included.</p><button className="secondary-button" onClick={() => { writer.stop(); activeWriter.current = undefined; setWriter(undefined); setMessage("Autosave stopped. The encrypted browser copy remains stored."); }}>Stop browser autosave</button></> : vault ?
        <form onSubmit={(event) => void run(event, async () => {
          if (password !== confirmation) throw new Error("Browser-copy passwords do not match");
          const captured = vault; const encrypted = await encryptRoleVault(captured, password);
          if (!mounted.current) return;
          const row = await writeStoredRole(crypto.randomUUID(), label, encrypted, null);
          if (!mounted.current) return;
          savedCopyId.current = row.id;
          bind(new RoleAutosave(row, password), captured); latest.current.onSaved(captured); setPassword(""); setConfirmation("");
          setMessage(`Saved encrypted browser copy · revision ${row.revision} · ${row.updatedAt}`);
        })}>
          <label>Browser copy label<input value={label} maxLength={80} required onChange={(event) => setLabel(event.target.value)} /></label>
          <label>Browser copy password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Confirm browser copy password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <button className="primary-button">Enable encrypted browser autosave</button>
        </form> :
        <form onSubmit={(event) => void run(event, async () => {
          const row = await readStoredRole(selected); const restored = await decryptRoleVault(row.encrypted, password);
          if (!mounted.current) return;
          if (latest.current.vault) throw new Error("A workspace is already open. Restore in a fresh tab.");
          await latest.current.onRestore(restored);
          if (!mounted.current) return;
          savedCopyId.current = row.id;
          bind(new RoleAutosave(row, password), restored); setPassword("");
          setMessage(`Opened encrypted browser copy · revision ${row.revision}`);
        })}>
          <label>Saved browser workspace<select value={selected} required onChange={(event) => setSelected(event.target.value)}><option value="">Choose a saved copy</option>{rows.map((row) => <option value={row.id} key={row.id}>{row.label} · revision {row.revision} · {row.updatedAt}</option>)}</select></label>
          <label>Browser unlock password<input type="password" autoComplete="current-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary-button">Unlock browser workspace</button>
          <button type="button" className="secondary-button" onClick={() => void listStoredRoles().then(setRows).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not refresh browser copies"))}>Refresh browser copies</button>
        </form>}
    </fieldset>
    {writer && <p>Stop browser autosave before managing saved copies in this tab.</p>}
    <RoleCopyCatalog disabled={disabled || working || pending > 0 || scheduled || writer !== undefined} onDeleted={(id) => {
      setRows((values) => values.filter((entry) => entry.id !== id));
      if (selected === id) setSelected("");
      if (savedCopyId.current === id) {
        savedCopyId.current = undefined; saved.current = undefined; latest.current.onSaved(undefined);
        setMessage("The browser copy for this workspace was deleted. Save the open workspace again before submitting a transaction.");
      }
    }} />
  </section>;
}
