// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { fetchPublicRelease, releaseReferenceText, type PublicReleaseReference } from "./github-repository.js";

export function GitHubReleaseImport({ onAppend }: { onAppend: (text: string) => boolean | void }) {
  const [url, setUrl] = useState(""), [error, setError] = useState("");
  const [reference, setReference] = useState<PublicReleaseReference>();
  const [pending, setPending] = useState(false);
  const current = useRef<AbortController | undefined>(undefined);
  const stop = () => { current.current?.abort(); current.current = undefined; setPending(false); };
  useEffect(() => () => { current.current?.abort(); current.current = undefined; }, []);
  const lookup = async () => {
    stop(); setError(""); setReference(undefined);
    const controller = new AbortController(); current.current = controller; setPending(true);
    try { const result = await fetchPublicRelease(url, controller.signal); if (current.current === controller) setReference(result); }
    catch (cause) { if (current.current === controller) setError(cause instanceof Error ? cause.message : "Release lookup failed"); }
    finally { if (current.current === controller) { current.current = undefined; setPending(false); } }
  };
  return <section aria-label="Import public GitHub patch release">
    <h3>Add a public release reference</h3>
    <p>Only the repository and tag are sent to GitHub. Review before appending to this report's private notes. Anchor patch hashes the complete notes, including existing text; it does not verify that the release fixes the report or hash downloaded patch files.</p>
    <label>Public GitHub release URL<input type="text" inputMode="url" maxLength={1200} value={url} placeholder="https://github.com/owner/repository/releases/tag/v1.0.0" onChange={event => { stop(); setReference(undefined); setError(""); setUrl(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!pending && url.trim()) void lookup(); } }} /></label>
    <button type="button" disabled={pending || !url.trim()} onClick={() => void lookup()}>Look up public release</button>
    {pending && <><p role="status">Looking up release and tag commit…</p><button type="button" onClick={stop}>Cancel release lookup</button></>}
    {error && <p role="alert">{error}</p>}
    {reference && <div role="status"><p>{reference.repository} — {reference.prerelease ? "Prerelease" : "Published release"}</p><pre className="public-value">{releaseReferenceText(reference)}</pre><p>GitHub-reported metadata and tag commit may change. Assets and source diffs were not downloaded.</p><button type="button" onClick={() => {
      setError("");
      try {
        if (onAppend(releaseReferenceText(reference)) === false) { setError("Release reference was not appended. Review the notes error and try again."); return; }
        setReference(undefined);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Release reference could not be appended"); }
    }}>Append release reference to notes</button></div>}
  </section>;
}
