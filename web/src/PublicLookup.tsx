// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent } from "react";
import { publicStatusLabel } from "@vulnseal/shared";
import { parsePublicReceipt, publicHex, publicReceiptLink, verifyPublicContract, type PublicVerification } from "./public-verification.js";
import { workflowStatement } from "./workflow.js";

import { publicEndpoints } from "./public-endpoints.js";

export function PublicLookup() {
  const params = new URLSearchParams(window.location.hash.replace(/^#verify\?/, ""));
  const [network, setNetwork] = useState(params.get("network") ?? "preprod");
  const [address, setAddress] = useState(params.get("contract") ?? "");
  const [reportId, setReportId] = useState(params.get("report") ?? "");
  const [expectedDigest, setExpectedDigest] = useState(params.get("ciphertext") ?? "");
  const [result, setResult] = useState<PublicVerification>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const invalidate = () => { controller.current?.abort(); setWorking(false); setResult(undefined); setError(""); setShareLink(""); };
  const load = async (event: FormEvent) => {
    event.preventDefault(); invalidate();
    const pending = new AbortController(); controller.current = pending; setWorking(true);
    try {
      const id = reportId.trim() ? publicHex(reportId) : undefined;
      const expected = expectedDigest.trim() ? publicHex(expectedDigest) : undefined;
      const endpoints = publicEndpoints(network);
      const verified = await verifyPublicContract(address, endpoints, pending.signal);
      if (pending.signal.aborted) return;
      const selected = id ? verified.reports.find((entry) => entry.reportId === id) : undefined;
      if (id && !selected) throw new Error("Report not found in this contract");
      if (expected && (!selected || selected.ciphertextDigest !== expected)) throw new Error("The receipt ciphertext digest does not match the ledger report");
      setResult(verified);
      if (selected) setShareLink(publicReceiptLink(window.location.href, { kind: "vulnseal-public-receipt", version: 1, network, contractAddress: verified.contractAddress, reportId: selected.reportId, ciphertextDigest: selected.ciphertextDigest }));
    } catch (cause) {
      if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "Public lookup failed");
    } finally { if (controller.current === pending) setWorking(false); }
  };
  const reports = result?.reports.filter((entry) => !reportId.trim() || entry.reportId === publicHex(reportId)) ?? [];
  return <section className="page narrow-page public-lookup">
    <div className="page-heading"><div><span className="eyebrow accent">Independent public lookup</span><h1>Verify without private keys</h1><p>Read contract state from the indexer and cross-check its block against the RPC finalized chain. No wallet or report decryption is required.</p></div></div>
    <form className="form-panel" onSubmit={(event) => void load(event)}>
      <label>Public network<select value={network} onChange={(event) => { invalidate(); setNetwork(event.target.value); }}><option value="preprod">Midnight Preprod</option><option value="local">Local Midnight node</option>{!["preprod", "local"].includes(network) && <option value={network}>{network}</option>}</select></label>
      <label>Contract address<input value={address} required spellCheck={false} onChange={(event) => { invalidate(); setAddress(event.target.value); }} /></label>
      <label>Report commitment (optional)<input value={reportId} spellCheck={false} onChange={(event) => { invalidate(); setReportId(event.target.value); setExpectedDigest(""); }} /></label>
      <label>Expected ciphertext digest (optional)<input value={expectedDigest} spellCheck={false} onChange={(event) => { invalidate(); setExpectedDigest(event.target.value); }} /></label>
      <label>Import public receipt<input type="file" accept=".json,application/json" onChange={async (event) => {
        invalidate(); const file = event.target.files?.[0]; if (!file) return;
        const pending = new AbortController(); controller.current = pending;
        try {
          if (file.size > 8192) throw new Error("Public receipt is too large. Do not import private recovery files here.");
          const receipt = parsePublicReceipt(await file.text());
          if (pending.signal.aborted) return;
          setNetwork(receipt.network); setAddress(receipt.contractAddress); setReportId(receipt.reportId); setExpectedDigest(receipt.ciphertextDigest);
        } catch (cause) { if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "Invalid receipt"); }
      }} /></label>
      <button className="primary-button" disabled={working}>{working ? "Checking public state…" : "Load public state"}</button>
    </form>
    {error && <div role="alert" className="operation-notice error"><strong>{error}</strong></div>}
    {working && <div role="status" className="operation-notice">Checking indexer state and RPC finality…</div>}
    {result && <>
      <section className="panel"><h2>Finalized public state</h2><p>Contract block {result.blockHeight} · finalized head {result.finalizedHead}</p><p>Checked {result.checkedAt}. This is a snapshot; load again to refresh.</p><p className="public-value">Source: {result.indexerUrl}</p><p className="public-value">Contract: {result.contractAddress}</p><p className="public-value">Program: {result.programId}</p><p>{result.reports.length} report(s) in this contract.</p></section>
      {reports.slice(0, 100).map((report) => <section className="panel" key={report.reportId}>
        <h2>{publicStatusLabel[report.status]}</h2><p>{workflowStatement[report.status]}</p>
        <dl>{Object.entries({ "Report commitment": report.reportId, "Ciphertext digest": report.ciphertextDigest, "Patch commitment": report.patchCommitment, "Retest commitment": report.retestCommitment, "Payout authorization": report.payoutReceipt }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="public-value"><code>{/^0+$/.test(value) ? "Not recorded" : value}</code></dd></div>)}</dl>
        <p>Created sequence {report.createdSequence} · updated sequence {report.updatedSequence}</p>
        {!reportId && <button className="secondary-button" onClick={() => { invalidate(); setReportId(report.reportId); setExpectedDigest(report.ciphertextDigest); }}>Select this report</button>}
      </section>)}
      {reports.length > 100 && <p>Showing the first 100 reports. Enter a specific commitment to inspect another report.</p>}
      {shareLink && <label>Public verification link<input readOnly value={shareLink} onFocus={(event) => event.target.select()} /></label>}
      <div className="not-proven"><p>The state is decoded using the VulnSeal schema. This lookup trusts the selected indexer and RPC, does not authenticate deployed circuit code, and does not prove exploit validity or a funds transfer. No historical steps are inferred from this snapshot.</p></div>
    </>}
  </section>;
}
