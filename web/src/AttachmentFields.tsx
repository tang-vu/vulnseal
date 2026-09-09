// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import type { AttachmentDigest } from "@vulnseal/shared";
import { attachmentMetadata, hashAttachment, MAX_ATTACHMENTS } from "./attachments.js";
import { emptyAttachmentDraft, validateAttachmentDraft, type AttachmentDraft } from "./attachment-draft.js";

export function AttachmentEditor({ attachments, onChange, onPending, draft, onDraftChange }: {
  readonly attachments: readonly AttachmentDigest[];
  readonly onChange: (value: readonly AttachmentDigest[]) => void;
  readonly onPending: (value: boolean) => void;
  readonly draft?: AttachmentDraft | undefined;
  readonly onDraftChange?: ((value: AttachmentDraft) => void) | undefined;
}) {
  const [localFields, setLocalFields] = useState(emptyAttachmentDraft);
  const fields = draft ?? localFields;
  const setFields = (next: AttachmentDraft) => {
    try { const value = validateAttachmentDraft(next); if (onDraftChange) onDraftChange(value); else setLocalFields(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid attachment draft"); }
  };
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const latest = useRef({ attachments, onChange }); latest.current = { attachments, onChange };
  const dirty = Object.values(fields).some(Boolean);
  useEffect(() => { onPending(working || dirty); }, [working, dirty, onPending]);
  useEffect(() => () => { generation.current++; }, []);
  const add = (attachment: AttachmentDigest) => {
    const current = latest.current;
    if (current.attachments.length >= MAX_ATTACHMENTS) throw new Error("A report can contain up to 50 attachment entries in this editor");
    if (current.attachments.some((item) => item.sha256 === attachment.sha256 && item.filename === attachment.filename)) throw new Error("This filename and digest are already attached");
    current.onChange([...current.attachments, attachment]);
  };
  const clear = () => { setFields({ filename: "", mediaType: "", size: "", digest: "" }); setError(""); };
  return <section className="attachment-editor" aria-label="Attachment metadata">
    <h2>Attachment digests</h2>
    <p>Choose a file to compute SHA-256 locally (up to 32 MiB), or enter metadata below. Only the filename, media type, byte size and digest enter the encrypted report. File contents are not uploaded or included in backups; keep and share the original through your agreed secure channel.</p>
    <label>Hash a local attachment<input type="file" disabled={working || dirty} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      const pending = ++generation.current; setWorking(true); setError("");
      try { const entry = await hashAttachment(file); if (pending === generation.current) add(entry); }
      catch (cause) { if (pending === generation.current) setError(cause instanceof Error ? cause.message : "Could not read the selected file"); }
      finally { if (pending === generation.current) setWorking(false); }
    }} /></label>
    {working && <><p role="status">Computing attachment digest locally…</p><button type="button" className="secondary-button" onClick={() => {
      generation.current++; setWorking(false); setError("");
    }}>Cancel hashing</button></>}
    <details><summary>Enter an existing digest</summary>
      <div className="field-grid">
        {([ ["filename", "Attachment filename"], ["mediaType", "Attachment media type"], ["size", "Attachment size in bytes"], ["digest", "Attachment SHA-256"] ] as const).map(([key, label]) => <label key={key}>{label}<input disabled={working} value={fields[key]} spellCheck={false} inputMode={key === "size" ? "numeric" : undefined} onChange={(event) => { setError(""); setFields({ ...fields, [key]: event.target.value }); }} /></label>)}
      </div>
      <div className="button-row"><button type="button" className="secondary-button" disabled={working} onClick={() => {
        try { add(attachmentMetadata(fields.filename, fields.mediaType, fields.size, fields.digest)); clear(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid attachment"); }
      }}>Add attachment metadata</button><button type="button" className="secondary-button" onClick={clear}>Clear attachment fields</button></div>
    </details>
    {dirty && <p role="status">Add this metadata or clear its fields before sealing. {onDraftChange ? "These pending fields are part of the private draft; save its encrypted backup before leaving." : "Unadded fields are not saved in a backup."}</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p>{attachments.length} attachment entry(s)</p>
    {attachments.map((item, index) => <article className="attachment-entry" key={`${index}:${item.sha256}`}>
      <AttachmentDetails item={item} />
      <button type="button" className="secondary-button" onClick={() => onChange(attachments.filter((_, position) => position !== index))}>Remove {item.filename}</button>
    </article>)}
  </section>;
}

function AttachmentDetails({ item }: { readonly item: AttachmentDigest }) {
  return <><strong className="public-value">{item.filename}</strong><p>{item.mediaType} · {item.size} bytes</p><code className="public-value">{item.sha256}</code></>;
}

function AttachmentCheck({ item }: { readonly item: AttachmentDigest }) {
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  return <article className="attachment-entry"><AttachmentDetails item={item} />
    <label>Check local file against {item.filename}<input type="file" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      const pending = ++generation.current; setWorking(true); setMessage("Checking file locally…");
      try {
        const candidate = await hashAttachment(file);
        if (pending === generation.current) setMessage(candidate.sha256 === item.sha256 && candidate.size === item.size ? "File bytes match the sealed attachment digest and size." : "File does not match the sealed attachment digest and size.");
      } catch (cause) { if (pending === generation.current) setMessage(cause instanceof Error ? cause.message : "Could not read this file"); }
      finally { if (pending === generation.current) setWorking(false); }
    }} /></label>
    {working && <button type="button" className="secondary-button" onClick={() => {
      generation.current++; setWorking(false); setMessage("File check canceled. No comparison was made.");
    }}>Cancel file check</button>}
    {message && <p role="status">{message}</p>}
  </article>;
}

export function AttachmentReview({ attachments }: { readonly attachments: readonly AttachmentDigest[] }) {
  return <section className="report-section"><h3>Sealed attachment metadata</h3><p>Original files are exchanged separately. Check received files locally against their sealed SHA-256 and byte size; filenames and media types are descriptive only. Local checking supports files up to 32 MiB.</p>
    {attachments.length === 0 ? <p>No attachments recorded.</p> : attachments.map((item, index) => <AttachmentCheck key={JSON.stringify([index, item.filename, item.mediaType, item.size, item.sha256])} item={item} />)}
  </section>;
}
