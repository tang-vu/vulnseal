// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from "react";
import { deleteStoredRole, listStoredRoles, readStoredRole, type StoredRoleLabel } from "./role-storage.js";

/** Catalog operations never decrypt a vault or install an actor identity. */
export function RoleCopyCatalog({ disabled, onDeleted }: { readonly disabled: boolean; readonly onDeleted: (id: string) => void }) {
  const [rows, setRows] = useState<StoredRoleLabel[]>([]);
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const row = rows.find((entry) => entry.id === selected);
  const run = async (action: () => Promise<void>) => {
    if (busy.current || disabled) return;
    busy.current = true;
    setWorking(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { setConfirmed(false); setError(cause instanceof Error ? cause.message : "Browser copy operation failed"); }
    finally { busy.current = false; setWorking(false); }
  };
  return <details>
    <summary>Manage saved browser copies</summary>
    <p>Download an encrypted copy before removing it from this device. Downloads keep the existing password and can be opened with Restore one role. A download does not verify that you remember the password.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    <fieldset className="workflow-controls" disabled={disabled || working}>
      <button type="button" className="secondary-button" onClick={() => void run(async () => {
        const values = await listStoredRoles(); setRows(values); setConfirmed(false);
        if (!values.some((entry) => entry.id === selected)) setSelected("");
        setMessage(values.length ? `Found ${values.length} encrypted browser copies.` : "No saved browser copies on this device.");
      })}>Load saved-copy catalog</button>
      <label>Browser copy to manage<select value={selected} onChange={(event) => { setSelected(event.target.value); setConfirmed(false); setError(""); setMessage(""); }}>
        <option value="">Choose a copy to manage</option>
        {rows.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · revision {entry.revision} · {entry.updatedAt}</option>)}
      </select></label>
      {row && <>
        <p>Selected: {row.label} · revision {row.revision}. Copy ID: {row.id}</p>
        <button type="button" className="secondary-button" onClick={() => void run(async () => {
          const current = await readStoredRole(row.id);
          if (current.revision !== row.revision) throw new Error("This browser copy changed. Reload the catalog before exporting the latest revision.");
          const url = URL.createObjectURL(new Blob([current.encrypted], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = `vulnseal-role-device-${row.id}-backup.json`;
          document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMessage(`Encrypted revision ${row.revision} downloaded. Confirm the file was saved and retain its password.`);
        })}>Download selected encrypted copy</button>
        <p>Deleting removes only this browser copy. It does not remove downloaded backups, other copies, ciphertext service files or on-chain records. An open workspace stays in memory; its next autosave to this deleted copy will stop.</p>
        <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand deleting this copy may remove my only saved authority and reports.</label>
        <button type="button" className="secondary-button" disabled={!confirmed} onClick={() => void run(async () => {
          await deleteStoredRole(row.id, row.revision);
          onDeleted(row.id);
          setRows((values) => values.filter((entry) => entry.id !== row.id)); setSelected(""); setConfirmed(false);
          setMessage(`Deleted browser copy ${row.label}, revision ${row.revision}. Other copies remain unchanged.`);
        })}>Delete selected browser copy</button>
      </>}
    </fieldset>
  </details>;
}
