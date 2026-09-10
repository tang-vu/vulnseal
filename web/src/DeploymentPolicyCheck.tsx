// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { compareDeploymentPolicy } from "./deployment-verification.js";
import { publicEndpoints } from "./public-endpoints.js";
import type { SavedDeploymentInputs } from "./program.js";

export function DeploymentPolicyCheck({ network, transactionId, saved }: { network: string; transactionId: string; saved: SavedDeploymentInputs }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof compareDeploymentPolicy>>>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => { setResult(undefined); setError(""); setWorking(false); return () => active.current?.abort(); }, [network, transactionId, saved]);
  const check = async () => {
    active.current?.abort(); const pending = new AbortController(); active.current = pending;
    setWorking(true); setResult(undefined); setError("");
    try { const value = await compareDeploymentPolicy(transactionId, saved, publicEndpoints(network), pending.signal); if (!pending.signal.aborted) setResult(value); }
    catch (cause) { if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "Deployment policy comparison failed"); }
    finally { if (active.current === pending) setWorking(false); }
  };
  return <div><button type="button" className="secondary-button" disabled={working} onClick={() => void check()}>Compare saved deployment policy</button>
    {working && <button type="button" className="secondary-button" onClick={() => { active.current?.abort(); setWorking(false); }}>Cancel policy comparison</button>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><p>{result.mismatches.length ? `Saved deployment policy differs: ${result.mismatches.join(", ")}.` : "All seven saved deployment policy fields match the historical state reported by the indexer."}</p><p className="public-value">Deployment address: {result.address} · block {result.blockHeight} · checked {result.checkedAt}</p><p>The state matches the initial deployment bytes with SDK-checked transaction hash and identifiers. This comparison trusts indexer/RPC inclusion and finality. It does not authenticate signatures, proofs, deployed code, constructor arguments or vendor authority, save an address, or authorize retry.</p></div>}
  </div>;
}
