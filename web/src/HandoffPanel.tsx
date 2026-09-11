// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent } from "react";
import { backupRecipient, createRecipient, decryptDisclosure, encryptDisclosure, MAX_HANDOFF_BYTES, MAX_ATTACHMENT_TRANSFER_BYTES, parseRecipient, restoreRecipient, type Disclosure, type Recipient, type RecipientKeys } from "./handoff.js";
import { publicReceiptLink } from "./public-verification.js";
import { continuationDeadline } from "./midnight/continuation-deadline.js";
import { AttachmentReview } from "./AttachmentFields.js";

const download = (serialized: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
};
const read = async (file: File | undefined, limit: number) => {
  if (!file) throw new Error("Choose a file first");
  if (file.size > limit) throw new Error("Selected file is too large");
  return file.text();
};

export function HandoffPanel({ disclosure, keys, onKeys, onDisclosure }: { readonly disclosure: Disclosure | undefined; readonly keys: RecipientKeys | undefined; readonly onKeys: (keys: RecipientKeys) => void; readonly onDisclosure?: (value: Disclosure) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [backup, setBackup] = useState<File>();
  const [recipient, setRecipient] = useState<Recipient>();
  const [confirmed, setConfirmed] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  useEffect(() => { setAttachmentFiles([]); }, [disclosure?.network, disclosure?.contractAddress, disclosure?.programId, disclosure?.reportId, disclosure?.envelope]);
  useEffect(() => { setConfirmed(false); }, [disclosure?.network, disclosure?.contractAddress, disclosure?.programId, disclosure?.reportId, disclosure?.envelope, disclosure?.key, disclosure?.salt]);
  const [packageFile, setPackageFile] = useState<File>();
  const [opened, setOpened] = useState<Awaited<ReturnType<typeof decryptDisclosure>>>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0), busy = useRef(false);
  const fields = useRef<HTMLFieldSetElement>(null);
  useEffect(() => () => { generation.current++; }, []);
  const hasLocalWork = Boolean(working || password || confirmation || restorePassword || backup || recipient || packageFile || opened || keys);
  useEffect(() => {
    if (!hasLocalWork) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasLocalWork]);
  const run = async (event: FormEvent | undefined, action: (commit: (fn: () => void) => void, isCurrent: () => boolean) => Promise<void>) => {
    event?.preventDefault(); if (busy.current) return;
    busy.current = true; const pending = ++generation.current;
    setWorking(true); setError(""); setMessage("");
    const commit = (fn: () => void) => { if (generation.current === pending) fn(); };
    try { await action(commit, () => generation.current === pending); }
    catch (cause) { commit(() => setError(cause instanceof Error ? cause.message : "Disclosure exchange failed")); }
    finally { commit(() => { busy.current = false; setWorking(false); }); }
  };
  return <section className="page narrow-page handoff-page">
    <div className="page-heading"><div><span className="eyebrow accent">Private disclosure exchange</span><h1>Share a report, keep your authority</h1><p>Exchange an encrypted report with a recipient in a separate browser. Recipient keys decrypt disclosures; they do not authorize contract transitions.</p></div></div>
    <p className="operation-notice">Use your agreed channel to confirm the recipient fingerprint. A public key alone does not establish vendor identity. Files are downloaded locally; this page does not send messages or upload disclosure packages.</p>
    <fieldset ref={fields} className="workflow-controls" disabled={working}>
      <p>Clear this panel's passwords, selected files, recipient confirmation and decrypted preview when finished. Your receiving key and saved workspace reports remain available.</p>
      <button type="button" className="secondary-button" onClick={() => {
        if (busy.current) return;
        setPassword(""); setConfirmation(""); setRestorePassword(""); setBackup(undefined);
        setRecipient(undefined); setConfirmed(false); setAttachmentFiles([]); setPackageFile(undefined); setOpened(undefined);
        setError(""); setMessage("");
        fields.current?.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(input => { input.value = ""; });
      }}>Clear exchange inputs and preview</button>
      <section className="form-panel"><h2>1. Recipient: prepare a receiving key</h2>
          <form onSubmit={(event) => void run(event, async (commit, isCurrent) => {
            if (password !== confirmation) throw new Error("Recipient backup passwords do not match");
            if (password.length < 12) throw new Error("Use a recipient backup password of at least 12 characters");
            const created = keys ?? await createRecipient();
            if (!isCurrent()) return;
            if (!keys) commit(() => onKeys(created));
            const saved = await backupRecipient(created, password);
            commit(() => { download(saved, "vulnseal-recipient-backup.json"); setPassword(""); setConfirmation(""); setMessage("Recipient backup download started. Keep it and its password private; share only the public receiving key."); });
          })}>
            <p>Create the key in the recipient's browser. The encrypted backup is required to receive packages after closing this tab.</p>
            <label>Recipient backup password<input type="password" minLength={12} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label>Confirm recipient backup password<input type="password" minLength={12} required autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <button className="primary-button">{keys ? "Save receiving key backup" : "Create receiving key and save backup"}</button>
          </form>
        {!keys ? <>
          <form onSubmit={(event) => void run(event, async (commit) => {
            const restored = await restoreRecipient(await read(backup, 16384), restorePassword);
            commit(() => { onKeys(restored); setRestorePassword(""); setMessage("Receiving key restored locally."); });
          })}>
            <h3>Restore a receiving key</h3>
            <label>Recipient backup file<input type="file" required accept=".json,application/json" onChange={(event) => setBackup(event.target.files?.[0])} /></label>
            <label>Recipient restore password<input type="password" required minLength={12} autoComplete="current-password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} /></label>
            <button className="secondary-button">Restore receiving key</button>
          </form>
        </> : <><p className="public-value">Your receiving fingerprint: <code>{keys.recipient.fingerprint}</code></p><p>This key stays in memory for this tab. Save its encrypted backup before closing; you can save it again above if encryption or download failed. Its separate backup contains no wallet or contract actor secrets.</p><button className="secondary-button" onClick={() => void run(undefined, async (commit) => { commit(() => { download(JSON.stringify(keys.recipient, null, 2), "vulnseal-recipient-public.json"); setMessage("Public receiving key download started. Verify its fingerprint with the sender through your agreed channel."); }); })}>Download public receiving key</button></>}
      </section>
      <section className="form-panel"><h2>2. Researcher: encrypt the sealed report</h2>
        <p>The package contains the report ciphertext, decryption key and commitment salt. It excludes researcher/vendor actor secrets and private triage/retest notes. The recipient will be able to read and retain the full report, including contact and attachment metadata.</p>
        {!disclosure && <p>Seal or restore a report in this tab to create a disclosure package.</p>}
        {disclosure && <p className="public-value">Report selected for disclosure: <code>{disclosure.reportId}</code>. Confirm the recipient fingerprint again when selecting a different report.</p>}
        <label>Recipient public key file<input type="file" disabled={!disclosure} accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0]; setRecipient(undefined); setConfirmed(false);
          void run(undefined, async (commit) => { const value = await parseRecipient(await read(file, 8192)); commit(() => setRecipient(value)); });
        }} /></label>
        {recipient && <p className="public-value">Recipient fingerprint: <code>{recipient.fingerprint}</code></p>}
        <label className="check-row"><input type="checkbox" checked={confirmed} disabled={!recipient} onChange={(event) => setConfirmed(event.target.checked)} /><span>I verified this fingerprint with the intended recipient through our agreed channel.</span></label>
        <label>Original attachment files to include<input key={disclosure?.reportId} type="file" multiple disabled={!disclosure} onChange={(event) => setAttachmentFiles(Array.from(event.target.files ?? []))} /></label>
        <p>Optional: include up to 50 original files, 8 MiB total. Names and bytes must match the sealed attachment metadata. The encrypted package contains these files; your workspace backup still contains metadata only.</p>
        <p>{attachmentFiles.length} original file(s) selected for encrypted transfer.</p>
        <button className="primary-button" disabled={!disclosure || !recipient || !confirmed} onClick={() => void run(undefined, async (commit) => {
          if (!disclosure || !recipient || !confirmed) return;
          const serialized = await continuationDeadline(180_000, "Disclosure packaging timed out. Keep your originals and retry explicitly.", async check => {
            if (attachmentFiles.length > 50 || attachmentFiles.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_TRANSFER_BYTES) throw new Error("Attachment transfer is limited to 50 files and 8 MiB total");
            const files = [];
            for (const file of attachmentFiles) { const bytes = new Uint8Array(await file.arrayBuffer()); check(); files.push({ filename: file.name.normalize("NFC"), bytes }); }
            const result = await encryptDisclosure(disclosure, recipient, files); check(); return result;
          });
          commit(() => { download(serialized, "vulnseal-disclosure.json"); setMessage("Encrypted disclosure downloaded. Send it to the verified recipient; keep your session recovery file private."); });
        })}>Download encrypted disclosure</button>
      </section>
      <form className="form-panel" onSubmit={(event) => void run(event, async (commit) => {
        setOpened(undefined);
        if (!keys) throw new Error("Create or restore your receiving key first");
        const result = await continuationDeadline(180_000, "Disclosure opening timed out. Retry explicitly with the encrypted package.", async check => {
          const serialized = await read(packageFile, MAX_HANDOFF_BYTES); check();
          const result = await decryptDisclosure(serialized, keys); check(); return result;
        });
        commit(() => setOpened(result));
      })}>
        <h2>3. Recipient: open the disclosure</h2>
        <label>Encrypted disclosure file<input type="file" required accept=".json,application/json" onChange={(event) => { setPackageFile(event.target.files?.[0]); setOpened(undefined); setError(""); }} /></label>
        <button className="primary-button" disabled={!keys}>Decrypt received disclosure</button>
      </form>
    </fieldset>
    {working && <p role="status">Processing disclosure material locally…</p>}
    {error && <p className="operation-notice error" role="alert">{error}</p>}
    {message && <p className="operation-notice" role="status">{message}</p>}
    {opened && <section className="panel received-disclosure">
      <p className="operation-notice">The decrypted report matches its commitment. {opened.disclosure.contractAddress ? "Network state and sender authority have not been verified by this decryption." : "This is a guided local report, with no network transaction evidence."}</p>
      <h2>{opened.report.title}</h2><p>{opened.report.affectedAsset} · {opened.report.weakness}</p>
      <h3>Summary</h3><p>{opened.report.summary}</p><h3>Impact</h3><p>{opened.report.impact}</p>
      <h3>Reproduction</h3><ol>{opened.report.reproductionSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      <h3>Suggested remediation</h3><p>{opened.report.suggestedRemediation || "Not provided"}</p>
      <h3>Researcher contact</h3><p>{opened.report.researcherContact || "Not provided"}</p>
      <AttachmentReview attachments={opened.report.attachments} />
      <h3>Verified original files in this package</h3>
      <p>{opened.attachments.length} file(s) included. Download and retain them before clearing this preview; adding the report to a workspace saves metadata, not these binary files.</p>
      {opened.attachments.map((file, index) => <button type="button" className="secondary-button" key={index} onClick={() => {
        const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes).buffer], { type: "application/octet-stream" }));
        const link = document.createElement("a"); link.href = url; link.download = file.filename.replace(/[\\/\x00-\x1f\x7f]/g, "_") || "attachment.bin";
        try { document.body.append(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      }}>Download verified attachment: {file.filename}</button>)}
      <p className="public-value">Report commitment: {opened.disclosure.reportId}</p>
      {onDisclosure && <button className="primary-button" disabled={working} onClick={() => void run(undefined, async (commit) => { await onDisclosure(opened.disclosure); commit(() => setMessage("Disclosure added to the vendor workspace after ledger verification.")); })}>Add report to vendor workspace</button>}
      {opened.disclosure.contractAddress && <a className="secondary-button" target="_blank" rel="noreferrer noopener" href={publicReceiptLink(window.location.href, { kind: "vulnseal-public-receipt", version: 1, network: opened.disclosure.network, contractAddress: opened.disclosure.contractAddress, reportId: opened.disclosure.reportId, ciphertextDigest: opened.ciphertextDigest })}>Check this report in the independent verifier</a>}
    </section>}
  </section>;
}
