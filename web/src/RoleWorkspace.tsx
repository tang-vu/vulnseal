// SPDX-License-Identifier: Apache-2.0
import { GitHubReleaseImport } from "./GitHubReleaseImport.js";
import { VendorPolicyExport } from "./VendorPolicyExport.js";
import { submissionEmbed } from "./submission-embed.js";
import { ProgramInvitationJoin } from "./ProgramInvitationJoin.js";
import { programInvitationLink } from "./program-invitation-link.js";
import { GitHubScopeImport } from "./GitHubScopeImport.js";
import { DeploymentPolicyCheck } from "./DeploymentPolicyCheck.js";
import { JournalEntries } from "./JournalEntries.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { VulnSealApi } from "@vulnseal/api/api";
import { RoleSession, type RoleCommand } from "@vulnseal/api/role-session";
import { createCipherstoreClient, verifyCipherstoreCopies } from "@vulnseal/api/cipherstore-client";
import { CipherstoreDestinations } from "./CipherstoreDestinations.js";
import { SavedReportSelector } from "./SavedReportSelector.js";
import { uploadSavedBatch } from "./ciphertext-batch.js";
import type { PublicContractSnapshot, TransactionEvidence } from "@vulnseal/api/types";
import { createVulnSealPrivateState, pureCircuits } from "@vulnseal/contract";
import { bytesToHex, canonicalizeReport, contractStatusName, hexToBytes, randomBytes, sealReport, sha256, utf8, validateEnvironment, type VulnerabilityReport } from "@vulnseal/shared";
import { initializeBrowserProviders } from "./midnight/browser-providers.js";
import { defaultProgramDraft, captureDeploymentInputs, programConstructor, readProgramForm, type SavedDeploymentInputs, type ProgramDraft } from "./program.js";
import { decryptRoleVault, encryptRoleVault, MAX_ROLE_BACKUP_BYTES, MAX_SUBMISSION_ATTEMPTS, assertSubmissionCapacity, validateRoleVault, withDeploymentInputs, withProgramDraft, withRoleDraft, withAttachmentDraft, withReportNotes, withSubmissionAttempt, withSubmissionNotes, withRetestChoice, withFinalizedSubmission, type ReportNotes, type SubmissionIntent, type RoleVault } from "./role-recovery.js";
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
import { submissionWait } from "./submission-wait.js";

