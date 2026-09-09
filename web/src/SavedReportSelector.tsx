// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { validateDisclosure, type Disclosure } from "./handoff.js";

export function SavedReportSelector({ reports, selectedId, onChange }: { reports: readonly Disclosure[]; selectedId: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<Record<string, { title: string; asset: string }>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true; setLabels({}); setLoading(true);
    void (async () => {
      const next: typeof labels = {};
      // Sequential local decryption keeps large workspaces bounded and stops
      // starting additional work as soon as this selector is unmounted.
      for (const disclosure of reports) {
        if (!active) return;
        try {
          const { report } = await validateDisclosure(disclosure);
          next[disclosure.reportId] = { title: report.title, asset: report.affectedAsset };
        } catch { /* Never display unauthenticated title metadata. The ID remains selectable. */ }
      }
      if (active) { setLabels(next); setLoading(false); }
    })();
    return () => { active = false; };
  }, [reports]);
  const search = query.trim().toLocaleLowerCase();
  const matches = (entry: Disclosure) => !search || [entry.reportId, labels[entry.reportId]?.title ?? "", labels[entry.reportId]?.asset ?? ""].some((value) => value.toLocaleLowerCase().includes(search));
  const matching = reports.filter(matches);
  const shown = reports.filter((entry) => entry.reportId === selectedId || matches(entry));
  return <div>
    <label>Find saved reports<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, affected asset or report ID" /></label>
    <p>Titles are read from authenticated ciphertext on this device and remain private to this unlocked workspace.</p>
    {loading && <p role="status">Reading saved report titles locally…</p>}
    {search && <p role="status">{matching.length} of {reports.length} reports match. The selected report remains available.</p>}
    <label>Workspace report<select value={selectedId} onChange={(event) => onChange(event.target.value)}><option value="">Choose a saved report</option>{shown.map((entry) => <option value={entry.reportId} key={entry.reportId}>{labels[entry.reportId]?.title ? `${labels[entry.reportId]!.title.slice(0, 120)} — ` : ""}{entry.reportId}{!matches(entry) ? " (selected; outside search)" : ""}</option>)}</select></label>
  </div>;
}
