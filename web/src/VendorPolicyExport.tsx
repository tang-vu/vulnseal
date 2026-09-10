// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { compareProgramPolicy, type ProgramPolicy } from "@vulnseal/api/program-policy";
import { readProgramForm, type ProgramDraft } from "./program.js";
import { verifyPublicContractInWorker as verifyPublicContract } from "./public-verification-worker.js";
import { publicEndpoints } from "./public-endpoints.js";
const labels = { scopeDigest: "Scope", responsePolicyDigest: "Response policy", rewardPolicyDigest: "Reward policy", disclosurePolicyDigest: "Disclosure policy", responseDays: "Response days", disclosureDays: "Disclosure days" };

export function VendorPolicyExport({ draft, network, contractAddress, programId, onDownload }: {
  readonly draft: ProgramDraft | null | undefined; readonly network: string; readonly contractAddress: string;
  readonly programId: string; readonly onDownload: (serialized: string) => void;
}) {
  const [review, setReview] = useState<{ policy: ProgramPolicy; matched: boolean; differences: string[]; block: number; checkedAt: string }>();
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const current = useRef<AbortController | undefined>(undefined);
  const stop = () => { current.current?.abort(); current.current = undefined; setWorking(false); };
  useEffect(() => { stop(); setReview(undefined); setError(""); return () => current.current?.abort(); }, [draft, network, contractAddress, programId]);
  const check = async () => {
    stop(); setReview(undefined); setError("");
    if (!draft) return;
    const controller = new AbortController(); current.current = controller; setWorking(true);
    try {
      const form = new FormData(); for (const [key, value] of Object.entries(draft)) form.set(key, value);
      const policy = readProgramForm(form);
      const observed = await verifyPublicContract(contractAddress, publicEndpoints(network), controller.signal);
      if (controller.signal.aborted) return;
      if (observed.programId !== programId) throw new Error("Observed program differs from this vendor workspace");
      const compared = await compareProgramPolicy(policy, observed);
      if (!controller.signal.aborted) setReview({ policy, matched: compared.matches, differences: compared.fields.filter(field => !field.matches).map(field => labels[field.field]), block: observed.blockHeight, checkedAt: observed.checkedAt });
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Cannot check public policy"); }
    finally { if (current.current === controller) { current.current = undefined; setWorking(false); } }
  };
  return <section aria-label="Share program policy">
    <h3>Share program policy</h3>
    <p>Check the saved policy draft against public state, review the text, then download a public JSON file for researchers. This lookup does not connect Lace or submit a transaction.</p>
    {!draft && <p>This backup has no saved program policy draft. Recover the original policy text; its commitments cannot reconstruct it.</p>}
    <button type="button" disabled={!draft || working} onClick={() => void check()}>Check public policy for sharing</button>
    {working && <><p role="status">Checking public policy...</p><button type="button" onClick={stop}>Cancel policy check</button></>}
    {error && <p role="alert">{error}</p>}
    {review && <><p role="status">{review.matched ? "All six policy fields match the observed program." : "Saved policy differs from observed state. Recover the matching policy before sharing."}</p>
      {!review.matched && <p>Differences: {review.differences.join(", ")}</p>}
      <p>Compared at block {review.block}, checked {review.checkedAt}. This comparison trusts the selected indexer and RPC.</p>
      <pre className="public-value">{JSON.stringify(review.policy, null, 2)}</pre>
      <p>Only the six displayed policy fields are exported. The name is uncommitted display metadata. Sharing this file does not establish ownership or testing permission.</p>
      <button type="button" disabled={!review.matched} onClick={() => { setError(""); try { onDownload(JSON.stringify(review.policy, null, 2)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Policy download failed"); } }}>Download public program policy</button>
    </>}
  </section>;
}
