// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import type { DeploymentCheckInput, DeploymentCheckResult } from "./deployment-verification.js";
import { publicEndpoints } from "./public-endpoints.js";
import type { SavedDeploymentInputs } from "./program.js";

export function DeploymentPolicyCheck({ network, transactionId, saved }: { network: string; transactionId: string; saved: SavedDeploymentInputs }) {
  const [result, setResult] = useState<DeploymentCheckResult>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const worker = useRef<Worker | undefined>(undefined), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => { worker.current?.terminate(); worker.current = undefined; clearTimeout(timer.current); };
  useEffect(() => { setResult(undefined); setError(""); setWorking(false); return stop; }, [network, transactionId, saved]);
  const check = () => {
    stop();
    setWorking(true); setResult(undefined); setError("");
    try {
      const endpoints = publicEndpoints(network);
      const active = new Worker(new URL("./deployment-policy.worker.ts", import.meta.url), { type: "module" }); worker.current = active;
      const fail = (message: string) => { if (worker.current !== active) return; stop(); setWorking(false); setError(message); };
      active.onerror = () => fail("The policy-check worker could not load or run. Keep your backup and retry when ready.");
      active.onmessageerror = () => fail("The policy-check worker returned an unreadable response.");
      active.onmessage = (event: MessageEvent<{ result?: DeploymentCheckResult; error?: string }>) => {
        if (worker.current !== active) return;
        if (event.data.error || !event.data.result) { fail(event.data.error ?? "Policy comparison returned no result"); return; }
        stop(); setWorking(false); setResult(event.data.result);
      };
      timer.current = setTimeout(() => fail("Policy comparison timed out. No recovery decision was made."), 30_000);
      active.postMessage({ transactionId, saved, endpoints } satisfies DeploymentCheckInput);
    } catch (cause) { stop(); setWorking(false); setError(cause instanceof Error ? cause.message : "Policy comparison could not start"); }
  };
  return <div><button type="button" className="secondary-button" disabled={working} onClick={() => void check()}>Compare saved deployment policy</button>
    {working && <><p>Comparing deployment in a background worker. This may take up to 30 seconds.</p><button type="button" className="secondary-button" onClick={() => { stop(); setWorking(false); }}>Cancel policy comparison</button></>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><p>{result.mismatches.length ? `Saved deployment policy differs: ${result.mismatches.join(", ")}.` : "All seven saved deployment policy fields match the historical state reported by the indexer."}</p><p className="public-value">Deployment address: {result.address} · block {result.blockHeight} · checked {result.checkedAt}</p>{result.verifiers && <div><p>Verifier keys matching this release: {result.verifiers.matched.length} of 8.</p>{result.verifiers.mismatched.length > 0 && <p>Different verifier keys: {result.verifiers.mismatched.join(", ")}.</p>}{result.verifiers.missing.length > 0 && <p>Missing entrypoints: {result.verifiers.missing.join(", ")}.</p>}{result.verifiers.unexpected.length > 0 && <p>Unexpected entrypoints: {result.verifiers.unexpected.join(", ")}.</p>}<p>This compares the key version exposed by the SDK with files served by this release. It does not prove source-to-key generation or exclude other key versions.</p></div>}<p>The state matches the initial deployment bytes with SDK-checked transaction hash and identifiers. This comparison trusts indexer/RPC inclusion and finality. It does not authenticate signatures, proofs, deployed code, constructor arguments or vendor authority, save an address, or authorize retry.</p></div>}
  </div>;
}
