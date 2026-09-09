// SPDX-License-Identifier: Apache-2.0
import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { SubmissionAttempt } from "./role-recovery.js";

const PAGE_SIZE = 10;
export function JournalEntries({ entries, label, children }: { entries: readonly SubmissionAttempt[]; label: string; children: (entry: SubmissionAttempt) => ReactNode }) {
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [entries]);
  const term = query.trim().toLowerCase();
  const filtered = [...entries].reverse().filter((entry) => !term || [entry.transactionId, entry.intent?.reportId, entry.intent?.circuit].some((value) => value?.toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  return <div>
    <label>{label}<input type="search" value={query} placeholder="Transaction ID, report ID or operation" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
    <p role="status">{filtered.length} of {entries.length} attempts match. {filtered.length ? `Page ${current + 1} of ${pages}.` : "No matching attempts."} Newest recorded entries first.</p>
    <p>Filtering does not remove history or start a network check. Changing pages closes checks for entries that leave the page.</p>
    <ul>{visible.map((entry) => <Fragment key={entry.transactionId}>{children(entry)}</Fragment>)}</ul>
    {pages > 1 && <nav aria-label={`${label} pages`}>
      <button type="button" className="secondary-button" disabled={current === 0} onClick={() => setPage(current - 1)}>Newer attempts</button>
      <button type="button" className="secondary-button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Older attempts</button>
    </nav>}
  </div>;
}
