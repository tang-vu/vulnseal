// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { observeTransaction, type TransactionObservation } from "./transaction-verification.js";
import { publicEndpoints } from "./public-endpoints.js";

export function TransactionCheck({ network, transactionId }: { readonly network: string; readonly transactionId: string }) {
  const [result, setResult] = useState<TransactionObservation>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => { setResult(undefined); setError(""); setWorking(false); return () => controller.current?.abort(); }, [network, transactionId]);
  const check = async () => {
    controller.current?.abort(); const pending = new AbortController(); controller.current = pending;
    setResult(undefined); setError(""); setWorking(true);
    try { const observed = await observeTransaction(transactionId, publicEndpoints(network), pending.signal); if (!pending.signal.aborted) setResult(observed); }
    catch (cause) { if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "Transaction lookup failed"); }
    finally { if (controller.current === pending) setWorking(false); }
  };
  return <div>
    <button type="button" className="secondary-button" disabled={working} onClick={() => void check()}>{working ? "Checking transaction…" : "Check transaction status"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      {result.kind === "not-found" ? <p>Not found by this indexer. The outcome is unknown; this does not prove rejection or make resubmission safe.</p> : <>
        <p>{result.kind === "finalized" ? "Finalized transaction" : "Included; awaiting finality"} · indexer result: {result.status}</p>
        <p>Block {result.blockHeight} · RPC finalized head {result.finalizedHead}</p>
        <p className="public-value">Transaction hash: {result.transactionHash}</p>
      </>}
      <p>Checked {result.checkedAt}. Source: {result.indexerUrl}. This observation trusts the indexer/RPC and does not authenticate the circuit or establish retry safety.</p>
    </div>}
  </div>;
}
