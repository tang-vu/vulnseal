// SPDX-License-Identifier: Apache-2.0
import { continuationDeadline } from "./midnight/continuation-deadline.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { encryptRecovery, type RecoverySnapshot } from "./recovery.js";
import { RecoveryAutosave } from "./recovery-autosave.js";
import { writeStoredRecovery, type StoredCopy, type StoredCopyLabel } from "./recovery-storage.js";
const binding = (snapshot: RecoverySnapshot) => JSON.stringify([snapshot.programId, snapshot.network, snapshot.contractAddress]);

export type RecoveryPersistenceLease = { save: (snapshot: RecoverySnapshot) => Promise<StoredCopy>; release: () => void; stop: () => void };
export type AcquireRecoveryPersistence = () => RecoveryPersistenceLease;

export function RecoveryAutosavePanel({ snapshot, onSaved, onActive, onStatus, onPersistence }: {
  readonly onPersistence?: ((acquire: AcquireRecoveryPersistence | undefined) => void) | undefined;
  readonly onStatus?: ((status: string) => void) | undefined;
  readonly snapshot: RecoverySnapshot | undefined;
  readonly onSaved: (copy: StoredCopyLabel) => void;
  readonly onActive: (id: string | undefined) => void;
}) {
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [epoch, setEpoch] = useState(0);
  const leased = useRef(false), debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [writer, setWriter] = useState<RecoveryAutosave>();
  const [status, setStatus] = useState("Autosave is off."), [starting, setStarting] = useState(false);
  const active = useRef<RecoveryAutosave | undefined>(undefined), generation = useRef(0), busy = useRef(false);
  const saved = useRef<RecoverySnapshot | undefined>(undefined), session = useRef("");
  const latest = useRef(snapshot), callbacks = useRef({ onSaved, onActive, onStatus, onPersistence });
  latest.current = snapshot; callbacks.current = { onSaved, onActive, onStatus, onPersistence };
  const announce = (row: StoredCopy) => { const { encrypted: _encrypted, ...metadata } = row; callbacks.current.onSaved(metadata); };
  const stop = (message: string) => {
    clearTimeout(debounce.current); leased.current = false;
    active.current?.stop(); active.current = undefined; setWriter(undefined); callbacks.current.onPersistence?.(undefined);
    callbacks.current.onActive(undefined); setStatus(message);
  };
  useEffect(() => () => { generation.current++; clearTimeout(debounce.current); active.current?.stop(); active.current = undefined; callbacks.current.onPersistence?.(undefined); }, []);
  useEffect(() => {
    if (!password && !confirmation && !starting && !writer) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [password, confirmation, starting, writer]);
  useEffect(() => {
    if (!writer) return;
    if (!snapshot || binding(snapshot) !== session.current) { stop("Autosave stopped because the program or network changed. Enable a new copy for this session."); return; }
    if (leased.current || saved.current === snapshot) return;
    const timer = setTimeout(() => {
      if (leased.current || active.current !== writer) return;
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
    debounce.current = timer;
    return () => clearTimeout(timer);
  }, [snapshot, writer, epoch]);
  useEffect(() => {
    if (!writer) return;
    callbacks.current.onPersistence?.(() => {
      if (active.current !== writer || leased.current) throw new Error("Encrypted recovery writer is unavailable or already in use");
      leased.current = true; clearTimeout(debounce.current);
      let closed = false;
      const check = () => { if (closed || active.current !== writer || !leased.current) throw new Error("Encrypted recovery checkpoint is closed"); };
      return {
        async save(snapshot) {
          check();
          try { const row = await writer.save(snapshot); check(); saved.current = snapshot; announce(row); setStatus(`Transaction checkpoint saved at ${new Date(row.updatedAt).toLocaleTimeString()}.`); return row; }
          catch (cause) { if (active.current === writer) stop("Autosave stopped after an unconfirmed transaction checkpoint. Keep this tab and export a file backup."); throw cause; }
        },
        release() { if (closed) return; closed = true; leased.current = false; setEpoch(value => value + 1); },
        stop() { if (closed) return; closed = true; if (active.current === writer) stop("Autosave stopped after an interrupted transaction. Retain its encrypted copy and inspect the recorded attempt."); },
      };
    });
    return () => callbacks.current.onPersistence?.(undefined);
  }, [writer]);
  const notice = starting ? "Creating encrypted autosave copy?" : writer && saved.current !== snapshot ? "Changes are waiting for encrypted autosave confirmation." : status;
  useEffect(() => { callbacks.current.onStatus?.(notice === "Autosave is off." ? "" : notice); }, [notice]);
  const enable = async (event: FormEvent) => {
    event.preventDefault(); if (busy.current || active.current) return;
    busy.current = true; setStarting(true); const pending = ++generation.current;
    try {
      if (!snapshot) throw new Error("Create the network program before enabling combined recovery autosave");
      if (password !== confirmation) throw new Error("Autosave passwords do not match");
      const encrypted = await continuationDeadline(180_000, "Autosave setup encryption timed out. Your inputs are retained; retry explicitly when ready. No browser copy was written by this attempt.", async check => {
        check(); const result = await encryptRecovery(snapshot, password); check(); return result;
      });
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
    <p>Enable a new copy with a password you keep separately. Edits are encrypted after a short pause; wait for confirmation before closing. Network report actions require this writer: they save intent before SDK work and the transaction identifier before broadcast. Keep a separate file backup.</p>
    {!writer && <form onSubmit={(event) => void enable(event)}><fieldset className="workflow-controls" disabled={starting}>
      <label>Autosave password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm autosave password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <button className="primary-button" disabled={!snapshot || starting}>Enable encrypted autosave</button>
    </fieldset></form>}
    {writer && <button type="button" className="secondary-button" onClick={() => stop("Autosave stopped. Its saved copy remains available; newer edits need another backup.")}>Stop encrypted autosave</button>}
    <p role="status">{notice}</p>
  </section>;
}
