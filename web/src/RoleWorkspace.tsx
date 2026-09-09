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
import { decryptRoleVault, encryptRoleVault, MAX_ROLE_BACKUP_BYTES, parseInvitation, validateRoleVault, withRoleDraft, withAttachmentDraft, withReportNotes, withSubmissionAttempt, withFinalizedSubmission, type SubmissionIntent, type RoleVault } from "./role-recovery.js";
import { joinRoleVault } from "./role-network.js";
import { HandoffPanel } from "./HandoffPanel.js";
import { validateDisclosure, type Disclosure, type RecipientKeys } from "./handoff.js";
import { ReportWizard } from "./App.js";
import { emptyAttachmentDraft } from "./attachment-draft.js";
import { AttachmentReview } from "./AttachmentFields.js";
import { SubmissionIntentView } from "./SubmissionIntentView.js";
import { ReportEffectCheck } from "./ReportEffectCheck.js";
import { TransactionCheck } from "./TransactionCheck.js";
import { RecoveryJournal } from "./RecoveryJournal.js";
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
  const [generation, setGeneration] = useState(0);
  return <ActiveRoleWorkspace key={generation} justLocked={generation > 0} onLock={() => setGeneration((value) => value + 1)} />;
}

/** Remounting discards the old component tree and stops its autosave writer. */
function ActiveRoleWorkspace({ onLock, justLocked }: { readonly onLock: () => void; readonly justLocked: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (justLocked) heading.current?.focus(); }, [justLocked]);
  const [vault, setVault] = useState<RoleVault>();
  const [saved, setSaved] = useState<RoleVault>();
  const currentVault = useRef(vault); currentVault.current = vault;
  const persistJournal = useRef<((value: RoleVault) => Promise<void>) | undefined>(undefined);
  const submissionIntent = useRef<SubmissionIntent | undefined>(undefined);
  const requireJournal = () => {
    if (!persistJournal.current) throw new Error("Enable encrypted browser autosave before submitting a role transaction. No transaction was sent.");
  };
  const duringSubmission = async <T,>(intent: SubmissionIntent, action: () => Promise<T>): Promise<T> => {
    if (submissionIntent.current) throw new Error("Another submission is active");
    submissionIntent.current = intent;
    try { return await action(); } finally { submissionIntent.current = undefined; }
  };
  const recordSubmission = async (transactionId: string) => {
    const current = currentVault.current, persist = persistJournal.current;
    if (!current || !persist) throw new Error("Enable encrypted browser autosave before submitting a role transaction. No transaction was sent.");
    if (current.submissionAttempts?.some((entry) => entry.transactionId === transactionId)) throw new Error("This transaction is already recorded. Reconcile its identifier before trying again.");
    if (!submissionIntent.current) throw new Error("Submission intent is missing. No transaction was sent.");
    const updated = await withSubmissionAttempt(current, transactionId, submissionIntent.current);
    await persist(updated);
    currentVault.current = updated; setVault(updated); setSaved(updated);
  };
  const [session, setSession] = useState<RoleSession>();
  const [snapshot, setSnapshot] = useState<PublicContractSnapshot>();
  const [network, setNetwork] = useState("preprod");
  const [tab, setTab] = useState<"reports" | "prepare" | "exchange" | "backup">("reports");
  const draft = vault?.draft ?? blank;
  const [offlineRestore, setOfflineRestore] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [keys, setKeys] = useState<RecipientKeys>();
  const [retainedKeys, setRetainedKeys] = useState<RecipientKeys>();
  const [file, setFile] = useState<File>();
  const [invitationFile, setInvitationFile] = useState<File>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [address, setAddress] = useState("");
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
  const canLock = backedUp && !working && (!keys || retainedKeys === keys);
  const notes = vault?.reportNotes?.find((entry) => entry.reportId === selectedId);
  const detail = notes?.text ?? "", tier = notes?.tier ?? "3";
  const updateNotes = (text: string, selectedTier: string) => {
    if (!vault || !chosen) return;
    try { setVault(withReportNotes(vault, { reportId: chosen.reportId, text, tier: selectedTier })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update private notes"); }
  };
  const warnBeforeLeaving = working || (vault !== undefined && !backedUp) || keys !== undefined;
  useEffect(() => {
    if (!warnBeforeLeaving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [warnBeforeLeaving]);
  const load = async (expected?: { id: Uint8Array; status: string }) => {
    if (!session) throw new Error("Join the program first");
    const current = await session.readPublicState();
    if (expected && (!current.ledger.reports.member(expected.id) || contractStatusName(current.ledger.reports.lookup(expected.id).status) !== expected.status)) throw new Error("The public read does not yet match the finalized transaction. Refresh ledger before continuing; do not resubmit automatically.");
    setSnapshot(current);
  };
  const write = (input: RoleCommand | (() => Promise<RoleCommand>)) => run(async () => {
    requireJournal();
    if (!session || !backedUp || !snapshot) throw new Error("Save the current role backup and refresh ledger state before submitting");
    const command = typeof input === "function" ? await input() : input;
    setSnapshot(undefined); setReceipt(undefined);
    const id = command.kind === "submitReport" ? pureCircuits.deriveReportCommitment(Uint8Array.from(command.report.programId), Uint8Array.from(command.report.canonicalDigest), Uint8Array.from(command.report.salt)) : command.reportId;
    const result = await duringSubmission({ circuit: command.kind, reportId: bytesToHex(id) }, () => session.execute(command)); setReceipt(result);
    let updated = currentVault.current!;
    try {
      updated = await withFinalizedSubmission(updated, result);
      const persist = persistJournal.current;
      if (!persist) throw new Error("Encrypted browser autosave is unavailable");
      await persist(updated); setSaved(updated);
    } catch (cause) {
      setSaved(undefined); setTab("backup");
      throw new Error(`Transaction finalized, but its receipt could not be saved to browser storage. Keep this tab open and download an updated role backup before leaving. Do not resubmit. ${cause instanceof Error ? cause.message : "Recovery save failed"}`);
    } finally { currentVault.current = updated; setVault(updated); }
    const expected = command.kind === "submitRetest" ? command.passed ? "RETEST_PASSED" : "RETEST_FAILED" : { submitReport: "COMMITTED", beginTriage: "TRIAGED", acceptReport: "ACCEPTED", rejectReport: "REJECTED", anchorPatch: "PATCH_READY", authorizePayout: "PAYOUT_AUTHORIZED", closeReport: "CLOSED" }[command.kind];
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
    <main id="main-content" className="page narrow-page"><h1 ref={heading} tabIndex={-1}>{vault ? `${vault.role === "vendor" ? "Vendor" : "Researcher"} workspace` : "Work with your own authority"}</h1>
      <p>Each workspace holds one contract actor secret. Use a separate browser profile for the other participant. Transactions require Lace and the selected Midnight network; this workspace has no simulated transaction mode.</p>
      {working && <p role="status">Working… A network operation may wait for Lace, proof generation and finality.</p>}
      {error && <p role="alert" className="operation-notice error">{error}</p>}
      {message && <p role="status" className="operation-notice">{message}</p>}
      {!vault && justLocked && <p role="status">Workspace locked. Unlock a saved browser copy or restore a file to continue with that role or another program.</p>}
      {vault && <section className="form-panel"><h2>Lock or switch workspace</h2>
        <p>Save current changes before locking. Locking closes this tab's active role and stops its autosave; encrypted browser copies and downloaded files remain available. Reopening a copy requires its password. Your Lace connection and other tabs are managed separately.</p>
        {keys && <label><input type="checkbox" checked={retainedKeys === keys} onChange={(event) => setRetainedKeys(event.target.checked ? keys : undefined)} />I retained the separate encrypted receiving-key backup and its password.</label>}
        <button className="secondary-button" disabled={!canLock} onClick={() => { if (!busy.current && canLock) onLock(); }}>Lock and switch workspace</button>
        {!backedUp && <p>Save the current role backup or wait for encrypted autosave before locking.</p>}
      </section>}
      {keys && <p className="operation-notice">Receiving keys are held in this tab. Keep their separate encrypted key backup before leaving; the role backup does not include them.</p>}
      {receipt && <p className="operation-notice public-value">Finalized {receipt.circuit}: {receipt.txId} at block {receipt.blockHeight}. A failed follow-up read does not erase this transaction.</p>}
      {!vault && <label><input type="checkbox" checked={offlineRestore} onChange={(event) => setOfflineRestore(event.target.checked)} />Restore backups without connecting Lace</label>}
      <LocalRoleStorage vault={vault} disabled={working} onSaved={setSaved} onPersistence={(persist) => { persistJournal.current = persist; }} onRestore={(restored) => lock(async () => {
        if (vault) throw new Error("Restore in a fresh tab to preserve the open workspace");
        const joined = restored.contractAddress && !offlineRestore ? await joinRoleVault(restored, recordSubmission) : undefined;
        setVault(restored); setSaved(restored); setSession(joined?.session); setSnapshot(joined?.snapshot); setSelectedId(restored.reports[0]?.reportId ?? "");
      })} />
      {vault && <section className="form-panel"><h2>Submission journal</h2>
        <p>Real role submissions require encrypted browser autosave. The transaction identifier is saved before calling the wallet. A recorded attempt is not proof of broadcast, success or finality; check the wallet or indexer before retrying after an interruption.</p>
        {vault.submissionAttempts?.length ? <ul>{vault.submissionAttempts.map((entry) => <li className="public-value" key={entry.transactionId}>{entry.transactionId} · recorded {entry.recordedAt} · outcome requires reconciliation<SubmissionIntentView entry={entry} /><TransactionCheck network={vault.network} transactionId={entry.transactionId} contractAddress={vault.contractAddress} circuit={entry.intent?.circuit} />{vault.contractAddress && entry.intent?.reportId && <ReportEffectCheck network={vault.network} transactionId={entry.transactionId} contractAddress={vault.contractAddress} programId={vault.programId} reportId={entry.intent.reportId} circuit={entry.intent.circuit} />}</li>)}</ul> : <p>No recorded submission attempts.</p>}
      </section>}
      <fieldset className="workflow-controls" disabled={working}>
        {!vault ? <>
          <section className="form-panel"><h2>Create a vendor identity</h2><label>Workspace network<select value={network} onChange={(event) => setNetwork(event.target.value)}><option value="preprod">Preprod</option><option value="local">Local Midnight</option></select></label>
            <button className="primary-button" onClick={() => { setVault({ version: 1, role: "vendor", network, programId: bytesToHex(randomBytes(32)), actorSecret: bytesToHex(randomBytes(32)), contractAddress: null, reports: [] }); setTab("backup"); }}>Prepare vendor identity</button><p>First save its encrypted backup, then deploy a program.</p>
          </section>
          <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const invitation = parseInvitation(await readFile(invitationFile, 4096));
            const created: RoleVault = { version: 1, role: "researcher", network: invitation.network, contractAddress: invitation.contractAddress, programId: invitation.programId, actorSecret: bytesToHex(randomBytes(32)), reports: [] };
            const joined = await joinRoleVault(created, recordSubmission); setVault(created); setSession(joined.session); setSnapshot(joined.snapshot); setTab("backup");
          })}><h2>Join as researcher</h2><p>Get a public program invitation from the vendor and confirm its contract address through your agreed channel.</p><label>Public program invitation<input type="file" accept=".json,application/json" required onChange={(event) => setInvitationFile(event.target.files?.[0])} /></label><button className="primary-button">Connect Lace and join as researcher</button></form>
          <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const restored = await decryptRoleVault(await readFile(file, MAX_ROLE_BACKUP_BYTES), password);
            const joined = restored.contractAddress && !offlineRestore ? await joinRoleVault(restored, recordSubmission) : undefined;
            setVault(restored); setSaved(restored); setSession(joined?.session); setSnapshot(joined?.snapshot); setSelectedId(restored.reports[0]?.reportId ?? ""); setPassword("");
          })}><h2>Restore one role</h2><label>Single-role backup file<input type="file" accept=".json,application/json" required onChange={(event) => setFile(event.target.files?.[0])} /></label><label>Role restore password<input type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-button">Restore role workspace</button><p>Connected restores check current authority and saved report bindings. Offline restores open local backups only; connect and verify the program before any transaction.</p></form>
          <RecoveryJournal />
        </> : <>
          <p className="public-value">Network: {vault.network} · Program: {vault.programId}</p>{vault.contractAddress && <p className="public-value">Contract: {vault.contractAddress}</p>}
          {vault.contractAddress && !session && <p className="operation-notice">Offline workspace: contract authority and current ledger state have not been checked. Connect Lace and verify the program before submitting transactions.</p>}
          {!backedUp && <p className="operation-notice" role="status">Save an updated single-role backup before any transaction. Draft edits, report notes, prepared reports and received disclosures are held in memory until backed up.</p>}
          <div className="button-row workspace-tabs"><button className="secondary-button" onClick={() => setTab("reports")}>Reports</button>{vault.role === "researcher" && <button className="secondary-button" onClick={() => setTab("prepare")}>Prepare report</button>}<button className="secondary-button" onClick={() => setTab("exchange")}>Disclosure exchange</button><button className="secondary-button" onClick={() => setTab("backup")}>Save role backup</button></div>
          {tab === "backup" && <form className="form-panel" onSubmit={(event) => form(event, async () => {
            if (password !== confirmation) throw new Error("Role backup passwords do not match");
            const encrypted = await encryptRoleVault(vault, password); download(encrypted, `vulnseal-role-${vault.role}-backup.json`); setSaved(vault); setPassword(""); setConfirmation(""); setMessage("Role backup downloaded. Confirm the file is saved; keep the file and password private.");
          })}><h2>Save {vault.role} authority</h2><p>This file contains this role's actor secret, prepared/received reports, submission journal, current report draft and working notes for each saved report. Notes are editable working copies, not transaction history. Retain the separate receiving-key backup.</p><label>Role backup password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm role backup password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary-button">Download single-role backup</button></form>}
          {!vault.contractAddress && vault.role === "vendor" && tab === "reports" && <form className="form-panel" onSubmit={(event) => {
            const data = new FormData(event.currentTarget); form(event, async () => {
              const policy = readProgramForm(data);
              if (!backedUp) throw new Error("Save the vendor identity backup before deployment");
              requireJournal();
              const providers = await initializeBrowserProviders(vault.network, recordSubmission);
              const constructor = await programConstructor(hexToBytes(vault.programId), policy);
              const deployed = await duringSubmission({ circuit: "constructor", reportId: null }, () => VulnSealApi.deploy(providers, createVulnSealPrivateState(hexToBytes(vault.actorSecret)), constructor));
              setReceipt(deployed.evidence); setTab("backup");
              let updated = await validateRoleVault({ ...currentVault.current!, contractAddress: deployed.api.contractAddress });
              try {
                updated = await withFinalizedSubmission(updated, deployed.evidence);
                const persist = persistJournal.current;
                if (!persist) throw new Error("Encrypted browser autosave is unavailable");
                await persist(updated);
                setSaved(updated);
              } catch (cause) {
                setSaved(undefined);
                throw new Error(`Program deployment finalized, but its address could not be saved to browser storage. Keep this tab open and download an updated role backup before leaving. Do not deploy again. ${cause instanceof Error ? cause.message : "Recovery save failed"}`);
              } finally {
                currentVault.current = updated; setVault(updated);
              }
              const connected = await RoleSession.attach(deployed.api, { role: "vendor", programId: hexToBytes(vault.programId), actorSecret: hexToBytes(vault.actorSecret) }); setSession(connected); setSnapshot(await connected.readPublicState()); setTab("backup");
            });
          }}><h2>Deploy vendor program</h2>{([ ["name", "Program name"], ["primaryScope", "Primary scope"], ["additionalScope", "Additional scope"], ["rewardPolicy", "Reward policy"] ] as const).map(([name, label]) => <label key={name}>{label}{name === "rewardPolicy" ? <textarea name={name} defaultValue={defaultProgram[name]} required rows={4} /> : <input name={name} defaultValue={defaultProgram[name]} required={name !== "additionalScope"} />}</label>)}<label>Response days<select name="responseDays" defaultValue="7"><option>2</option><option>7</option><option>14</option></select></label><label>Disclosure days<select name="disclosureDays" defaultValue="90"><option>30</option><option>60</option><option>90</option></select></label><button className="primary-button" disabled={!backedUp}>Connect Lace and deploy program</button></form>}
          {!session && tab === "reports" && <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const updated = await validateRoleVault({ ...vault, contractAddress: vault.contractAddress ?? address.trim().toLowerCase() });
            const joined = await joinRoleVault(updated, recordSubmission); setVault(updated); setSession(joined.session); setSnapshot(joined.snapshot);
          })}><h2>Reconnect an existing program</h2><p>For a pre-deployment backup, enter the address from your finalized deployment receipt. The vendor key must match.</p>{!vault.contractAddress && <label>Existing contract address<input value={address} required onChange={(event) => setAddress(event.target.value)} /></label>}<button className="secondary-button">Connect Lace and verify program</button></form>}
          {vault.contractAddress && tab === "reports" && <section className="form-panel"><h2>Program reports</h2>{session && <button className="secondary-button" onClick={() => run(load)}>Refresh ledger</button>}{session && vault.role === "vendor" && <button className="secondary-button" onClick={() => download(JSON.stringify({ format: "vulnseal-program-invitation", version: 1, network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId }), "vulnseal-program-invitation.json")}>Download public program invitation</button>}
            <label>Workspace report<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setReceipt(undefined); }}><option value="">Choose a saved report</option>{vault.reports.map((entry) => <option value={entry.reportId} key={entry.reportId}>{entry.reportId}</option>)}</select></label>
            {chosen && <><p className="public-value">Report: {chosen.reportId}</p><SelectedRoleReport key={chosen.reportId} disclosure={chosen} /><p>{snapshot ? status ?? "Prepared locally; absent from the current ledger snapshot" : "Refresh ledger state before continuing. A prior transaction may still require reconciliation."}</p>
              <p>Working notes and the selected tier are saved privately per report in encrypted backups and browser autosave. They are editable, not verified transaction history. Only an explicit transaction publishes its corresponding digest or tier.</p>
              <label>Private decision, patch reference or retest notes<textarea value={detail} onChange={(event) => updateNotes(event.target.value, tier)} /></label><label>Public severity / reward tier<select value={tier} onChange={(event) => updateNotes(detail, event.target.value)}><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
              <fieldset className="workflow-controls" disabled={!backedUp || !snapshot || !session}>
                {session && vault.role === "researcher" && !record && <button className="primary-button" onClick={() => write(async () => {
                  const opened = await validateDisclosure(chosen);
                  return { kind: "submitReport", report: await sealPreimage(chosen), ciphertextDigest: hexToBytes(opened.ciphertextDigest) };
                })}>Submit prepared report</button>}
                {record && session && <>
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
          {tab === "prepare" && vault.role === "researcher" && <><p>Draft edits are included in encrypted role backups and browser autosave when enabled. Wait for the saved confirmation before closing. Preparing uploads encrypted ciphertext; a later Midnight submission requires a verified connection.</p><ReportWizard preserveDraftLines attachmentDraft={vault.attachmentDraft ?? emptyAttachmentDraft} onAttachmentDraftChange={(next) => setVault((current) => current ? withAttachmentDraft(current, next) : current)} report={draft} onChange={(next) => setVault((current) => current ? withRoleDraft(current, next) : current)} onSeal={() => run(async () => {
            const encrypted = await sealReport({ ...draft, reproductionSteps: draft.reproductionSteps.filter((step) => step.trim().length > 0) }, vault.programId); const salt = randomBytes(32);
            const id = bytesToHex(pureCircuits.deriveReportCommitment(hexToBytes(vault.programId), Uint8Array.from(encrypted.canonicalReportDigest), salt));
            const prepared: Disclosure = { network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId, reportId: id, envelope: encrypted.serializedEnvelope, key: bytesToHex(encrypted.key), salt: bytesToHex(salt) };
            const updated = await validateRoleVault(withRoleDraft({ ...vault, reports: [...vault.reports, prepared] }, null));
            await new CipherstoreClient(env.cipherstoreUrl).put(encrypted.contentAddress, encrypted.serializedEnvelope); setVault(updated); setSelectedId(id); setTab("backup");
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
