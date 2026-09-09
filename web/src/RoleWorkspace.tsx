// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent } from "react";
import { VulnSealApi } from "@vulnseal/api/api";
import { RoleSession, type RoleCommand } from "@vulnseal/api/role-session";
import { CipherstoreClient } from "@vulnseal/api/cipherstore-client";
import type { PublicContractSnapshot, TransactionEvidence } from "@vulnseal/api/types";
import { createVulnSealPrivateState, pureCircuits } from "@vulnseal/contract";
import { bytesToHex, canonicalizeReport, contractStatusName, hexToBytes, randomBytes, sealReport, sha256, utf8, validateEnvironment, type VulnerabilityReport } from "@vulnseal/shared";
import { initializeBrowserProviders } from "./midnight/browser-providers.js";
import { defaultProgram, programConstructor, readProgramForm } from "./program.js";
import { decryptRoleVault, encryptRoleVault, MAX_ROLE_BACKUP_BYTES, parseInvitation, validateRoleVault, type RoleVault } from "./role-recovery.js";
import { joinRoleVault } from "./role-network.js";
import { HandoffPanel } from "./HandoffPanel.js";
import { validateDisclosure, type Disclosure, type RecipientKeys } from "./handoff.js";
import { ReportWizard } from "./App.js";
import { AttachmentReview } from "./AttachmentFields.js";
import { LocalRoleStorage } from "./LocalRoleStorage.js";

const env = validateEnvironment(import.meta.env);
const blank: VulnerabilityReport = { schemaVersion: 1, title: "", affectedAsset: "", weakness: "", summary: "", reproductionSteps: [], impact: "", suggestedRemediation: "", researcherContact: "", attachments: [] };
const download = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const readFile = async (file: File | undefined, max: number) => {
  if (!file) throw new Error("Choose a file"); if (file.size > max) throw new Error("Selected file is too large"); return file.text();
};

