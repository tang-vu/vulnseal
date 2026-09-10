// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { compareProgramPolicy, validateProgramPolicy, type ObservedProgramPolicy } from "@vulnseal/api/program-policy";

const labels = { scopeDigest: "Scope digest", responsePolicyDigest: "Response policy digest", rewardPolicyDigest: "Reward policy digest", disclosurePolicyDigest: "Disclosure policy digest", responseDays: "Response days", disclosureDays: "Disclosure days" };
export function PublicPolicyCheck({ observed }: { readonly observed: ObservedProgramPolicy }) {
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof compareProgramPolicy>>>();
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const current = useRef(0);
  useEffect(() => {
    current.current++; setComparison(undefined); setError(""); setWorking(false);
    return () => { current.current++; };
  }, [observed]);
  const read = async (file?: File) => {
    const generation = ++current.current; setComparison(undefined); setError(""); setWorking(false);
    if (!file) return;
    setWorking(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Public policy file is too large");
      const text = await file.text();
      if (generation !== current.current) return;
      const policy = validateProgramPolicy(JSON.parse(text));
      const result = await compareProgramPolicy(policy, observed);
      if (generation === current.current) setComparison(result);
    } catch (cause) { if (generation === current.current) setError(cause instanceof Error ? cause.message : "Cannot compare public policy"); }
    finally { if (generation === current.current) setWorking(false); }
  };
  return <section className="panel" aria-label="Public program policy">
    <h2>Program policy commitments</h2>
    <dl>{Object.entries(labels).map(([field, label]) => <div key={field}><dt>{label}</dt><dd className="public-value"><code>{observed[field as keyof typeof labels]}</code></dd></div>)}</dl>
    <p>Compare a public policy JSON file locally with this observed program. Use only name, primaryScope, additionalScope, responseDays, disclosureDays and rewardPolicy. Keep private reports and recovery files out of this input.</p>
    <label>Compare public program policy<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void read(file); }} /></label>
    {working && <p role="status">Comparing public policy...</p>}
    {error && <p role="alert">{error}</p>}
    {comparison && <div role="status"><h3>{comparison.matches ? "All six policy fields match" : "Policy differs from observed state"}</h3><ul>{comparison.fields.map(field => <li key={field.field}>{labels[field.field]}: {field.matches ? "Matches" : "Differs"}</li>)}</ul></div>}
    <p>Comparison uses exact text, including whitespace. The name is display metadata and is not committed. A match does not establish vendor ownership, testing permission or authenticated state.</p>
  </section>;
}
