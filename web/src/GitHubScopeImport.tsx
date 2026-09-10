// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { fetchPublicRepository, type PublicRepositoryReference } from "./github-repository.js";

export function GitHubScopeImport({ onApply }: { onApply: (url: string) => void }) {
  const [url, setUrl] = useState(""), [error, setError] = useState("");
  const [reference, setReference] = useState<PublicRepositoryReference>();
  const [pending, setPending] = useState(false);
  const current = useRef<AbortController | undefined>(undefined);
  const stop = () => { current.current?.abort(); current.current = undefined; setPending(false); };
  useEffect(() => () => { current.current?.abort(); current.current = undefined; }, []);
  const lookup = async () => {
    stop(); setError(""); setReference(undefined);
    const controller = new AbortController(); current.current = controller; setPending(true);
    try { const result = await fetchPublicRepository(url, controller.signal); if (current.current === controller) setReference(result); }
    catch (cause) { if (current.current === controller) setError(cause instanceof Error ? cause.message : "Repository lookup failed"); }
    finally { if (current.current === controller) { current.current = undefined; setPending(false); } }
  };
  return <section aria-label="Import public GitHub scope">
    <h3>Import a public repository as scope</h3>
    <p>Lookup sends only the repository coordinates to GitHub. Review the result before replacing your primary scope. A public repository listing does not establish testing permission or vendor ownership.</p>
    <label>Public GitHub repository URL<input type="text" inputMode="url" value={url} maxLength={180} placeholder="https://github.com/owner/repository" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!pending && url.trim()) void lookup(); } }} onChange={event => { stop(); setReference(undefined); setError(""); setUrl(event.target.value); }} /></label>
    <button type="button" disabled={pending || !url.trim()} onClick={() => void lookup()}>Look up public repository</button>
    {pending && <><p role="status">Looking up public repository…</p><button type="button" onClick={stop}>Cancel repository lookup</button></>}
    {error && <p role="alert">{error}</p>}
    {reference && <div role="status"><p>{reference.fullName} — {reference.archived ? "Archived repository" : "Public repository"}</p><p className="public-value">{reference.url}</p><button type="button" onClick={() => { onApply(reference.url); setReference(undefined); }}>Use repository as primary scope</button></div>}
  </section>;
}
