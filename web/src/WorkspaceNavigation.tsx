// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";

/** Fragment navigation must not silently replace a live workspace or its authority. */
export function WorkspaceNavigation({ initialUrl }: { readonly initialUrl: string }) {
  const [requested, setRequested] = useState<string>();
  useEffect(() => {
    const changed = () => {
      if (window.location.href === initialUrl) return;
      const next = window.location.href;
      // Restore the address that loaded this workspace without a reload or another hash event.
      window.history.replaceState(window.history.state, "", initialUrl);
      setRequested(next);
    };
    window.addEventListener("hashchange", changed);
    changed();
    return () => window.removeEventListener("hashchange", changed);
  }, [initialUrl]);
  if (!requested) return null;
  return <aside className="workspace-navigation" aria-label="Requested workspace link">
    <p role="status">A new workspace link was requested. Your current workspace is still open.</p>
    <a className="primary-button" href={requested} target="_blank" rel="noopener noreferrer">Open requested link in a new tab</a>
    <button className="secondary-button" onClick={() => setRequested(undefined)}>Keep working here</button>
  </aside>;
}
