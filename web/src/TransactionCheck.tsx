// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { compareTransactionIntent, observeTransaction, type TransactionObservation } from "./transaction-verification.js";
import { publicEndpoints } from "./public-endpoints.js";

export function TransactionCheck({ network, transactionId, contractAddress, circuit }: { readonly network: string; readonly transactionId: string; readonly contractAddress?: string | null; readonly circuit?: string | undefined }) {
  const [result, setResult] = useState<TransactionObservation>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => { setResult(undefined); setError(""); setWorking(false); return () => controller.current?.abort(); }, [network, transactionId, contractAddress, circuit]);
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
        <p>{({
          unavailable: "Contract actions were not supplied by this indexer; operation comparison is unavailable.",
          "unknown-intent": "The backup lacks a contract address or recorded circuit. Review the indexer's actions below; they are not automatically linked to this workspace.",
          match: "The indexer lists one action for the recorded contract and circuit. This does not verify the report identifier or the intended outcome.",
          mismatch: "The indexer's actions do not match the recorded contract and circuit. Do not treat this transaction as completion of the recorded operation.",
          ambiguous: "The indexer lists multiple actions for this contract and circuit. The recorded operation cannot be uniquely identified.",
        } as const)[compareTransactionIntent(result.contractActions, contractAddress, circuit)]}</p>
        {result.contractActions && <><h4>Contract actions reported by the indexer</h4>{result.contractActions.length ? <ul>{result.contractActions.map((action, index) => <li key={index} className="public-value">{action.kind === "ContractDeploy" ? "Deployment" : action.kind === "ContractUpdate" ? "Contract update" : `Call ${action.entryPoint}`}: {action.address}</li>)}</ul> : <p>No contract actions reported.</p>}</>}
      </>}
      <p>Checked {result.checkedAt}. Source: {result.indexerUrl}. This observation trusts the indexer/RPC and does not authenticate the circuit or establish retry safety.</p>
    </div>}
  </div>;
}
