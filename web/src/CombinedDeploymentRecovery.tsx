// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { captureDeploymentInputs, programConstructor, type SavedDeploymentInputs } from "./program.js";
import { hexToBytes, utf8 } from "@vulnseal/shared";
import type { RecoverySnapshot } from "./recovery.js";
import { DeploymentPolicyCheck } from "./DeploymentPolicyCheck.js";

export function CombinedDeploymentRecovery({ snapshot, onRecover }: { snapshot: RecoverySnapshot; onRecover: (address: string, password: string) => Promise<void> }) {
  const [saved, setSaved] = useState<SavedDeploymentInputs>();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    setSaved(undefined); setAddress(""); setError("");
    void programConstructor(hexToBytes(snapshot.programId), snapshot.policy).then(value => {
      if (active) setSaved(captureDeploymentInputs(value));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Saved policy could not be checked"); });
    return () => { active = false; };
  }, [snapshot.programId, snapshot.policy, snapshot.network, snapshot.deploymentTransactionId]);
  return <section aria-label="Recover checked deployment">
    <h2>Recover the deployed program</h2>
    <p>First compare the saved policy and this release's verifier keys with the historical deployment. Then connect Lace to check the current program and owner authority. A new encrypted browser copy must be saved before this session opens. This does not submit another deployment.</p>
    {saved && snapshot.deploymentTransactionId && <DeploymentPolicyCheck key={`${snapshot.network}:${snapshot.deploymentTransactionId}`} network={snapshot.network} transactionId={snapshot.deploymentTransactionId} saved={saved} onChooseVerifiedAddress={setAddress} />}
    {address && <form onSubmit={event => {
      event.preventDefault(); if (busy.current) return;
      if (password.length < 12 || utf8(password).length > 1024) { setError("Use a backup password of 12 characters or more, at most 1024 UTF-8 bytes"); return; }
      if (password !== confirmation) { setError("Recovery backup passwords do not match"); return; }
      busy.current = true; setWorking(true); setError("");
      void onRecover(address, password).catch(cause => setError(cause instanceof Error ? cause.message : "Deployment recovery failed")).finally(() => { busy.current = false; setWorking(false); });
    }}>
      <p className="public-value">Checked deployment address: {address}</p>
      <label>Recovered deployment backup password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>Confirm recovered deployment backup password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      <button type="submit" className="primary-button" disabled={working}>{working ? "Recovering deployment…" : "Connect, verify and save recovered deployment"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