/** Separate entry point: this component never creates the combined demo actor session. */
export function RoleWorkspace() {
  const [vault, setVault] = useState<RoleVault>();
  const [saved, setSaved] = useState<RoleVault>();
  const [session, setSession] = useState<RoleSession>();
  const [snapshot, setSnapshot] = useState<PublicContractSnapshot>();
  const [network, setNetwork] = useState("preprod");
  const [tab, setTab] = useState<"reports" | "prepare" | "exchange" | "backup">("reports");
  const [draft, setDraft] = useState<VulnerabilityReport>(blank);
  const [selectedId, setSelectedId] = useState("");
  const [keys, setKeys] = useState<RecipientKeys>();
  const [file, setFile] = useState<File>();
  const [invitationFile, setInvitationFile] = useState<File>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const [tier, setTier] = useState("3");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<TransactionEvidence>();
  const busy = useRef(false);
  const lock = async (action: () => Promise<void>) => {
    if (busy.current) throw new Error("Wait for the current operation to finish");
    busy.current = true; setWorking(true); setError(""); setMessage("");
    try { await action(); } finally { busy.current = false; setWorking(false); }
  };
  const run = (action: () => Promise<void>) => void lock(action).catch((cause) => setError(cause instanceof Error ? cause.message : "Role operation failed"));
  const form = (event: FormEvent, action: () => Promise<void>) => { event.preventDefault(); run(action); };
  const chosen = vault?.reports.find((entry) => entry.reportId === selectedId);
  const record = snapshot && chosen && snapshot.ledger.reports.member(hexToBytes(chosen.reportId)) ? snapshot.ledger.reports.lookup(hexToBytes(chosen.reportId)) : undefined;
  const status = record ? contractStatusName(record.status) : undefined;
  const backedUp = vault !== undefined && saved === vault;
  const load = async (expected?: { id: Uint8Array; status: string }) => {
    if (!session) throw new Error("Join the program first");
    const current = await session.readPublicState();
    if (expected && (!current.ledger.reports.member(expected.id) || contractStatusName(current.ledger.reports.lookup(expected.id).status) !== expected.status)) throw new Error("The public read does not yet match the finalized transaction. Refresh ledger before continuing; do not resubmit automatically.");
    setSnapshot(current);
  };
  const write = (input: RoleCommand | (() => Promise<RoleCommand>)) => run(async () => {
    if (!session || !backedUp || !snapshot) throw new Error("Save the current role backup and refresh ledger state before submitting");
    const command = typeof input === "function" ? await input() : input;
    setSnapshot(undefined); setReceipt(undefined);
    const result = await session.execute(command); setReceipt(result);
    const expected = command.kind === "submitRetest" ? command.passed ? "RETEST_PASSED" : "RETEST_FAILED" : { submitReport: "COMMITTED", beginTriage: "TRIAGED", acceptReport: "ACCEPTED", rejectReport: "REJECTED", anchorPatch: "PATCH_READY", authorizePayout: "PAYOUT_AUTHORIZED", closeReport: "CLOSED" }[command.kind];
    const id = command.kind === "submitReport" ? pureCircuits.deriveReportCommitment(command.report.programId, command.report.canonicalDigest, command.report.salt) : command.reportId;
    await load({ id, status: expected });
    setMessage("Transaction finalized. The current ledger has been refreshed.");
  });
  const acceptDisclosure = async (value: Disclosure) => lock(async () => {
    if (!vault || vault.role !== "vendor" || !session) throw new Error("Join as vendor before adding reports");
    const opened = await validateDisclosure(value);
    if (value.network !== vault.network || value.contractAddress !== vault.contractAddress || value.programId !== vault.programId) throw new Error("Disclosure belongs to another program or network");
    const latest = await session.readPublicState(); const id = hexToBytes(value.reportId);
    if (!latest.ledger.reports.member(id) || bytesToHex(latest.ledger.reports.lookup(id).ciphertextDigest) !== opened.ciphertextDigest) throw new Error("Disclosure is absent from the ledger or its ciphertext does not match");
    if (vault.reports.some((entry) => entry.reportId === value.reportId)) throw new Error("This report is already in the workspace");
    const updated = await validateRoleVault({ ...vault, reports: [...vault.reports, value] });
    setVault(updated); setSnapshot(latest); setSelectedId(value.reportId);
  });
  return <div className="app-shell role-workspace">
    <header className="topbar"><strong>VulnSeal · Role workspace</strong><a href="/" target="_blank" rel="noreferrer noopener">Open demo / public verifier</a></header>
    <main className="page narrow-page"><h1>{vault ? `${vault.role === "vendor" ? "Vendor" : "Researcher"} workspace` : "Work with your own authority"}</h1>
      <p>Each workspace holds one contract actor secret. Use a separate browser profile for the other participant. Transactions require Lace and the selected Midnight network; this workspace has no simulated transaction mode.</p>
      {working && <p role="status">Working… A network operation may wait for Lace, proof generation and finality.</p>}
      {error && <p role="alert" className="operation-notice error">{error}</p>}
      {message && <p role="status" className="operation-notice">{message}</p>}
      {receipt && <p className="operation-notice public-value">Finalized {receipt.circuit}: {receipt.txId} at block {receipt.blockHeight}. A failed follow-up read does not erase this transaction.</p>}
      <LocalRoleStorage vault={vault} disabled={working} onSaved={setSaved} onRestore={(restored) => lock(async () => {
        if (vault) throw new Error("Restore in a fresh tab to preserve the open workspace");
        const joined = restored.contractAddress ? await joinRoleVault(restored) : undefined;
        setVault(restored); setSaved(restored); setSession(joined?.session); setSnapshot(joined?.snapshot); setSelectedId(restored.reports[0]?.reportId ?? "");
      })} />
      <fieldset className="workflow-controls" disabled={working}>
        {!vault ? <>
          <section className="form-panel"><h2>Create a vendor identity</h2><label>Workspace network<select value={network} onChange={(event) => setNetwork(event.target.value)}><option value="preprod">Preprod</option><option value="local">Local Midnight</option></select></label>
            <button className="primary-button" onClick={() => { setVault({ version: 1, role: "vendor", network, programId: bytesToHex(randomBytes(32)), actorSecret: bytesToHex(randomBytes(32)), contractAddress: null, reports: [] }); setTab("backup"); }}>Prepare vendor identity</button><p>First save its encrypted backup, then deploy a program.</p>
          </section>
          <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const invitation = parseInvitation(await readFile(invitationFile, 4096));
            const created: RoleVault = { version: 1, role: "researcher", network: invitation.network, contractAddress: invitation.contractAddress, programId: invitation.programId, actorSecret: bytesToHex(randomBytes(32)), reports: [] };
            const joined = await joinRoleVault(created); setVault(created); setSession(joined.session); setSnapshot(joined.snapshot); setTab("backup");
          })}><h2>Join as researcher</h2><p>Get a public program invitation from the vendor and confirm its contract address through your agreed channel.</p><label>Public program invitation<input type="file" accept=".json,application/json" required onChange={(event) => setInvitationFile(event.target.files?.[0])} /></label><button className="primary-button">Connect Lace and join as researcher</button></form>
          <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const restored = await decryptRoleVault(await readFile(file, MAX_ROLE_BACKUP_BYTES), password);
            const joined = restored.contractAddress ? await joinRoleVault(restored) : undefined;
            setVault(restored); setSaved(restored); setSession(joined?.session); setSnapshot(joined?.snapshot); setSelectedId(restored.reports[0]?.reportId ?? ""); setPassword("");
          })}><h2>Restore one role</h2><label>Single-role backup file<input type="file" accept=".json,application/json" required onChange={(event) => setFile(event.target.files?.[0])} /></label><label>Role restore password<input type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-button">Restore role workspace</button><p>Network restores check current authority and saved report bindings before installing the workspace.</p></form>
        </> : <>
          <p className="public-value">Network: {vault.network} · Program: {vault.programId}</p>{vault.contractAddress && <p className="public-value">Contract: {vault.contractAddress}</p>}
          {!backedUp && <p className="operation-notice" role="status">Save an updated single-role backup before any transaction. Prepared reports and received disclosures are held in memory until backed up.</p>}
          <div className="button-row workspace-tabs"><button className="secondary-button" onClick={() => setTab("reports")}>Reports</button>{vault.role === "researcher" && <button className="secondary-button" onClick={() => setTab("prepare")}>Prepare report</button>}<button className="secondary-button" onClick={() => setTab("exchange")}>Disclosure exchange</button><button className="secondary-button" onClick={() => setTab("backup")}>Save role backup</button></div>
          {tab === "backup" && <form className="form-panel" onSubmit={(event) => form(event, async () => {
            if (password !== confirmation) throw new Error("Role backup passwords do not match");
            const encrypted = await encryptRoleVault(vault, password); download(encrypted, `vulnseal-role-${vault.role}-backup.json`); setSaved(vault); setPassword(""); setConfirmation(""); setMessage("Role backup downloaded. Confirm the file is saved; keep the file and password private.");
          })}><h2>Save {vault.role} authority</h2><p>This file contains only this role's actor secret and prepared/received reports. Draft form edits and receiving keys have separate lifecycles; finish preparing a draft before backing up, and retain the separate receiving-key backup.</p><label>Role backup password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm role backup password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary-button">Download single-role backup</button></form>}
          {!vault.contractAddress && vault.role === "vendor" && tab === "reports" && <form className="form-panel" onSubmit={(event) => {
            const data = new FormData(event.currentTarget); form(event, async () => {
              const policy = readProgramForm(data);
              if (!backedUp) throw new Error("Save the vendor identity backup before deployment");
              const providers = await initializeBrowserProviders(vault.network);
              const deployed = await VulnSealApi.deploy(providers, createVulnSealPrivateState(hexToBytes(vault.actorSecret)), await programConstructor(hexToBytes(vault.programId), policy));
              const updated = { ...vault, contractAddress: deployed.api.contractAddress }; setVault(updated); setReceipt(deployed.evidence);
              const connected = await RoleSession.attach(deployed.api, { role: "vendor", programId: hexToBytes(vault.programId), actorSecret: hexToBytes(vault.actorSecret) }); setSession(connected); setSnapshot(await connected.readPublicState()); setTab("backup");
            });
          }}><h2>Deploy vendor program</h2>{([ ["name", "Program name"], ["primaryScope", "Primary scope"], ["additionalScope", "Additional scope"], ["rewardPolicy", "Reward policy"] ] as const).map(([name, label]) => <label key={name}>{label}{name === "rewardPolicy" ? <textarea name={name} defaultValue={defaultProgram[name]} required rows={4} /> : <input name={name} defaultValue={defaultProgram[name]} required={name !== "additionalScope"} />}</label>)}<label>Response days<select name="responseDays" defaultValue="7"><option>2</option><option>7</option><option>14</option></select></label><label>Disclosure days<select name="disclosureDays" defaultValue="90"><option>30</option><option>60</option><option>90</option></select></label><button className="primary-button" disabled={!backedUp}>Connect Lace and deploy program</button></form>}
          {!session && tab === "reports" && <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const updated = await validateRoleVault({ ...vault, contractAddress: vault.contractAddress ?? address.trim().toLowerCase() });
            const joined = await joinRoleVault(updated); setVault(updated); setSession(joined.session); setSnapshot(joined.snapshot);
          })}><h2>Reconnect an existing program</h2><p>For a pre-deployment backup, enter the address from your finalized deployment receipt. The vendor key must match.</p>{!vault.contractAddress && <label>Existing contract address<input value={address} required onChange={(event) => setAddress(event.target.value)} /></label>}<button className="secondary-button">Connect Lace and verify program</button></form>}
          {session && tab === "reports" && <section className="form-panel"><h2>Program reports</h2><button className="secondary-button" onClick={() => run(load)}>Refresh ledger</button>{vault.role === "vendor" && <button className="secondary-button" onClick={() => download(JSON.stringify({ format: "vulnseal-program-invitation", version: 1, network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId }), "vulnseal-program-invitation.json")}>Download public program invitation</button>}
            <label>Workspace report<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setDetail(""); setReceipt(undefined); }}><option value="">Choose a saved report</option>{vault.reports.map((entry) => <option value={entry.reportId} key={entry.reportId}>{entry.reportId}</option>)}</select></label>
            {chosen && <><p className="public-value">Report: {chosen.reportId}</p><SelectedRoleReport key={chosen.reportId} disclosure={chosen} /><p>{snapshot ? status ?? "Prepared locally; absent from the current ledger snapshot" : "Refresh ledger state before continuing. A prior transaction may still require reconciliation."}</p>
              <fieldset className="workflow-controls" disabled={!backedUp || !snapshot}>
                {vault.role === "researcher" && !record && <button className="primary-button" onClick={() => run(async () => {
                  if (!session || !backedUp || !snapshot) throw new Error("Save a backup and refresh before submitting");
                  const opened = await validateDisclosure(chosen); const canonical = await sealPreimage(chosen);
                  setSnapshot(undefined); setReceipt(undefined); const result = await session.execute({ kind: "submitReport", report: canonical, ciphertextDigest: hexToBytes(opened.ciphertextDigest) }); setReceipt(result); await load({ id: hexToBytes(chosen.reportId), status: "COMMITTED" });
                })}>Submit prepared report</button>}
                {record && <><label>Private decision, patch reference or retest notes<textarea value={detail} onChange={(event) => setDetail(event.target.value)} /></label><label>Public severity / reward tier<select value={tier} onChange={(event) => setTier(event.target.value)}><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
                  <div className="button-row workspace-tabs">
                    {vault.role === "vendor" && status === "COMMITTED" && <button className="primary-button" onClick={() => write({ kind: "beginTriage", reportId: hexToBytes(chosen.reportId) })}>Begin triage</button>}
                    {vault.role === "vendor" && status === "TRIAGED" && (["acceptReport", "rejectReport"] as const).map((kind) => <button key={kind} className="primary-button" disabled={!detail.trim()} onClick={() => write(async () => { const decisionDigest = await sha256(utf8(detail)); return kind === "acceptReport" ? { kind, reportId: hexToBytes(chosen.reportId), severity: BigInt(tier), decisionDigest } : { kind, reportId: hexToBytes(chosen.reportId), decisionDigest }; })}>{kind === "acceptReport" ? "Accept report" : "Reject report"}</button>)}
                    {vault.role === "vendor" && (status === "ACCEPTED" || status === "RETEST_FAILED") && <button className="primary-button" disabled={!detail.trim()} onClick={() => write(async () => ({ kind: "anchorPatch", reportId: hexToBytes(chosen.reportId), patchDigest: await sha256(utf8(detail)) }))}>Anchor patch</button>}
                    {vault.role === "researcher" && status === "PATCH_READY" && [true, false].map((passed) => <button key={String(passed)} className="primary-button" disabled={!detail.trim()} onClick={() => write(async () => ({ kind: "submitRetest", reportId: hexToBytes(chosen.reportId), report: await sealPreimage(chosen), patchCommitment: record.patchCommitment, evidenceDigest: await sha256(utf8(detail)), passed }))}>{passed ? "Pass retest" : "Fail retest"}</button>)}
                    {vault.role === "vendor" && status === "RETEST_PASSED" && <button className="primary-button" onClick={() => write({ kind: "authorizePayout", reportId: hexToBytes(chosen.reportId), rewardTier: BigInt(tier) })}>Authorize payout (no transfer)</button>}
                    {vault.role === "vendor" && (status === "REJECTED" || status === "PAYOUT_AUTHORIZED") && <button className="secondary-button" onClick={() => write({ kind: "closeReport", reportId: hexToBytes(chosen.reportId) })}>Close report</button>}
                  </div>
                </>}
              </fieldset>
            </>}
          </section>}
          {tab === "prepare" && vault.role === "researcher" && session && <><p>Prepare ciphertext first. Save an updated backup before submitting it to Midnight. Unprepared form edits are not backed up.</p><ReportWizard report={draft} onChange={setDraft} onSeal={() => run(async () => {
            const encrypted = await sealReport(draft, vault.programId); const salt = randomBytes(32);
            const id = bytesToHex(pureCircuits.deriveReportCommitment(hexToBytes(vault.programId), Uint8Array.from(encrypted.canonicalReportDigest), salt));
            const prepared: Disclosure = { network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId, reportId: id, envelope: encrypted.serializedEnvelope, key: bytesToHex(encrypted.key), salt: bytesToHex(salt) };
            const updated = await validateRoleVault({ ...vault, reports: [...vault.reports, prepared] });
            await new CipherstoreClient(env.cipherstoreUrl).put(encrypted.contentAddress, encrypted.serializedEnvelope); setVault(updated); setSelectedId(id); setDraft(blank); setTab("backup");
          })} /></>}
          {tab === "exchange" && <HandoffPanel disclosure={vault.role === "researcher" ? chosen : undefined} keys={keys} onKeys={setKeys} {...(vault.role === "vendor" ? { onDisclosure: acceptDisclosure } : {})} />}
        </>}
      </fieldset>
    </main>
  </div>;
}

