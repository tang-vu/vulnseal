// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent } from "react";
import { encryptRecovery, type RecoverySnapshot } from "./recovery.js";
import { RecoveryAutosave } from "./recovery-autosave.js";
import { writeStoredRecovery, type StoredCopy, type StoredCopyLabel } from "./recovery-storage.js";
const binding = (snapshot: RecoverySnapshot) => JSON.stringify([snapshot.programId, snapshot.network, snapshot.contractAddress]);

export function RecoveryAutosavePanel({ snapshot, onSaved, onActive, onStatus }: {
  readonly onStatus?: ((status: string) => void) | undefined;
  readonly snapshot: RecoverySnapshot | undefined;
  readonly onSaved: (copy: StoredCopyLabel) => void;
  readonly onActive: (id: string | undefined) => void;
}) {
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [writer, setWriter] = useState<RecoveryAutosave>();
  const [status, setStatus] = useState("Autosave is off."), [starting, setStarting] = useState(false);
  const active = useRef<RecoveryAutosave | undefined>(undefined), generation = useRef(0), busy = useRef(false);
  const saved = useRef<RecoverySnapshot | undefined>(undefined), session = useRef("");
  const latest = useRef(snapshot), callbacks = useRef({ onSaved, onActive, onStatus });
  latest.current = snapshot; callbacks.current = { onSaved, onActive, onStatus };
  const announce = (row: StoredCopy) => { const { encrypted: _encrypted, ...metadata } = row; callbacks.current.onSaved(metadata); };
  const stop = (message: string) => {
    active.current?.stop(); active.current = undefined; setWriter(undefined);
    callbacks.current.onActive(undefined); setStatus(message);
  };
  useEffect(() => () => { generation.current++; active.current?.stop(); active.current = undefined; }, []);
  useEffect(() => {
    if (!password && !confirmation && !starting && !writer) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [password, confirmation, starting, writer]);
  useEffect(() => {
    if (!writer) return;
    if (!snapshot || binding(snapshot) !== session.current) { stop("Autosave stopped because the program or network changed. Enable a new copy for this session."); return; }
    if (saved.current === snapshot) return;
    const timer = setTimeout(() => {
      setStatus("Saving encrypted changes?");
      void writer.save(snapshot).then((row) => {
        if (active.current !== writer) return;
        saved.current = snapshot; announce(row);
        setStatus(latest.current === snapshot ? `Autosave confirmed at ${new Date(row.updatedAt).toLocaleTimeString()}.` : "Waiting to save newer changes?");
      }).catch((cause: unknown) => {
        if (active.current !== writer) return;
        stop(`Autosave stopped: ${cause instanceof Error ? cause.message : "Storage did not confirm the save"}. Keep this tab open and download a file backup.`);
      });
    }, 750);
    return () => clearTimeout(timer);
  }, [snapshot, writer]);
  const notice = starting ? "Creating encrypted autosave copy?" : writer && saved.current !== snapshot ? "Changes are waiting for encrypted autosave confirmation." : status;
  useEffect(() => { callbacks.current.onStatus?.(notice === "Autosave is off." ? "" : notice); }, [notice]);
  const enable = async (event: FormEvent) => {
    event.preventDefault(); if (busy.current || active.current) return;
    busy.current = true; setStarting(true); const pending = ++generation.current;
    try {
      if (!snapshot) throw new Error("Create the network program before enabling combined recovery autosave");
      if (password !== confirmation) throw new Error("Autosave passwords do not match");
      const encrypted = await encryptRecovery(snapshot, password);
      if (generation.current !== pending) return;
      const row = await writeStoredRecovery(crypto.randomUUID(), "Combined autosave", encrypted, null);
      if (generation.current !== pending) return;
      const next = new RecoveryAutosave(row, password);
      active.current = next; session.current = binding(snapshot); saved.current = snapshot;
      setWriter(next); announce(row); callbacks.current.onActive(row.id);
      setPassword(""); setConfirmation(""); setStatus(`Autosave confirmed at ${new Date(row.updatedAt).toLocaleTimeString()}.`);
    } catch (cause) {
      if (generation.current === pending) setStatus(`Autosave not enabled: ${cause instanceof Error ? cause.message : "Storage did not confirm the save"}`);
    } finally { if (generation.current === pending) { busy.current = false; setStarting(false); } }
  };
  return <section className="form-panel" aria-label="Combined recovery autosave">
    <h2>Automatic encrypted browser backup</h2>
    <p>Enable a new copy with a password you keep separately. Edits are encrypted after a short pause; wait for confirmation before closing. This does not guarantee that a transaction attempt is saved before the wallet opens. Keep a separate file backup.</p>
    {!writer && <form onSubmit={(event) => void enable(event)}><fieldset className="workflow-controls" disabled={starting}>
      <label>Autosave password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm autosave password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <button className="primary-button" disabled={!snapshot || starting}>Enable encrypted autosave</button>
    </fieldset></form>}
    {writer && <button type="button" className="secondary-button" onClick={() => stop("Autosave stopped. Its saved copy remains available; newer edits need another backup.")}>Stop encrypted autosave</button>}
    <p role="status">{notice}</p>
  </section>;
}
