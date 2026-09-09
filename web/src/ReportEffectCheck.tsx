// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import type { ReportCheckInput, ReportCheckResult } from "./report-reconciliation.js";
import { publicReplayEndpoints } from "./public-endpoints.js";
import { SavedDecisionCheck } from "./SavedDecisionCheck.js";
import { SavedRetestCheck } from "./SavedRetestCheck.js";
import { SavedCiphertextCheck } from "./SavedCiphertextCheck.js";
import type { ReportNotes } from "./role-recovery.js";

export function ReportEffectCheck({ network, transactionId, contractAddress, programId, reportId, circuit, savedNotes, savedEnvelope, savedRetestPassed }: Omit<ReportCheckInput, "indexerUrl" | "rpcUrl" | "websocketUrl"> & { network: string; savedNotes?: ReportNotes | null | undefined; savedEnvelope?: string | undefined; savedRetestPassed?: boolean | null | undefined }) {
  const worker = useRef<Worker | undefined>(undefined), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<ReportCheckResult>();
  const stop = () => { worker.current?.terminate(); worker.current = undefined; clearTimeout(timer.current); };
  useEffect(() => { setWorking(false); setResult(undefined); setError(""); return stop; }, [network, transactionId, contractAddress, programId, reportId, circuit]);
  const check = () => {
    stop(); setResult(undefined); setError(""); setWorking(true);
    try {
      const endpoints = publicReplayEndpoints(network);
      const active = new Worker(new URL("./report-replay.worker.ts", import.meta.url), { type: "module" }); worker.current = active;
      const failed = (message: string) => { if (worker.current !== active) return; stop(); setWorking(false); setError(message); };
      active.onerror = () => failed("The report-check worker could not load or run. Keep your backup and retry when ready.");
      active.onmessage = (event: MessageEvent<{ error?: string; result?: ReportCheckResult }>) => {
        if (worker.current !== active) return;
        if (event.data.error || !event.data.result) { failed(event.data.error ?? "Report check returned no result"); return; }
        stop(); setWorking(false); setResult(event.data.result);
      };
      timer.current = setTimeout(() => failed("Report check timed out; no recovery decision was made."), 90_000);
      active.postMessage({ transactionId, contractAddress, programId, reportId, circuit, ...endpoints } satisfies ReportCheckInput);
    } catch (cause) { stop(); setWorking(false); setError(cause instanceof Error ? cause.message : "Report check could not start"); }
  };
  return <details><summary>Reconcile this report operation</summary>
    <p>Read public transaction history and replay its report changes on this device. This may download SDK components and take up to 90 seconds. No wallet connection or resubmission is performed.</p>
    <button type="button" className="secondary-button" disabled={working} onClick={check}>Check report effects</button>
    {working && <><p role="status">Checking report history and replaying the transaction…</p><button type="button" className="secondary-button" onClick={() => { stop(); setWorking(false); setError("Report check cancelled. No recovery decision was made."); }}>Cancel report check</button></>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><p>Replayed report change: {result.before} → {result.after}</p><p>Compared states at blocks {result.previousBlockHeight} and {result.blockHeight}, after reading {result.actionsRead} contract actions. Checked {result.checkedAt}.</p><p>This replay matches the recorded program and report using indexer data and RPC block checks. It does not authenticate proofs, deployed code or history completeness, verify every intended argument, transfer funds, or make retry safe.</p></div>}
    {result && (circuit === "submitReport" ? <SavedCiphertextCheck envelope={savedEnvelope} digest={result.publicValues?.ciphertextDigest} /> : circuit === "submitRetest" ? <SavedRetestCheck reportId={reportId} notes={savedNotes} passed={savedRetestPassed} values={result.publicValues} /> : <SavedDecisionCheck circuit={circuit} reportId={reportId} notes={savedNotes} values={result.publicValues} />)}
  </details>;
}