const sealPreimage = async (value: Disclosure) => {
  const { report } = await validateDisclosure(value);
  return { programId: hexToBytes(value.programId), canonicalDigest: await sha256(utf8(canonicalizeReport(report))), salt: hexToBytes(value.salt) };
};

function SelectedRoleReport({ disclosure }: { readonly disclosure: Disclosure }) {
  const [report, setReport] = useState<VulnerabilityReport>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void validateDisclosure(disclosure).then((opened) => { if (active) setReport(opened.report); }).catch(() => { if (active) setError("Saved report could not be authenticated"); });
    return () => { active = false; };
  }, [disclosure]);
  return <details className="saved-report"><summary>Read selected private report</summary>{error && <p role="alert">{error}</p>}{report && <>
    <h3>{report.title}</h3><p>{report.affectedAsset} · {report.weakness}</p><h4>Summary</h4><p>{report.summary}</p><h4>Impact</h4><p>{report.impact}</p>
    <h4>Reproduction</h4><ol>{report.reproductionSteps.map((step, index) => <li key={index}>{step}</li>)}</ol><h4>Suggested remediation</h4><p>{report.suggestedRemediation || "Not provided"}</p><h4>Researcher contact</h4><p>{report.researcherContact || "Not provided"}</p><AttachmentReview attachments={report.attachments} />
  </>}</details>;
}