const env = validateEnvironment(import.meta.env);
const blank: VulnerabilityReport = { schemaVersion: 1, title: "", affectedAsset: "", weakness: "", summary: "", reproductionSteps: [], impact: "", suggestedRemediation: "", researcherContact: "", attachments: [] };
const download = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const readFile = async (file: File | undefined, max: number) => {
  if (!file) throw new Error("Choose a file"); if (file.size > max) throw new Error("Selected file is too large"); return file.text();
};
const uploadDisclosure = async (disclosure: Disclosure) => {
  const opened = await validateDisclosure(disclosure);
  try { await createCipherstoreClient(env.cipherstoreUrls).put(`sha256:${opened.ciphertextDigest}`, disclosure.envelope); }
  catch (cause) { throw new Error(`Ciphertext upload was not confirmed. Keep this saved report and retry its upload; do not prepare a replacement. No contract submission was started by this upload. ${cause instanceof Error ? cause.message : "Storage unavailable"}`); }
  return opened;
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
  const retestPatch = useRef<string | undefined>(undefined);
  const retestChoice = useRef<boolean | null>(null);
  const submissionNotes = useRef<ReportNotes | null>(null);
  const submissionIntent = useRef<SubmissionIntent | undefined>(undefined);
  const deploymentInputs = useRef<SavedDeploymentInputs | undefined>(undefined);
  const confirmationWait = useRef<ReturnType<typeof submissionWait> | undefined>(undefined);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const requireJournal = () => {
    if (recoveryRequired) throw new Error("This session lost transaction confirmation. Reconcile its saved identifier before restoring a fresh session; transactions remain disabled here.");
    if (currentVault.current) assertSubmissionCapacity(currentVault.current);
    if (!persistJournal.current) throw new Error("Enable encrypted browser autosave before submitting a role transaction. No transaction was sent.");
  };
  const duringSubmission = async <T,>(intent: SubmissionIntent, action: () => Promise<T>, context: { notes?: ReportNotes; passed?: boolean | null; patch?: string | undefined; deployment?: SavedDeploymentInputs } = {}): Promise<T> => {
    if (submissionIntent.current) throw new Error("Another submission is active");
    submissionIntent.current = intent; submissionNotes.current = context.notes ?? null; retestChoice.current = context.passed ?? null; retestPatch.current = context.patch; deploymentInputs.current = context.deployment;
    const wait = submissionWait(); confirmationWait.current = wait;
    try { return await wait.run(action); }
    catch (cause) {
      // Once the durable hook returned, a generic SDK/transport error cannot prove non-submission.
      if (wait.transactionId !== undefined) { setRecoveryRequired(true); setSession(undefined); setSnapshot(undefined); }
      throw cause;
    } finally { confirmationWait.current = undefined; submissionIntent.current = undefined; submissionNotes.current = null; retestChoice.current = null; retestPatch.current = undefined; deploymentInputs.current = undefined; }
  };
  const recordSubmission = async (transactionId: string) => {
    const current = currentVault.current, persist = persistJournal.current;
    if (!current || !persist) throw new Error("Enable encrypted browser autosave before submitting a role transaction. No transaction was sent.");
    if (current.submissionAttempts?.some((entry) => entry.transactionId === transactionId)) throw new Error("This transaction is already recorded. Reconcile its identifier before trying again.");
    if (!submissionIntent.current) throw new Error("Submission intent is missing. No transaction was sent.");
    if (submissionIntent.current.circuit === "constructor" && !deploymentInputs.current) throw new Error("Deployment inputs are missing. No transaction was sent.");
    let updated = await withSubmissionAttempt(current, transactionId, submissionIntent.current);
    if (deploymentInputs.current) updated = await withDeploymentInputs(updated, transactionId, deploymentInputs.current);
    if (submissionNotes.current) updated = await withSubmissionNotes(updated, transactionId, submissionNotes.current);
    if (retestChoice.current !== null) updated = await withRetestChoice(updated, transactionId, retestChoice.current, retestPatch.current);
    await persist(updated);
    currentVault.current = updated; setVault(updated); setSaved(updated);
    confirmationWait.current?.checkpoint(transactionId);
  };
  const [session, setSession] = useState<RoleSession>();
  const [snapshot, setSnapshot] = useState<PublicContractSnapshot>();
  const [network, setNetwork] = useState("preprod");
  const [tab, setTab] = useState<"reports" | "prepare" | "exchange" | "backup">("reports");
  const draft = vault?.draft ?? blank;
  const programDraft = vault?.programDraft ?? defaultProgramDraft;
  const updateProgramDraft = (name: keyof ProgramDraft, value: string) => setVault((current) => current ? withProgramDraft(current, { ...(current.programDraft ?? defaultProgramDraft), [name]: value }) : current);
  const [offlineRestore, setOfflineRestore] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [copyCheck, setCopyCheck] = useState<Awaited<ReturnType<typeof verifyCipherstoreCopies>>>();
  useEffect(() => { setCopyCheck(undefined); }, [selectedId]);
  const [keys, setKeys] = useState<RecipientKeys>();
  const [retainedKeys, setRetainedKeys] = useState<RecipientKeys>();
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [address, setAddress] = useState("");
  const [working, setWorking] = useState(false);
  const batchController = useRef<AbortController | undefined>(undefined);
  const [batch, setBatch] = useState<{ acknowledged: number; total: number; stopping: boolean }>();
  useEffect(() => () => { batchController.current?.abort(); }, []);
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
  const uploadAll = () => run(async () => {
    if (!vault || !backedUp) throw new Error("Save the current role backup before uploading");
    setCopyCheck(undefined);
    const controller = new AbortController();
    batchController.current = controller;
    const reports = [...vault.reports];
    let acknowledged = 0;
    setBatch({ acknowledged, total: reports.length, stopping: false });
    try {
      acknowledged = await uploadSavedBatch(reports, {
        signal: controller.signal,
        upload: uploadDisclosure,
        progress: (count) => { acknowledged = count; setBatch((previous) => previous && { ...previous, acknowledged: count }); },
      });
      setMessage(`${acknowledged} of ${reports.length} saved reports acknowledged by all configured stores.${acknowledged < reports.length ? " Remaining uploads stopped." : ""} Keep your backup; acknowledgments do not guarantee retention. No transaction was submitted.`);
    } catch (cause) {
      setSelectedId(reports[acknowledged]!.reportId); setReceipt(undefined);
      throw new Error(`${acknowledged} of ${reports.length} saved reports acknowledged. Stopped at the selected report; no later reports were uploaded. ${cause instanceof Error ? cause.message : "Storage unavailable"}`);
    } finally { batchController.current = undefined; setBatch(undefined); }
  });
  const canLock = backedUp && !working && (!keys || retainedKeys === keys);
  const notes = vault?.reportNotes?.find((entry) => entry.reportId === selectedId);
  const detail = notes?.text ?? "", tier = notes?.tier ?? "3";
  const updateNotes = (text: string, selectedTier: string) => {
    if (!vault || !chosen) return false;
    try { setVault(withReportNotes(vault, { reportId: chosen.reportId, text, tier: selectedTier })); setError(""); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update private notes"); return false; }
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
    const result = await duringSubmission({ circuit: command.kind, reportId: bytesToHex(id) }, () => session.execute(command), { notes: { reportId: bytesToHex(id), text: detail, tier }, passed: command.kind === "submitRetest" ? command.passed : null, patch: command.kind === "submitRetest" ? bytesToHex(command.patchCommitment) : undefined }); setReceipt(result);
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
    <header className="topbar"><strong>VulnSeal · Role workspace</strong><a href="./" target="_blank" rel="noreferrer noopener">Open demo / public verifier</a></header>
    <main id="main-content" className="page narrow-page"><h1 ref={heading} tabIndex={-1}>{vault ? `${vault.role === "vendor" ? "Vendor" : "Researcher"} workspace` : "Work with your own authority"}</h1>
      <p>Each workspace holds one contract actor secret. Use a separate browser profile for the other participant. Transactions require Lace and the selected Midnight network; this workspace has no simulated transaction mode.</p>
      {working && <p role="status">Working… A network operation may wait for Lace, proof generation and finality.</p>}
      {error && <p role="alert" className="operation-notice error">{error}</p>}
      {batch && <section aria-label="Workspace upload progress">
        <p role="status">{batch.acknowledged} of {batch.total} saved reports acknowledged by all configured stores.</p>
        <progress aria-label="Acknowledged reports" max={batch.total} value={batch.acknowledged} />
        <button type="button" disabled={batch.stopping} onClick={() => { batchController.current?.abort(); setBatch((previous) => previous && { ...previous, stopping: true }); }}>Stop remaining uploads</button>
        {batch.stopping && <p>Stopping after the current report finishes. Its upload may still store ciphertext.</p>}
      </section>}
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
        {recoveryRequired && <p>This session lost confirmation after saving a transaction checkpoint. Transactions remain disabled. Keep your backup and use the journal checks to investigate the saved identifier before restoring a fresh session. An error or timeout does not prove the transaction failed.</p>}
        <p>Real role submissions require encrypted browser autosave. The transaction identifier is saved before calling the wallet. A recorded attempt is not proof of broadcast, success or finality; check the wallet or indexer before retrying after an interruption.</p>
        <p>Submission journal: {vault.submissionAttempts?.length ?? 0} of {MAX_SUBMISSION_ATTEMPTS} attempts retained.</p>
        {(vault.submissionAttempts?.length ?? 0) >= MAX_SUBMISSION_ATTEMPTS && <p>The submission journal is full. Keep an encrypted backup. New transactions cannot start; existing reports and journal checks remain available. No history is removed automatically.</p>}
        {vault.submissionAttempts?.length ? <JournalEntries entries={vault.submissionAttempts} label="Search submission journal">{(entry) => <li className="public-value" key={entry.transactionId}>{entry.transactionId} · recorded {entry.recordedAt} · outcome requires reconciliation<SubmissionIntentView entry={entry} includePrivateNotes />{entry.intent?.circuit === "constructor" && entry.deployment && <DeploymentPolicyCheck network={vault.network} transactionId={entry.transactionId} saved={entry.deployment} />}<TransactionCheck network={vault.network} transactionId={entry.transactionId} contractAddress={vault.contractAddress} circuit={entry.intent?.circuit} onChooseDeploymentAddress={!vault.contractAddress && !session && !recoveryRequired ? (candidate) => { setAddress(candidate); setTab("reports"); setMessage("Observed address filled in. Connect Lace and verify the program before this address is saved."); } : undefined} />{vault.contractAddress && entry.intent?.reportId && <ReportEffectCheck network={vault.network} transactionId={entry.transactionId} contractAddress={vault.contractAddress} programId={vault.programId} reportId={entry.intent.reportId} circuit={entry.intent.circuit} savedNotes={entry.notes} savedRetestPassed={entry.retestPassed} savedRetestPatch={entry.retestPatchCommitment} savedEnvelope={vault.reports.find((report) => report.reportId === entry.intent?.reportId)?.envelope} />}</li>}</JournalEntries> : <p>No recorded submission attempts.</p>}
      </section>}
      <fieldset className="workflow-controls" disabled={working}>
        {!vault ? <>
          <section className="form-panel"><h2>Create a vendor identity</h2><label>Workspace network<select value={network} onChange={(event) => setNetwork(event.target.value)}><option value="preprod">Preprod</option><option value="local">Local Midnight</option></select></label>
            <button className="primary-button" onClick={() => { setVault(withProgramDraft({ version: 1, role: "vendor", network, programId: bytesToHex(randomBytes(32)), actorSecret: bytesToHex(randomBytes(32)), contractAddress: null, reports: [] }, defaultProgramDraft)); setTab("backup"); }}>Prepare vendor identity</button><p>First save its encrypted backup, then deploy a program.</p>
          </section>
          <ProgramInvitationJoin onJoin={invitation => run(async () => {
            const created: RoleVault = { version: 1, role: "researcher", network: invitation.network, contractAddress: invitation.contractAddress, programId: invitation.programId, actorSecret: bytesToHex(randomBytes(32)), reports: [] };
            const joined = await joinRoleVault(created, recordSubmission); setVault(created); setSession(joined.session); setSnapshot(joined.snapshot); setTab("backup");
          })} />
          <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const restored = await decryptRoleVault(await readFile(file, MAX_ROLE_BACKUP_BYTES), password);
            const joined = restored.contractAddress && !offlineRestore ? await joinRoleVault(restored, recordSubmission) : undefined;
            setVault(restored); setSaved(restored); setSession(joined?.session); setSnapshot(joined?.snapshot); setSelectedId(restored.reports[0]?.reportId ?? ""); setPassword("");
          })}><h2>Restore one role</h2><label>Single-role backup file<input type="file" accept=".json,application/json" required onChange={(event) => setFile(event.target.files?.[0])} /></label><label>Role restore password<input type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-button">Restore role workspace</button><p>Connected restores check current authority and saved report bindings. Offline restores open local backups only; connect and verify the program before any transaction.</p></form>
          <RecoveryJournal />
        </> : <>
          <p className="public-value">Network: {vault.network} · Program: {vault.programId}</p>{vault.contractAddress && <p className="public-value">Contract: {vault.contractAddress}</p>}
          {vault.contractAddress && !session && !recoveryRequired && <p className="operation-notice">Offline workspace: contract authority and current ledger state have not been checked. Connect Lace and verify the program before submitting transactions.</p>}
          {!backedUp && <p className="operation-notice" role="status">Save an updated single-role backup before any transaction. Draft edits, report notes, prepared reports and received disclosures are held in memory until backed up.</p>}
          <div className="button-row workspace-tabs"><button className="secondary-button" onClick={() => setTab("reports")}>Reports</button>{vault.role === "researcher" && <button className="secondary-button" onClick={() => setTab("prepare")}>Prepare report</button>}<button className="secondary-button" onClick={() => setTab("exchange")}>Disclosure exchange</button><button className="secondary-button" onClick={() => setTab("backup")}>Save role backup</button></div>
          {tab === "backup" && <form className="form-panel" onSubmit={(event) => form(event, async () => {
            if (password !== confirmation) throw new Error("Role backup passwords do not match");
            const encrypted = await encryptRoleVault(vault, password); download(encrypted, `vulnseal-role-${vault.role}-backup.json`); setSaved(vault); setPassword(""); setConfirmation(""); setMessage("Role backup downloaded. Confirm the file is saved; keep the file and password private.");
          })}><h2>Save {vault.role} authority</h2><p>This file contains this role's actor secret, prepared/received reports, submission journal, current report or vendor program draft and working notes for each saved report. Notes are editable working copies, not transaction history. Retain the separate receiving-key backup.</p><label>Role backup password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm role backup password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary-button">Download single-role backup</button></form>}
          {!vault.contractAddress && vault.role === "vendor" && tab === "reports" && <form className="form-panel" onSubmit={(event) => {
            const data = new FormData(event.currentTarget); form(event, async () => {
              const policy = readProgramForm(data);
              if (!backedUp) throw new Error("Save the vendor identity backup before deployment");
              requireJournal();
              const providers = await initializeBrowserProviders(vault.network, recordSubmission);
              const constructor = await programConstructor(hexToBytes(vault.programId), policy);
              const deployed = await duringSubmission({ circuit: "constructor", reportId: null }, () => VulnSealApi.deploy(providers, createVulnSealPrivateState(hexToBytes(vault.actorSecret)), constructor), { deployment: captureDeploymentInputs(constructor) });
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
          }}><h2>Deploy vendor program</h2><p>Program draft fields are included in encrypted role backups and browser autosave. Wait for the saved confirmation after editing before deploying or closing this workspace.</p><GitHubScopeImport onApply={(url) => updateProgramDraft("primaryScope", url)} />{([ ["name", "Program name"], ["primaryScope", "Primary scope"], ["additionalScope", "Additional scope"], ["rewardPolicy", "Reward policy"] ] as const).map(([name, label]) => <label key={name}>{label}{name === "rewardPolicy" ? <textarea name={name} value={programDraft[name]} onChange={(event) => updateProgramDraft(name, event.target.value)} maxLength={16384} required rows={4} /> : <input name={name} value={programDraft[name]} onChange={(event) => updateProgramDraft(name, event.target.value)} maxLength={16384} required={name !== "additionalScope"} />}</label>)}<label>Response days<select name="responseDays" value={programDraft.responseDays} onChange={(event) => updateProgramDraft("responseDays", event.target.value)}><option>2</option><option>7</option><option>14</option></select></label><label>Disclosure days<select name="disclosureDays" value={programDraft.disclosureDays} onChange={(event) => updateProgramDraft("disclosureDays", event.target.value)}><option>30</option><option>60</option><option>90</option></select></label><button className="primary-button" disabled={!backedUp || recoveryRequired}>Connect Lace and deploy program</button></form>}
          {!session && !recoveryRequired && tab === "reports" && <form className="form-panel" onSubmit={(event) => form(event, async () => {
            const updated = await validateRoleVault({ ...vault, contractAddress: vault.contractAddress ?? address.trim().toLowerCase() });
            const joined = await joinRoleVault(updated, recordSubmission); setVault(updated); setSession(joined.session); setSnapshot(joined.snapshot);
          })}><h2>Reconnect an existing program</h2><p>For a pre-deployment backup, enter the address from your finalized deployment receipt. The vendor key must match.</p>{!vault.contractAddress && <label>Existing contract address<input value={address} required onChange={(event) => setAddress(event.target.value)} /></label>}<button className="secondary-button">Connect Lace and verify program</button></form>}
          {vault.contractAddress && tab === "reports" && <section className="form-panel"><h2>Program reports</h2>{session && <button className="secondary-button" onClick={() => run(load)}>Refresh ledger</button>}{session && vault.role === "vendor" && <button className="secondary-button" onClick={() => download(JSON.stringify({ format: "vulnseal-program-invitation", version: 1, network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId }), "vulnseal-program-invitation.json")}>Download public program invitation</button>}{vault.role === "vendor" && <label>Share public program invitation<input className="public-value" readOnly value={programInvitationLink(window.location.href, { format: "vulnseal-program-invitation", version: 1, network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId })} onFocus={event => event.currentTarget.select()} /></label>}
            {vault.role === "vendor" && <VendorPolicyExport draft={vault.programDraft} network={vault.network} contractAddress={vault.contractAddress} programId={vault.programId} onDownload={text => download(text, "vulnseal-public-policy.json")} />}
            {vault.role === "vendor" && <details><summary>Embed report entry on your website</summary><p>This widget opens the public invitation in a separate VulnSeal tab. Report details and keys stay in that workspace. Use the URL of your hosted release when publishing this code.</p><label>Submission widget embed code<textarea readOnly rows={7} value={submissionEmbed(window.location.href, { format: "vulnseal-program-invitation", version: 1, network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId })} onFocus={event => event.currentTarget.select()} /></label></details>}
            <SavedReportSelector reports={vault.reports} selectedId={selectedId} onChange={(id) => { setSelectedId(id); setReceipt(undefined); }} />
            {chosen && <><p className="public-value">Report: {chosen.reportId}</p><SelectedRoleReport key={chosen.reportId} disclosure={chosen} /><p>{snapshot ? status ?? "Prepared locally; absent from the current ledger snapshot" : "Refresh ledger state before continuing. A prior transaction may still require reconciliation."}</p>
              <section aria-label="Saved ciphertext storage"><h3>Store this encrypted report</h3><p>Save an encrypted role backup first, then upload the exact saved ciphertext. You can repeat this upload after a storage failure or restore; its report ID, encryption key and content address stay the same. Only ciphertext is sent. This action does not connect Lace or submit a transaction.</p>
                <CipherstoreDestinations urls={env.cipherstoreUrls} />
                <p>Check reads each configured store independently and validates the returned bytes. Each request has a 20-second deadline and a 5 MiB limit.</p>
                <button type="button" className="secondary-button" onClick={() => run(async () => {
                  setCopyCheck(undefined);
                  const address = `sha256:${bytesToHex(await sha256(utf8(chosen.envelope)))}`;
                  setCopyCheck(await verifyCipherstoreCopies(env.cipherstoreUrls, address));
                })}>Check stored copies</button>
                {copyCheck && <section aria-label="Stored copy results">
                  <p role="status">{copyCheck.copies.filter((copy) => copy.verified).length} of {copyCheck.copies.length} stores returned verified ciphertext. Checked {copyCheck.checkedAt}.</p>
                  <ul>{copyCheck.copies.map((copy) => <li key={copy.endpoint}><span className="public-value">{copy.endpoint}</span>: {copy.verified ? "Verified" : "Not verified"} — {copy.detail}</li>)}</ul>
                  <p>This is a read-only snapshot, not a retention guarantee or ledger receipt. No fallback or repair upload hides a failed copy. Keep your encrypted backup.</p>
                </section>}
                <button type="button" className="secondary-button" disabled={!backedUp} onClick={() => run(async () => {
                  if (!backedUp) throw new Error("Save this report in an encrypted role backup before uploading");
                  setCopyCheck(undefined);
                  await uploadDisclosure(chosen); setMessage("Storage acknowledged the saved ciphertext. Keep your backup; this is not a ledger receipt or a retention guarantee.");
                })}>Upload saved ciphertext</button>
                <p>To copy this workspace to the configured stores, upload all saved reports in order. The first unconfirmed upload stops the batch. Repeating it sends the same ciphertext again.</p>
                <button type="button" className="secondary-button" disabled={!backedUp} onClick={uploadAll}>Upload all saved ciphertext ({vault.reports.length})</button>
              </section>
              <p>Working notes and the selected tier are saved privately per report in encrypted backups and browser autosave. Each report submission also keeps a snapshot in its journal entry, so later edits preserve that earlier context. These are local notes, not verified transaction arguments. Only an explicit transaction publishes its corresponding digest or tier.</p>
              {vault.role === "vendor" && <GitHubReleaseImport key={chosen.reportId} onAppend={(text) => updateNotes(detail ? `${detail}\n\n${text}` : text, tier)} />}
              <label>Private decision, patch reference or retest notes<textarea value={detail} onChange={(event) => updateNotes(event.target.value, tier)} /></label><label>Public severity / reward tier<select value={tier} onChange={(event) => updateNotes(detail, event.target.value)}><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
              <fieldset className="workflow-controls" disabled={!backedUp || !snapshot || !session}>
                {session && vault.role === "researcher" && !record && <button className="primary-button" onClick={() => write(async () => {
                  const opened = await uploadDisclosure(chosen);
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
          {tab === "prepare" && vault.role === "researcher" && <><p>Preparing encrypts the report locally without contacting storage. Save the prepared report in an encrypted role backup, then upload its saved ciphertext from Reports. Browser autosave also saves prepared reports when enabled; wait for confirmation before closing. Midnight submission requires a verified connection and checks storage by uploading the same saved ciphertext first.</p><ReportWizard preserveDraftLines attachmentDraft={vault.attachmentDraft ?? emptyAttachmentDraft} onAttachmentDraftChange={(next) => setVault((current) => current ? withAttachmentDraft(current, next) : current)} report={draft} onChange={(next) => setVault((current) => current ? withRoleDraft(current, next) : current)} onSeal={() => run(async () => {
            const encrypted = await sealReport({ ...draft, reproductionSteps: draft.reproductionSteps.filter((step) => step.trim().length > 0) }, vault.programId); const salt = randomBytes(32);
            const id = bytesToHex(pureCircuits.deriveReportCommitment(hexToBytes(vault.programId), Uint8Array.from(encrypted.canonicalReportDigest), salt));
            const prepared: Disclosure = { network: vault.network, contractAddress: vault.contractAddress, programId: vault.programId, reportId: id, envelope: encrypted.serializedEnvelope, key: bytesToHex(encrypted.key), salt: bytesToHex(salt) };
            const updated = await validateRoleVault(withRoleDraft({ ...vault, reports: [...vault.reports, prepared] }, null));
            currentVault.current = updated; setVault(updated); setSelectedId(id); setTab("backup");
            setMessage("Report encrypted locally. Save its role backup before uploading the saved ciphertext. No upload or transaction has started.");
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
