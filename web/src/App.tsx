// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { VulnSealApi } from "@vulnseal/api/api";
import { createCipherstoreClient } from "@vulnseal/api/cipherstore-client";
import { CipherstoreDestinations } from "./CipherstoreDestinations.js";
import type { TransactionEvidence, VulnSealProviders } from "@vulnseal/api/types";
import {
  createVulnSealPrivateState,
  pureCircuits,
} from "@vulnseal/contract";
import {
  bytesToHex,
  hexToBytes,
  contractStatusName,
  openReport,
  publicStatusLabel,
  randomBytes,
  sealReport,
  sha256,
  utf8,
  validateEnvironment,
  type ReportStatusName,
  type SealedReport,
  type VulnerabilityReport,
} from "@vulnseal/shared";
import { initializeBrowserProviders } from "./midnight/browser-providers.js";
import { workflowTimeline, workflowStatement, type WorkflowEvent, type WorkflowTimeline } from "./workflow.js";
import { defaultProgram, defaultProgramDraft, readProgramForm, programConstructor, severityLabel, type ProgramDraft, type ProgramPolicy } from "./program.js";
import { encryptRecovery, decryptRecovery, verifyRecoveryLedger, type RecoverySnapshot, type UncertainCircuit } from "./recovery.js";
import { RecoveryPanel } from "./RecoveryPanel.js";
import { PublicLookup } from "./PublicLookup.js";
import { emptyAttachmentDraft, type AttachmentDraft } from "./attachment-draft.js";
import { AttachmentEditor, AttachmentReview } from "./AttachmentFields.js";
import { HandoffPanel } from "./HandoffPanel.js";
import type { RecipientKeys } from "./handoff.js";
import { parsePublicReceipt } from "./public-verification.js";
import { submissionWait } from "./submission-wait.js";
import { RecoveryAutosave } from "./recovery-autosave.js";
import { writeStoredRecovery } from "./recovery-storage.js";
import { CombinedDeploymentRecovery } from "./CombinedDeploymentRecovery.js";
import { continuationDeadline } from "./midnight/continuation-deadline.js";
import { TransactionCheck } from "./TransactionCheck.js";
import { demoTransitionWait } from "./demo-transition-wait.js";

type Screen =
  | "home"
  | "dashboard"
  | "create"
  | "submit"
  | "seal"
  | "receipt"
  | "triage"
  | "resolution"
  | "verify"
  | "recovery"
  | "lookup"
  | "handoff"
  | "privacy";
type Persona = "researcher" | "vendor" | "verifier";
type RuntimeMode = "guided-local" | "midnight";
type Operation =
  | { readonly state: "idle" }
  | { readonly state: "working"; readonly label: string; readonly detail: string }
  | { readonly state: "error"; readonly label: string; readonly detail: string };

const env = validateEnvironment(import.meta.env);

const shortHex = (value?: Uint8Array): string => {
  if (value === undefined) return "Not anchored";
  const hex = bytesToHex(value);
  return `${hex.slice(0, 10)}…${hex.slice(-8)}`;
};


const initialReport: VulnerabilityReport = {
  schemaVersion: 1,
  title: "Cross-tenant authorization bypass",
  summary: "A low-privilege token can read configuration from a second tenant.",
  affectedAsset: "api.acme.test/v1/organizations/:id/settings",
  weakness: "CWE-862 — Missing Authorization",
  reproductionSteps: [
    "Create two isolated test organizations.",
    "Authenticate as a low-privilege member of the first organization.",
    "Request the settings endpoint using the second organization identifier.",
  ],
  impact: "An attacker can read sensitive configuration belonging to another tenant.",
  suggestedRemediation: "Resolve tenant scope from the authenticated principal and enforce it before lookup.",
  attachments: [],
  researcherContact: "researcher+sealed@example.test",
};

const navigation: ReadonlyArray<{ screen: Screen; label: string; icon: string }> = [
  { screen: "dashboard", label: "Program", icon: "▦" },
  { screen: "submit", label: "Submit", icon: "＋" },
  { screen: "triage", label: "Triage", icon: "◎" },
  { screen: "resolution", label: "Resolve", icon: "✓" },
  { screen: "verify", label: "Verify", icon: "⌁" },
  { screen: "privacy", label: "Privacy", icon: "◈" },
];

function Icon({ children }: { readonly children: ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function Pill({ tone = "neutral", children }: { readonly tone?: string; readonly children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function HashValue({ label, value }: { readonly label: string; readonly value: Uint8Array | undefined }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const full = value === undefined ? "" : bytesToHex(value);
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(full); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };
  return (
    <div className="hash-row">
      <div>
        <span className="eyebrow">{label}</span>
        <code title={full}>{copyState === "failed" ? full : shortHex(value)}</code>
      </div>
      {value !== undefined && (
        <button className="icon-button" aria-label={`Copy ${label}`} onClick={() => void copy()}>{copyState === "copied" ? "Copied" : "Copy"}</button>
      )}
      {copyState === "failed" && <span role="status">Clipboard unavailable. Select the value to copy it manually.</span>}
    </div>
  );
}

function EmptyState({ title, detail, action }: {
  readonly title: string;
  readonly detail: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark" aria-hidden="true">◇</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>(() => window.location.hash.startsWith("#verify?") ? "lookup" : "home");
  const [persona, setPersona] = useState<Persona>("researcher");
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(env.mode);
  const [vendorSecret, setVendorSecret] = useState(() => randomBytes(32));
  const [researcherSecret, setResearcherSecret] = useState(() => randomBytes(32));
  const [recipientKeys, setRecipientKeys] = useState<RecipientKeys>();
  const [activeNetwork, setActiveNetwork] = useState(env.network === "undeployed" ? "preprod" : env.network);
  const busy = useRef(false);
  const [providers, setProviders] = useState<VulnSealProviders>();
  const [api, setApi] = useState<VulnSealApi>();
  const [deploymentPasswords, setDeploymentPasswords] = useState({ password: "", confirmation: "" });
  const [deploymentTransactionId, setDeploymentTransactionId] = useState<string>();
  const [deploymentBackupNotice, setDeploymentBackupNotice] = useState("");
  const deploymentCheckpoint = useRef<((id: string) => Promise<void>) | undefined>(undefined);
  const deploymentWait = useRef<ReturnType<typeof submissionWait> | undefined>(undefined);
  const deploymentGeneration = useRef(0);
  useEffect(() => () => { deploymentGeneration.current++; deploymentWait.current?.cancel(); }, []);
  const [deploymentAttempt, setDeploymentAttempt] = useState<RecoverySnapshot["deploymentAttempt"]>();
  const [programCreated, setProgramCreated] = useState(env.mode === "guided-local");
  const [programBytes, setProgramBytes] = useState(() => randomBytes(32));
  const [programPolicy, setProgramPolicy] = useState(defaultProgram);
  const [autosaveNotice, setAutosaveNotice] = useState("");
  const [programDraft, setProgramDraft] = useState<ProgramDraft>(defaultProgramDraft);
  const [severity, setSeverity] = useState(3);
  const [acceptedSeverity, setAcceptedSeverity] = useState(3);
  const [rationale, setRationale] = useState("Authorization is missing after organization lookup. Reproduced in the test tenant.");
  const [report, setReport] = useState<VulnerabilityReport>(initialReport);
  const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft>(emptyAttachmentDraft);
  const [sealed, setSealed] = useState<SealedReport>();
  const [pendingPreparation, setPendingPreparation] = useState<{ sealed: SealedReport; salt: Uint8Array; id: Uint8Array; submissionStarted: boolean }>();
  const [vendorReport, setVendorReport] = useState<VulnerabilityReport>();
  const [usingLocalCiphertext, setUsingLocalCiphertext] = useState(false);
  const [reportSalt, setReportSalt] = useState<Uint8Array>();
  const [reportId, setReportId] = useState<Uint8Array>();
  const [patchCommitment, setPatchCommitment] = useState<Uint8Array>();
  const [retestCommitment, setRetestCommitment] = useState<Uint8Array>();
  const [payoutReceipt, setPayoutReceipt] = useState<Uint8Array>();
  const [status, setStatus] = useState<ReportStatusName>("COMMITTED");
  const [evidence, setEvidence] = useState<TransactionEvidence[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [uncertainTransition, setUncertainTransition] = useState<UncertainCircuit | null>(null);
  const [operation, setOperation] = useState<Operation>({ state: "idle" });
  const [patchReference, setPatchReference] = useState("release/2026.09.1+7f34c82");
  const [retestNotes, setRetestNotes] = useState("Original reproduction now returns HTTP 403 for the cross-tenant request.");
  const draftState = JSON.stringify({ report, attachmentDraft, severity, rationale, patchReference, retestNotes });
  const initialDraftState = useRef(draftState);
  // Download initiation cannot prove that a recovery file was saved. Keep the
  // guard while this tab holds report/authority material or edited private input.
  const hasPrivateSessionMaterial = Boolean(deploymentPasswords.password || deploymentPasswords.confirmation || deploymentAttempt || JSON.stringify(programDraft) !== JSON.stringify(defaultProgramDraft) || api || sealed || reportId || pendingPreparation || uncertainTransition || recipientKeys || programPolicy !== defaultProgram || draftState !== initialDraftState.current);
  useEffect(() => {
    if (!hasPrivateSessionMaterial && operation.state !== "working") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPrivateSessionMaterial, operation.state]);

  const modeLabel = runtimeMode === "midnight" ? "Midnight network" : "Guided local";
  const networkReady = api !== undefined;
  const timeline = useMemo(() => workflowTimeline(events), [events]);

  const recordTransition = (next: ReportStatusName, transaction?: TransactionEvidence): void => {
    setStatus(next);
    setEvents((entries) => [...entries, { status: next, ...(transaction ? { evidence: transaction } : {}) }]);
    if (transaction) setEvidence((entries) => [...entries, transaction]);
  };

  const beginAction = (allowed?: readonly ReportStatusName[]): boolean => {
    if (busy.current) return false;
    if (uncertainTransition) {
      setOperation({ state: "error", label: "Transaction outcome needs reconciliation", detail: "Keep an encrypted backup. Further transactions and resetting this report are blocked because the previous call may still finalize." });
      return false;
    }
    if (needsRefresh) {
      setOperation({ state: "error", label: "Public commitments need a refresh", detail: "The transaction finalized. Refresh public commitments before continuing; do not resubmit it." });
      return false;
    }
    if (runtimeMode === "midnight" && api === undefined) {
      setOperation({ state: "error", label: "Program not deployed", detail: "Connect Lace and create a Midnight program before submitting reports or changing their status." });
      return false;
    }
    if (allowed && (!reportId || !allowed.includes(status))) {
      setOperation({ state: "error", label: "Transition unavailable", detail: "This action is not allowed at the report’s current stage." });
      return false;
    }
    busy.current = true;
    return true;
  };

  const refreshCommitments = async (expectedStatus = status): Promise<void> => {
    if (!api || !reportId) return;
    setNeedsRefresh(true);
    const snapshot = await api.readPublicState();
    const record = snapshot.ledger.reports.lookup(reportId);
    if (contractStatusName(record.status) !== expectedStatus) throw new Error("Indexer state does not match the finalized session transition. Refresh public commitments again before continuing.");
    const present = (value: Uint8Array) => value.some((byte) => byte !== 0) ? value : undefined;
    setPatchCommitment(present(record.patchCommitment));
    setRetestCommitment(present(record.retestCommitment));
    setPayoutReceipt(present(record.payoutReceipt));
    setNeedsRefresh(false);
  };

  const retryPublicRead = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setOperation({ state: "working", label: "Refreshing public commitments", detail: "Reading the indexer without submitting another transaction." });
    try {
      await refreshCommitments();
      setOperation({ state: "idle" });
    } catch {
      setOperation({ state: "error", label: "Public read unavailable", detail: "The finalized transaction is retained. Try Refresh public commitments when the indexer is available." });
    } finally { busy.current = false; }
  };

  const changeScreen = (next: Screen, nextPersona?: Persona): void => {
    if (nextPersona !== undefined) setPersona(nextPersona);
    setScreen(next);
    window.scrollTo?.({ top: 0, behavior: "auto" });
  };

  const connectWallet = async (): Promise<void> => {
    if (busy.current || providers || deploymentAttempt) return;
    if (reportId || pendingPreparation) {
      setOperation({ state: "error", label: "Local report remains local", detail: pendingPreparation ? "Keep this prepared report and export its encrypted backup through Private recovery. Open a separate session for a network report." : "A guided report cannot become a network report by connecting a wallet. Open its submission receipt and choose Seal another to start a fresh session first." });
      return;
    }
    busy.current = true;
    setOperation({ state: "working", label: "Connecting wallet", detail: "Waiting for a compatible Lace connector API." });
    try {
      const initialized = await initializeBrowserProviders(activeNetwork, async (id) => { await deploymentCheckpoint.current?.(id); });
      setProviders(initialized);
      setRuntimeMode("midnight");
      setProgramCreated(false);
      setOperation({ state: "idle" });
    } catch (error) {
      setOperation({
        state: "error",
        label: "Wallet unavailable",
        detail: error instanceof Error ? error.message : "Wallet connection failed",
      });
    } finally { busy.current = false; }
  };

  const createProgram = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy.current) return;
    if (deploymentAttempt) {
      setOperation({ state: "error", label: "Deployment outcome needs investigation", detail: "Keep this attempt and its encrypted backup. Creating another program is blocked because the original may still finalize." });
      return;
    }
    if (reportId || pendingPreparation || api) {
      setOperation({ state: "error", label: "Program already in use", detail: "Keep this program open to finish the current workflow. Create a separate program in a new tab." });
      return;
    }
    busy.current = true;
    const form = new FormData(event.currentTarget);
    const generation = deploymentGeneration.current;
    const assertCurrent = () => { if (generation !== deploymentGeneration.current) throw new Error("Workspace closed before deployment; no transaction was submitted by this continuation"); };
    setOperation({ state: "working", label: "Creating program", detail: networkReady ? "Generating a deployment proof and awaiting finality." : "Preparing the guided local program." });
    try {
      const policy = readProgramForm(form);
      const identifier = randomBytes(32);
      const constructor = await programConstructor(identifier, policy);
      assertCurrent();
      if (runtimeMode === "midnight") {
        if (providers === undefined) throw new Error("Connect a wallet before deploying a Midnight program");
        if (deploymentPasswords.password !== deploymentPasswords.confirmation) throw new Error("Deployment backup passwords do not match");
        const attempt = { startedAt: new Date().toISOString() };
        const checkpointSnapshot: RecoverySnapshot = { ...liveRecoverySnapshot, version: 6, deploymentAttempt: attempt, programId: bytesToHex(identifier), policy };
        const encrypted = await encryptRecovery(checkpointSnapshot, deploymentPasswords.password);
        assertCurrent();
        const row = await writeStoredRecovery(crypto.randomUUID(), "Combined deployment", encrypted, null);
        assertCurrent();
        const writer = new RecoveryAutosave(row, deploymentPasswords.password);
        setDeploymentPasswords({ password: "", confirmation: "" });
        setProgramBytes(identifier); setProgramPolicy(policy); setDeploymentAttempt(attempt);
        setDeploymentBackupNotice(`Encrypted deployment copy saved (${row.id}, revision ${row.revision}). Keep its password separately.`);
        const wait = submissionWait(); deploymentWait.current = wait;
        let checkpointStarted = false;
        deploymentCheckpoint.current = async (id) => {
          wait.assertActive();
          if (checkpointStarted) throw new Error("A deployment checkpoint already started; duplicate submission is blocked");
          checkpointStarted = true;
          if (!/^(?:[a-f0-9]{64}|[a-f0-9]{66})$/.test(id)) throw new Error("Invalid deployment transaction identifier; broadcast is blocked");
          setDeploymentTransactionId(id);
          const next: RecoverySnapshot = { ...checkpointSnapshot, version: 7, deploymentTransactionId: id };
          const committed = await writer.save(next);
          wait.checkpoint(id);
          setDeploymentBackupNotice(`Pre-broadcast deployment checkpoint saved (${committed.id}, revision ${committed.revision}). Download an updated backup after finality.`);
        };
        try {
          const deployed = await wait.run(async () => {
            const result = await VulnSealApi.deploy(providers, createVulnSealPrivateState(vendorSecret), constructor);
            if (!wait.transactionId || result.evidence.txId !== wait.transactionId) throw new Error("Deployment result does not match its saved transaction checkpoint; keep the backup and investigate.");
            return result;
          });
          deploymentCheckpoint.current = undefined;
          setDeploymentAttempt(undefined); setApi(deployed.api); setEvidence([deployed.evidence]);
          setOperation({ state: "working", label: "Saving confirmed deployment", detail: "The deployment finalized. Updating its encrypted browser recovery copy with the confirmed contract address." });
          // A recovery-save failure cannot undo already confirmed deployment.
          const { deploymentAttempt: _attempt, ...material } = checkpointSnapshot;
          try {
            const updated = await writer.save({ ...material, version: 7, contractAddress: deployed.api.contractAddress, deploymentTransactionId: deployed.evidence.txId });
            assertCurrent();
            setDeploymentBackupNotice(`Confirmed deployment address saved in encrypted browser copy ${updated.id} (revision ${updated.revision}). Keep a separate file backup; restore will verify the contract on its network.`);
          } catch (cause) {
            assertCurrent();
            setDeploymentBackupNotice(`Deployment finalized, but its browser recovery update was not confirmed. Keep the saved browser copy and this tab open, and download an updated file backup. A late storage update may already have committed. ${cause instanceof Error ? cause.message : "Storage unavailable"}`);
          }
        } finally {
          writer.stop(); deploymentWait.current = undefined;
          // Failure retains the closed callback so late SDK continuations cannot broadcast.
        }
      }
      setProgramBytes(identifier);
      setProgramPolicy(policy);
      setProgramCreated(true);
      setOperation({ state: "idle" });
      changeScreen("dashboard", "vendor");
    } catch (error) {
      setOperation({ state: "error", label: "Program creation failed", detail: error instanceof Error ? error.message : "Unknown deployment error" });
    } finally { busy.current = false; }
  };

  const submitSealedReport = async (): Promise<void> => {
    if (reportId) {
      changeScreen("receipt");
      return;
    }
    if (pendingPreparation?.submissionStarted) {
      setOperation({ state: "error", label: "Submission outcome needs reconciliation", detail: "Submission setup already started for this saved report. Keep an encrypted backup and check the wallet and ledger; this screen cannot safely resubmit it." });
      return;
    }
    if (!beginAction()) return;
    changeScreen("seal", "researcher");
    setOperation({ state: "working", label: "Canonicalizing report", detail: "Normalizing a deterministic private report document in this browser." });
    try {
      await Promise.resolve();
      const encrypted = pendingPreparation?.sealed ?? await sealReport(report, bytesToHex(programBytes));
      const salt = pendingPreparation?.salt ?? randomBytes(32);
      const commitment = pendingPreparation?.id ?? pureCircuits.deriveReportCommitment(Uint8Array.from(programBytes), Uint8Array.from(encrypted.canonicalReportDigest), Uint8Array.from(salt));
      const prepared = { sealed: encrypted, salt, id: commitment, submissionStarted: false };
      setPendingPreparation(prepared);
      setOperation({ state: "working", label: "Uploading ciphertext", detail: `Sending only the authenticated AES-256-GCM envelope to ${env.cipherstoreUrls.length} configured storage endpoint(s).` });
      await createCipherstoreClient(env.cipherstoreUrls).put(
        encrypted.contentAddress,
        encrypted.serializedEnvelope,
      );
      setOperation({
        state: "working",
        label: runtimeMode === "midnight" ? "Generating ownership proof" : "Preparing Compact commitment",
        detail: runtimeMode === "midnight"
          ? "Lace will authorize the transaction after the proof server returns a real proof."
          : "Guided local mode calculates the real Compact commitment but does not submit a transaction.",
      });
      let transaction: TransactionEvidence | undefined;
      if (api !== undefined) {
        // Conservatively retain uncertainty even if private-state setup fails before the wallet call.
        setPendingPreparation({ ...prepared, submissionStarted: true });
        transaction = await demoTransitionWait(() => api.usePrivateState(
          createVulnSealPrivateState(researcherSecret, {
            programId: programBytes,
            canonicalDigest: encrypted.canonicalReportDigest,
            salt,
          }),
        ), () => api.submitReport(encrypted.ciphertextDigest));
      }
      setSealed(encrypted);
      setReportSalt(salt);
      setReportId(commitment);
      setPendingPreparation(undefined);
      recordTransition("COMMITTED", transaction);
      setOperation({ state: "idle" });
      changeScreen("receipt", "researcher");
    } catch (error) {
      setOperation({
        state: "error",
        label: "Report preparation interrupted",
        detail: error instanceof Error ? error.message : "Unknown sealing error",
      });
    } finally { busy.current = false; }
  };

  const openVendorReview = async (): Promise<void> => {
    if (busy.current) return;
    if (sealed === undefined) {
      changeScreen("triage", "vendor");
      return;
    }
    busy.current = true;
    setOperation({
      state: "working",
      label: "Opening encrypted report",
      detail: "Fetching the digest-validated ciphertext and decrypting it in this browser.",
    });
    try {
      let serialized: string;
      try {
        serialized = await createCipherstoreClient(env.cipherstoreUrls).get(sealed.contentAddress);
        setUsingLocalCiphertext(false);
      } catch {
        serialized = sealed.serializedEnvelope;
        setUsingLocalCiphertext(true);
      }
      setVendorReport(await openReport(serialized, sealed.key));
      setOperation({ state: "idle" });
      changeScreen("triage", "vendor");
    } catch (error) {
      setOperation({
        state: "error",
        label: "Vendor decryption failed",
        detail: error instanceof Error ? error.message : "Unable to open encrypted report",
      });
    } finally { busy.current = false; }
  };

  const vendorTransition = async (kind: "triage" | "accept" | "reject"): Promise<void> => {
    if (reportId === undefined) return;
    if (!beginAction(kind === "triage" ? ["COMMITTED"] : ["TRIAGED"])) return;
    setOperation({ state: "working", label: kind === "triage" ? "Opening triage" : kind === "accept" ? "Accepting report" : "Rejecting report", detail: api ? "Proving vendor authorization and awaiting finality." : "Updating the clearly labeled guided local workflow." });
    try {
      if (kind !== "triage" && !rationale.trim()) throw new Error("Enter a private decision rationale");
      const rationaleDigest = kind === "triage" ? undefined : await sha256(utf8(rationale.trim()));
      let transaction: TransactionEvidence | undefined;
      if (api !== undefined) {
        setUncertainTransition(kind === "triage" ? "beginTriage" : kind === "accept" ? "acceptReport" : "rejectReport");
        transaction = await demoTransitionWait(
          () => api.usePrivateState(createVulnSealPrivateState(vendorSecret)),
          () => kind === "triage" ? api.beginTriage(reportId)
            : kind === "accept" ? api.acceptReport(reportId, BigInt(severity), rationaleDigest!)
              : api.rejectReport(reportId, rationaleDigest!),
        );
        setUncertainTransition(null);
      }
      if (kind === "accept") setAcceptedSeverity(severity);
      recordTransition(kind === "triage" ? "TRIAGED" : kind === "accept" ? "ACCEPTED" : "REJECTED", transaction);
      setOperation({ state: "idle" });
    } catch (error) {
      setOperation({ state: "error", label: "Transition interrupted", detail: error instanceof Error ? error.message : "Unknown transition error" });
    } finally { busy.current = false; }
  };

  const anchorPatch = async (): Promise<void> => {
    if (reportId === undefined) return;
    if (!beginAction(["ACCEPTED", "RETEST_FAILED"])) return;
    setOperation({ state: "working", label: "Anchoring patch", detail: api ? "Binding the private patch digest to this report." : "Preparing a local patch reference without claiming an on-chain transaction." });
    try {
      if (!patchReference.trim()) throw new Error("Enter a patch or release reference");
      const patchDigest = await sha256(utf8(patchReference));
      let transaction: TransactionEvidence | undefined;
      if (api !== undefined) {
        setUncertainTransition("anchorPatch");
        transaction = await demoTransitionWait(() => api.usePrivateState(
          createVulnSealPrivateState(vendorSecret, undefined, {
            reportId,
            patchDigest,
          }),
        ), () => api.anchorPatch(reportId));
        setUncertainTransition(null);
      }
      setPatchCommitment(api ? undefined : patchDigest);
      setRetestCommitment(undefined);
      setPayoutReceipt(undefined);
      recordTransition("PATCH_READY", transaction);
      if (api) await refreshCommitments("PATCH_READY");
      setOperation({ state: "idle" });
    } catch (error) {
      setOperation({ state: "error", label: "Patch anchoring interrupted", detail: error instanceof Error ? error.message : "Unknown patch error" });
    } finally { busy.current = false; }
  };

  const submitRetest = async (passed: boolean): Promise<void> => {
    if (reportId === undefined || reportSalt === undefined || sealed === undefined || patchCommitment === undefined) return;
    if (!beginAction(["PATCH_READY"])) return;
    setOperation({ state: "working", label: "Submitting retest", detail: api ? "Proving report ownership and binding private evidence to the anchored patch." : "Recording a local preview result without claiming a proof." });
    try {
      if (!retestNotes.trim()) throw new Error("Enter private retest notes");
      const evidenceDigest = await sha256(utf8(retestNotes));
      let transaction: TransactionEvidence | undefined;
      if (api !== undefined) {
        setUncertainTransition("submitRetest");
        transaction = await demoTransitionWait(() => api.usePrivateState(
          createVulnSealPrivateState(
            researcherSecret,
            {
              programId: programBytes,
              canonicalDigest: sealed.canonicalReportDigest,
              salt: reportSalt,
            },
            undefined,
            {
              reportId,
              patchCommitment,
              evidenceDigest,
            },
          ),
        ), () => api.submitRetest(reportId, passed));
        setUncertainTransition(null);
      }
      setRetestCommitment(api ? undefined : evidenceDigest);
      recordTransition(passed ? "RETEST_PASSED" : "RETEST_FAILED", transaction);
      if (api) await refreshCommitments(passed ? "RETEST_PASSED" : "RETEST_FAILED");
      setOperation({ state: "idle" });
    } catch (error) {
      setOperation({ state: "error", label: "Retest interrupted", detail: error instanceof Error ? error.message : "Unknown retest error" });
    } finally { busy.current = false; }
  };

  const authorizePayout = async (): Promise<void> => {
    if (reportId === undefined) return;
    if (!beginAction(["RETEST_PASSED"])) return;
    setOperation({ state: "working", label: "Authorizing payout", detail: api ? "Checking accepted and passed-retest state inside the contract." : "Recording local authorization only—no funds move." });
    try {
      const receipt = api ? undefined : await sha256(utf8(`local-preview:${bytesToHex(reportId)}:tier-${acceptedSeverity}`));
      let transaction: TransactionEvidence | undefined;
      if (api !== undefined) {
        setUncertainTransition("authorizePayout");
        transaction = await demoTransitionWait(
          () => api.usePrivateState(createVulnSealPrivateState(vendorSecret)),
          () => api.authorizePayout(reportId, BigInt(acceptedSeverity)),
        );
        setUncertainTransition(null);
      }
      recordTransition("PAYOUT_AUTHORIZED", transaction);
      setPayoutReceipt(receipt);
      if (api) await refreshCommitments("PAYOUT_AUTHORIZED");
      setOperation({ state: "idle" });
    } catch (error) {
      setOperation({ state: "error", label: "Payout authorization interrupted", detail: error instanceof Error ? error.message : "Unknown authorization error" });
    } finally { busy.current = false; }
  };

  const closeReport = async (): Promise<void> => {
    if (!reportId || !beginAction(["REJECTED", "PAYOUT_AUTHORIZED"])) return;
    setOperation({ state: "working", label: "Closing report", detail: api ? "Awaiting the authorized closure transaction." : "Closing the guided local workflow." });
    try {
      let transaction: TransactionEvidence | undefined;
      if (api) {
        setUncertainTransition("closeReport");
        transaction = await demoTransitionWait(
          () => api.usePrivateState(createVulnSealPrivateState(vendorSecret)),
          () => api.closeReport(reportId),
        );
        setUncertainTransition(null);
      }
      recordTransition("CLOSED", transaction);
      setOperation({ state: "idle" });
      changeScreen("verify", "verifier");
    } catch (error) {
      setOperation({ state: "error", label: "Closure interrupted", detail: error instanceof Error ? error.message : "Unable to close report" });
    } finally { busy.current = false; }
  };

  const resetDemo = (): void => {
    if (busy.current || uncertainTransition) return;
    setSealed(undefined);
    setPendingPreparation(undefined);
    setVendorReport(undefined);
    setReportSalt(undefined);
    setReportId(undefined);
    setPatchCommitment(undefined);
    setRetestCommitment(undefined);
    setPayoutReceipt(undefined);
    setStatus("COMMITTED");
    setEvents([]);
    setNeedsRefresh(false);
    setSeverity(3);
    setAcceptedSeverity(3);
    setEvidence(api === undefined ? [] : evidence.slice(0, 1));
    setOperation({ state: "idle" });
    changeScreen("submit", "researcher");
  };

  const liveRecoverySnapshot = useMemo<RecoverySnapshot>(() => {
    const encode = (value?: Uint8Array) => value ? bytesToHex(value) : null;
    return {
      version: deploymentTransactionId ? 7 : deploymentAttempt ? 6 : 5, ...(deploymentTransactionId ? { deploymentTransactionId } : {}), ...(deploymentAttempt ? { deploymentAttempt } : {}), programDraft, uncertainTransition, attachmentDraft, pendingReport: pendingPreparation ? { report: { envelope: pendingPreparation.sealed.serializedEnvelope, key: bytesToHex(pendingPreparation.sealed.key), salt: bytesToHex(pendingPreparation.salt), id: bytesToHex(pendingPreparation.id) }, submissionStarted: pendingPreparation.submissionStarted } : null, mode: runtimeMode, network: runtimeMode === "midnight" ? activeNetwork : "undeployed", contractAddress: api?.contractAddress ?? null,
      programId: bytesToHex(programBytes), policy: programPolicy, vendorSecret: bytesToHex(vendorSecret), researcherSecret: bytesToHex(researcherSecret), draft: report,
      report: sealed && reportSalt && reportId ? { envelope: sealed.serializedEnvelope, key: bytesToHex(sealed.key), salt: bytesToHex(reportSalt), id: bytesToHex(reportId) } : null,
      status, history: events.map((event) => event.status), patch: encode(patchCommitment), retest: encode(retestCommitment), payout: encode(payoutReceipt),
      severity: acceptedSeverity, rationale, patchReference, retestNotes,
    };
  }, [deploymentTransactionId, deploymentAttempt, programDraft, uncertainTransition, attachmentDraft, pendingPreparation, runtimeMode, activeNetwork, api, programBytes, programPolicy, vendorSecret, researcherSecret, report, sealed, reportSalt, reportId, status, events, patchCommitment, retestCommitment, payoutReceipt, acceptedSeverity, rationale, patchReference, retestNotes]);

  const recoverySnapshot = runtimeMode === "midnight" && !api && !deploymentAttempt ? undefined : liveRecoverySnapshot;

  const exportRecovery = async (password: string): Promise<string> => {
    if (busy.current) throw new Error("Wait for the current operation to finish");
    if (!recoverySnapshot) throw new Error("Create the network program before exporting its recovery material");
    busy.current = true;
    setOperation({ state: "working", label: "Encrypting recovery file", detail: "Deriving a password key locally. No private material is uploaded." });
    try {
      return await encryptRecovery(recoverySnapshot!, password);
    } finally { busy.current = false; setOperation({ state: "idle" }); }
  };

  const exportPublicReceipt = (): void => {
    if (!api || !reportId || !sealed || busy.current) return;
    const receipt = parsePublicReceipt(JSON.stringify({ kind: "vulnseal-public-receipt", version: 1, network: activeNetwork, contractAddress: api.contractAddress, reportId: bytesToHex(reportId), ciphertextDigest: bytesToHex(sealed.ciphertextDigest) }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "vulnseal-public-receipt.json";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importRecovery = async (serialized: string, password: string): Promise<void> => {
    if (busy.current || deploymentAttempt || reportId || pendingPreparation || api) throw new Error("Restore in a fresh tab to preserve this active session");
    busy.current = true;
    setOperation({ state: "working", label: "Restoring private session", detail: "Decrypting and checking report bindings before replacing this tab’s draft." });
    try {
      const { snapshot, sealed: restoredSeal, pendingSeal } = await decryptRecovery(serialized, password);
      let restoredApi: VulnSealApi | undefined;
      let restoredProviders: VulnSealProviders | undefined;
      let current: Awaited<ReturnType<typeof verifyRecoveryLedger>>;
      if (snapshot.mode === "midnight" && !snapshot.deploymentAttempt) {
        if (snapshot.network === "undeployed") throw new Error("A network backup must name its actual network");
        restoredProviders = await initializeBrowserProviders(snapshot.network);
        restoredApi = await VulnSealApi.join(restoredProviders, snapshot.contractAddress!, createVulnSealPrivateState(hexToBytes(snapshot.vendorSecret)));
        const publicState = await restoredApi.readPublicState();
        current = await verifyRecoveryLedger(snapshot, restoredSeal, publicState.ledger);
      }
      const decode = (value: string | null) => value === null ? undefined : hexToBytes(value);
      const nonzero = (value: Uint8Array) => value.some((byte) => byte !== 0) ? value : undefined;
      const restoredStatus = current ? contractStatusName(current.status) : snapshot.status;
      setProviders(restoredProviders); setApi(restoredApi); setRuntimeMode(snapshot.mode);
      if (snapshot.mode === "midnight") setActiveNetwork(snapshot.network as typeof activeNetwork);
      setDeploymentAttempt(snapshot.deploymentAttempt); setDeploymentTransactionId(snapshot.deploymentTransactionId);
      setProgramCreated(!snapshot.deploymentAttempt); setProgramBytes(hexToBytes(snapshot.programId)); setProgramPolicy(snapshot.policy);
      setProgramDraft(snapshot.programDraft ?? { ...snapshot.policy, responseDays: String(snapshot.policy.responseDays), disclosureDays: String(snapshot.policy.disclosureDays) });
      setVendorSecret(hexToBytes(snapshot.vendorSecret)); setResearcherSecret(hexToBytes(snapshot.researcherSecret));
      setReport(snapshot.draft); setAttachmentDraft(snapshot.attachmentDraft ?? emptyAttachmentDraft); setSealed(restoredSeal); setVendorReport(undefined);
      setPendingPreparation(snapshot.pendingReport && pendingSeal ? { sealed: pendingSeal, salt: hexToBytes(snapshot.pendingReport.report.salt), id: hexToBytes(snapshot.pendingReport.report.id), submissionStarted: snapshot.pendingReport.submissionStarted } : undefined);
      setReportSalt(snapshot.report ? hexToBytes(snapshot.report.salt) : undefined); setReportId(snapshot.report ? hexToBytes(snapshot.report.id) : undefined);
      setStatus(restoredStatus);
      setPatchCommitment(current ? nonzero(current.patchCommitment) : decode(snapshot.patch));
      setRetestCommitment(current ? nonzero(current.retestCommitment) : decode(snapshot.retest));
      setPayoutReceipt(current ? nonzero(current.payoutReceipt) : decode(snapshot.payout));
      const restoredSeverity = current && current.severity > 0n ? Number(current.severity) : snapshot.severity;
      setSeverity(restoredSeverity); setAcceptedSeverity(restoredSeverity);
      setRationale(snapshot.rationale); setPatchReference(snapshot.patchReference); setRetestNotes(snapshot.retestNotes);
      setEvidence([]); setNeedsRefresh(false); setUncertainTransition(snapshot.uncertainTransition ?? null);
      // Backup history is a local record, never imported finality evidence.
      setEvents(current ? [{ status: restoredStatus, source: "ledger" }] : snapshot.history.map((entry) => ({ status: entry, source: "recovered" })));
      changeScreen(snapshot.deploymentAttempt ? "create" : snapshot.report ? "receipt" : "submit");
    } finally { busy.current = false; setOperation({ state: "idle" }); }
  };

  const recoverDeployment = async (address: string, password: string) => {
    if (busy.current || !deploymentAttempt || !deploymentTransactionId || api) throw new Error("No deployment attempt is available for recovery");
    busy.current = true;
    const generation = deploymentGeneration.current;
    const { deploymentAttempt: _attempt, ...material } = liveRecoverySnapshot;
    const recovered: RecoverySnapshot = { ...material, version: 7, contractAddress: address };
    setOperation({ state: "working", label: "Recovering deployment", detail: "Checking current program and owner authority, then saving an encrypted browser copy." });
    try {
      await continuationDeadline(180_000, "Deployment recovery timed out. Keep your original backup; a late browser save may have committed. Recheck before reconnecting.", async assertActive => {
        const check = () => { assertActive(); if (deploymentGeneration.current !== generation) throw new Error("Deployment recovery closed"); };
        check();
        const connected = await initializeBrowserProviders(activeNetwork); check();
        const joined = await VulnSealApi.join(connected, address, createVulnSealPrivateState(vendorSecret)); check();
        if (joined.contractAddress !== address) throw new Error("Connected contract differs from the checked deployment address");
        const current = await joined.readPublicState(); check();
        await verifyRecoveryLedger(recovered, undefined, current.ledger); check();
        const encrypted = await encryptRecovery(recovered, password); check();
        const saved = await writeStoredRecovery(crypto.randomUUID(), "Recovered combined deployment", encrypted, null); check();
        deploymentCheckpoint.current = undefined;
        setProviders(connected); setApi(joined); setDeploymentAttempt(undefined); setProgramCreated(true);
        setDeploymentBackupNotice(`Recovered deployment address saved in a new encrypted browser copy, revision ${saved.revision}. Download it through Private recovery. This recovery trusts indexer/RPC inclusion and finality.`);
        changeScreen("submit");
      });
    } finally { busy.current = false; if (deploymentGeneration.current === generation) setOperation({ state: "idle" }); }
  };

  const main = (() => {
    switch (screen) {
      case "home":
        return <Landing onExplore={() => changeScreen("dashboard")} onSubmit={() => changeScreen("submit", "researcher")} />;
      case "dashboard":
        return <Dashboard programCreated={programCreated} programPolicy={programPolicy} programBytes={programBytes} status={status} reportId={reportId} timeline={timeline} onCreate={() => changeScreen("create", "vendor")} onTriage={() => void openVendorReview()} onVerify={() => changeScreen("verify", "verifier")} />;
      case "create":
        if (deploymentAttempt) return <section className="page narrow-page"><h1>Deployment outcome needs investigation</h1><p>The deployment attempt was recorded at {deploymentAttempt.startedAt}. Its result has not been confirmed here. Creating another program is blocked because the original may still finalize.</p><HashValue label="Attempted program identifier" value={programBytes} /><p>Program: {programPolicy.name}</p><p>Keep this tab open and save an encrypted backup through Private recovery. The backup retains the attempted program policy and authority; it does not prove finality. {deploymentTransactionId ? "The saved transaction identifier is shown below." : "This backup does not contain a transaction identifier."} Check the original wallet and network records before deciding what to do next.</p>{deploymentTransactionId && <><p className="public-value">Deployment transaction: {deploymentTransactionId}</p><TransactionCheck network={activeNetwork} transactionId={deploymentTransactionId} circuit="constructor" /><CombinedDeploymentRecovery snapshot={liveRecoverySnapshot} onRecover={recoverDeployment} /></>}{operation.state !== "idle" && <OperationNotice operation={operation} />}</section>;
        return <CreateProgram deploymentPasswords={deploymentPasswords} onDeploymentPasswords={setDeploymentPasswords} draft={programDraft} onChange={setProgramDraft} mode={runtimeMode} connected={providers !== undefined} operation={operation} onConnect={() => void connectWallet()} onSubmit={(event) => void createProgram(event)} />;
      case "submit":
        if (pendingPreparation) return <section className="page narrow-page"><h1>Keep the prepared report</h1><p>The exact encrypted report is retained. Save it through Private recovery before closing this tab. Editing a replacement here could lose the original encryption material.</p><p className="public-value">Report: {bytesToHex(pendingPreparation.id)}</p><PreparedReportReview report={JSON.parse(pendingPreparation.sealed.canonicalReport) as VulnerabilityReport} />{pendingPreparation.submissionStarted ? <p role="alert">Submission setup already started. Its outcome needs reconciliation; resubmission is blocked. Check your wallet and ledger before deciding what to do next.</p> : <button className="primary-button" onClick={() => void submitSealedReport()}>Retry saved report upload</button>}</section>;
        return <ReportWizard attachmentDraft={attachmentDraft} onAttachmentDraftChange={setAttachmentDraft} report={report} onChange={setReport} onSeal={() => void submitSealedReport()} />;
      case "seal":
        return <SealProgress operation={operation} hasPreparation={pendingPreparation !== undefined} canRetry={!pendingPreparation?.submissionStarted} onRetry={() => void submitSealedReport()} onBack={() => changeScreen("submit")} />;
      case "receipt":
        return <Receipt sealed={sealed} reportId={reportId} evidence={evidence} network={api !== undefined} onTriage={() => void openVendorReview()} onReset={resetDemo} resetBlocked={uncertainTransition !== null} />;
      case "triage":
        return <Triage transactionsBlocked={uncertainTransition !== null || needsRefresh} status={status} reportId={reportId} report={vendorReport} usingLocalCiphertext={usingLocalCiphertext} operation={operation} severity={severity} rationale={rationale} onSeverity={setSeverity} onRationale={setRationale} onBegin={() => void vendorTransition("triage")} onAccept={() => void vendorTransition("accept")} onReject={() => void vendorTransition("reject")} onResolution={() => changeScreen("resolution", "vendor")} onClose={() => void closeReport()} />;
      case "resolution":
        return <Resolution transactionsBlocked={uncertainTransition !== null || needsRefresh} status={status} reportId={reportId} patchCommitment={patchCommitment} retestCommitment={retestCommitment} payoutReceipt={payoutReceipt} operation={operation} severity={acceptedSeverity} patchReference={patchReference} retestNotes={retestNotes} onPatchReference={setPatchReference} onRetestNotes={setRetestNotes} onAnchor={() => void anchorPatch()} onRetest={(passed) => void submitRetest(passed)} onAuthorize={() => void authorizePayout()} onVerify={() => changeScreen("verify", "verifier")} onClose={() => void closeReport()} />;
      case "verify":
        return <Verifier status={status} reportId={reportId} sealed={sealed} patchCommitment={patchCommitment} retestCommitment={retestCommitment} payoutReceipt={payoutReceipt} timeline={timeline} network={api !== undefined} />;
      case "privacy":
        return <PrivacyModel />;
      case "recovery":
        return null; // Recovery form inputs survive in-app navigation below.
      case "lookup":
        return <PublicLookup />;
      case "handoff":
        return null;
    }
  })();

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => changeScreen("home")} aria-label="VulnSeal home">
          <span className="brand-mark" aria-hidden="true"><span>V</span></span>
          <span>VulnSeal<small>Proof of disclosure</small></span>
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <button key={item.screen} className={screen === item.screen ? "active" : ""} onClick={() => changeScreen(item.screen)}>
              <Icon>{item.icon}</Icon>{item.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <div className="persona-control" aria-label="Active persona">
            <span className="presence" aria-hidden="true" />
            <select value={persona} onChange={(event) => setPersona(event.target.value as Persona)} aria-label="Active persona">
              <option value="researcher">Researcher</option>
              <option value="vendor">Vendor</option>
              <option value="verifier">Verifier</option>
            </select>
          </div>
          <button className="network-button" disabled={operation.state === "working" || providers !== undefined || deploymentAttempt !== undefined} onClick={() => void connectWallet()}>
            <span className={`status-dot ${providers ? "online" : ""}`} aria-hidden="true" />
            {providers ? "Lace connected" : modeLabel}
          </button>
        </div>
      </header>
      {runtimeMode === "guided-local" && screen !== "lookup" && (
        <div className="truth-banner" role="status">
          <span>Guided local mode</span>
          Web Crypto and Compact commitment calculation are real. Workflow changes are not Midnight transactions. Network submissions require Lace and a deployed program.
        </div>
      )}
      {screen === "lookup" && <div className="truth-banner"><span>Read-only public lookup</span>No private report material, wallet connection, or transaction submission is used here.</div>}
      {runtimeMode === "midnight" && !networkReady && !deploymentAttempt && screen !== "lookup" && <div className="truth-banner" role="status"><span>Network setup required</span>Connect Lace and create a program before submitting a report. <button className="secondary-button" onClick={() => changeScreen("create", "vendor")}>Set up program</button></div>}
      {deploymentBackupNotice && <p role="status">{deploymentBackupNotice}</p>}
      {deploymentAttempt && <div className="truth-banner" role="alert"><span>Deployment outcome unconfirmed</span>Retain an encrypted backup through Private recovery. This session cannot create another program. <button className="secondary-button" onClick={() => changeScreen("create", "vendor")}>Review deployment attempt</button></div>}
      {uncertainTransition && <div className="truth-banner" role="alert"><span>Transaction outcome unknown: {uncertainTransition}</span>Keep an encrypted backup through Private recovery. Further transactions and resetting this report are blocked, including after restore. A ledger refresh does not establish whether this attempt is safe to repeat.</div>}
      <div className="session-actions"><a className="secondary-button" href="./#roles" target="_blank" rel="noreferrer noopener">Open role workspace</a><button className="secondary-button" disabled={operation.state === "working"} onClick={() => changeScreen("handoff")}>Private exchange</button><button className="secondary-button" disabled={operation.state === "working"} onClick={() => changeScreen("lookup", "verifier")}>Independent verifier</button><button className="secondary-button" disabled={operation.state === "working"} onClick={() => changeScreen("recovery")}>Private recovery</button>{reportId && <button className="secondary-button" disabled={operation.state === "working"} onClick={() => changeScreen("receipt")}>Submission receipt</button>}{api && reportId && <button className="secondary-button" disabled={operation.state === "working"} onClick={exportPublicReceipt}>Download public receipt</button>}{needsRefresh && <button className="primary-button" disabled={operation.state === "working"} onClick={() => void retryPublicRead()}>Refresh public commitments</button>}</div>
      {operation.state === "error" && screen !== "seal" && (
        <div className="global-operation" role="alert">
          <strong>{operation.label}</strong>
          <span>{operation.detail}</span>
        </div>
      )}
      {screen !== "recovery" && autosaveNotice && <p className="operation-notice" role="status">{autosaveNotice}</p>}
      <main id="main-content" aria-busy={operation.state === "working"}><fieldset className="workflow-controls" disabled={operation.state === "working"}>{main}<div hidden={screen !== "recovery"}><RecoveryPanel onAutosaveStatus={setAutosaveNotice} snapshot={recoverySnapshot} onExport={exportRecovery} onImport={importRecovery} canImport={!deploymentAttempt && !reportId && !pendingPreparation && !api} /></div><div hidden={screen !== "handoff"}><HandoffPanel keys={recipientKeys} onKeys={setRecipientKeys} disclosure={sealed && reportId && reportSalt ? { network: api ? activeNetwork : "undeployed", contractAddress: api?.contractAddress ?? null, programId: bytesToHex(programBytes), reportId: bytesToHex(reportId), envelope: sealed.serializedEnvelope, key: bytesToHex(sealed.key), salt: bytesToHex(reportSalt) } : undefined} /></div></fieldset></main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 5).map((item) => (
          <button key={item.screen} className={screen === item.screen ? "active" : ""} onClick={() => changeScreen(item.screen)}>
            <Icon>{item.icon}</Icon><span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function PreparedReportReview({ report }: { readonly report: VulnerabilityReport }) {
  return <details><summary>Read prepared private report</summary><h2>{report.title}</h2><p>{report.affectedAsset} · {report.weakness}</p><h3>Summary</h3><p>{report.summary}</p><h3>Impact</h3><p>{report.impact}</p><h3>Reproduction</h3><ol>{report.reproductionSteps.map((step, index) => <li key={index}>{step}</li>)}</ol><h3>Suggested remediation</h3><p>{report.suggestedRemediation || "Not provided"}</p><h3>Researcher contact</h3><p>{report.researcherContact || "Not provided"}</p><AttachmentReview attachments={report.attachments} /></details>;
}

function PageHeading({ eyebrow, title, detail, actions }: { readonly eyebrow: string; readonly title: string; readonly detail: string; readonly actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow accent">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Landing({ onExplore, onSubmit }: { readonly onExplore: () => void; readonly onSubmit: () => void }) {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <Pill tone="accent">Built for Midnight · Wave 1</Pill>
          <h1>Disclose the truth.<br /><span>Keep the exploit sealed.</span></h1>
          <p className="hero-lead">VulnSeal gives researchers and vendors a verifiable disclosure trail—without publishing exploit details, private evidence, or researcher identity.</p>
          <div className="button-row">
            <button className="primary-button" onClick={onSubmit}>Seal a vulnerability <span aria-hidden="true">→</span></button>
            <button className="secondary-button" onClick={onExplore}>Explore the demo</button>
          </div>
          <div className="trust-row" aria-label="Product assurances">
            <span>◈ Local encryption</span><span>⌁ Compact ownership circuit</span><span>✓ Minimal public state</span>
          </div>
        </div>
        <div className="hero-proof-card" aria-label="Example private disclosure workflow">
          <div className="proof-card-head"><span>ILLUSTRATIVE AUDIT PREVIEW</span><Pill tone="success">Product preview</Pill></div>
          <div className="sealed-document">
            <span className="lock-mark" aria-hidden="true">◆</span>
            <div><strong>Exploit details sealed</strong><small>AES-256-GCM · client encrypted</small></div>
          </div>
          <div className="mini-timeline">
            {["Report committed", "Vendor accepted", "Patch anchored", "Retest passed", "Payout authorized"].map((item, index) => (
              <div key={item}><span className="timeline-node">{index + 1}</span><p>{item}<small>{index === 0 ? "Example ledger position" : `Example transition 0${index + 1}`}</small></p></div>
            ))}
          </div>
          <div className="proof-card-foot"><span>Contents revealed</span><strong>Nothing</strong></div>
        </div>
      </section>
      <section className="principles" aria-label="How VulnSeal works">
        <article><span className="feature-number">01</span><h2>Seal locally</h2><p>The browser canonicalizes and encrypts the report before any upload. Plaintext never reaches the ciphertext service.</p></article>
        <article><span className="feature-number">02</span><h2>Prove the process</h2><p>Compact circuits constrain ownership, vendor authorization, patch binding, retest, and payout authorization.</p></article>
        <article><span className="feature-number">03</span><h2>Reveal only when safe</h2><p>Public observers verify the workflow and commitments—not the exploit, private discussion, or researcher contact.</p></article>
      </section>
    </div>
  );
}

function Dashboard({ programCreated, programPolicy, programBytes, status, reportId, timeline, onCreate, onTriage, onVerify }: {
  readonly programCreated: boolean; readonly status: ReportStatusName; readonly reportId: Uint8Array | undefined;
  readonly programPolicy: ProgramPolicy; readonly programBytes: Uint8Array;
  readonly timeline: WorkflowTimeline;
  readonly onCreate: () => void; readonly onTriage: () => void; readonly onVerify: () => void;
}) {
  if (!programCreated) return <section className="page"><EmptyState title="No disclosure program yet" detail="Publish scope and response commitments before accepting sealed reports." action={<button className="primary-button" onClick={onCreate}>Create program</button>} /></section>;
  const open = reportId !== undefined && !["REJECTED", "CLOSED", "PAYOUT_AUTHORIZED"].includes(status);
  return (
    <section className="page">
      <PageHeading eyebrow="Vendor workspace" title={programPolicy.name} detail="A public policy surface with a private disclosure channel." actions={<><button className="secondary-button" onClick={onVerify}>Public view</button><button className="primary-button" onClick={onCreate}>New program</button></>} />
      <div className="metric-grid">
        <article className="metric-card"><span>Open sealed reports</span><strong>{open ? "1" : "0"}</strong><small>{open ? "Requires vendor attention" : "No pending reports"}</small></article>
        <article className="metric-card"><span>Median first response</span><strong>—</strong><small>Waiting for real program data</small></article>
        <article className="metric-card"><span>Authorized in this session</span><strong>{timeline.some((event) => event.complete && event.entry === "PAYOUT_AUTHORIZED") ? "1" : "0"}</strong><small>Payout authorization is not a transfer</small></article>
        <article className="metric-card accent-card"><span>Privacy posture</span><strong>Sealed</strong><small>0 private report fields public</small></article>
      </div>
      <div className="dashboard-grid">
        <section className="panel report-panel">
          <div className="panel-head"><div><span className="eyebrow">Report queue</span><h2>Session disclosure</h2></div><Pill tone={open ? "warning" : "neutral"}>{open ? "1 open" : reportId ? "Inactive" : "Empty"}</Pill></div>
          {reportId ? (
            <button className="report-row" onClick={onTriage}>
              <span className="severity-mark" aria-hidden="true">◆</span><span><strong>Sealed report {shortHex(reportId)}</strong><small>Exploit content private · submission receipt available</small></span><Pill tone="accent">{publicStatusLabel[status]}</Pill><span aria-hidden="true">›</span>
            </button>
          ) : <EmptyState title="No reports have been sealed" detail="A researcher submission appears here after ciphertext storage and commitment." />}
        </section>
        <aside className="panel policy-card">
          <div className="panel-head"><div><span className="eyebrow">Public configuration</span><h2>Program policy</h2></div><span className="verified-mark" aria-label="Policy active">✓</span></div>
          <dl><div><dt>Scope</dt><dd>{[programPolicy.primaryScope, programPolicy.additionalScope].filter(Boolean).join(" · ")}</dd></div><div><dt>First response</dt><dd>Within {programPolicy.responseDays} days</dd></div><div><dt>Disclosure window</dt><dd>{programPolicy.disclosureDays} days</dd></div><div><dt>Reward policy</dt><dd className="policy-text">{programPolicy.rewardPolicy}</dd></div></dl>
          <HashValue label="Program identifier" value={programBytes} />
        </aside>
      </div>
      <section className="panel lifecycle-panel">
        <div className="panel-head"><div><span className="eyebrow">Current lifecycle</span><h2>Authorized workflow</h2></div><span className="muted">Contract-relative order</span></div>
        <div className="horizontal-timeline">{timeline.map(({ entry, complete, current }, index) => <div className={complete ? "complete" : ""} key={index}><span className={current ? "current" : ""}>{complete ? "✓" : index + 1}</span><small>{publicStatusLabel[entry]}</small></div>)}</div>
      </section>
    </section>
  );
}

function CreateProgram({ deploymentPasswords, onDeploymentPasswords, draft, onChange, mode, connected, operation, onConnect, onSubmit }: { readonly deploymentPasswords: { password: string; confirmation: string }; readonly onDeploymentPasswords: (value: { password: string; confirmation: string }) => void; readonly draft: ProgramDraft; readonly onChange: (draft: ProgramDraft) => void; readonly mode: RuntimeMode; readonly connected: boolean; readonly operation: Operation; readonly onConnect: () => void; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="page narrow-page">
      <PageHeading eyebrow="Vendor setup" title="Create a disclosure program" detail="Publish the minimum policy surface researchers need. Sensitive internal procedures stay off-ledger." />
      <form className="form-panel" onSubmit={onSubmit}>
        <div className="form-section"><span className="step-number">01</span><div><h2>Program identity</h2><p>This name is for the interface. Each program receives a random public identifier.</p></div></div>
        <label>Program name<input name="name" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} required /></label>
        <div className="field-grid"><label>Primary scope<input name="primaryScope" value={draft.primaryScope} onChange={(event) => onChange({ ...draft, primaryScope: event.target.value })} required /></label><label>Additional scope<input name="additionalScope" value={draft.additionalScope} onChange={(event) => onChange({ ...draft, additionalScope: event.target.value })} /></label></div>
        <div className="form-section"><span className="step-number">02</span><div><h2>Response and disclosure policy</h2><p>These values become public commitments and coarse policy fields.</p></div></div>
        <div className="field-grid"><label>First response target<select name="responseDays" value={draft.responseDays} onChange={(event) => onChange({ ...draft, responseDays: event.target.value })}><option value="2">2 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label><label>Coordinated disclosure window<select name="disclosureDays" value={draft.disclosureDays} onChange={(event) => onChange({ ...draft, disclosureDays: event.target.value })}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label></div>
        <label>Reward policy<textarea name="rewardPolicy" value={draft.rewardPolicy} onChange={(event) => onChange({ ...draft, rewardPolicy: event.target.value })} rows={4} required /></label>
        <div className="reveal-box"><span aria-hidden="true">◈</span><div><strong>What becomes public?</strong><p>Program identifier, authorization key, scope digest, response targets, and policy digests. Internal contacts and triage playbooks do not.</p></div></div>
        {mode === "midnight" && !connected && <div className="inline-error"><strong>Wallet disconnected</strong><span>Connect Lace before deployment.</span><button type="button" className="secondary-button" onClick={onConnect}>Connect Lace</button></div>}
        {mode === "midnight" && <section aria-label="Deployment recovery backup"><h2>Protect this deployment</h2><p>A required encrypted browser copy saves the program authority before SDK preparation and the transaction identifier before broadcast. Keep its password separately. Clearing site data removes this copy; download a file backup after the operation.</p><label>Deployment backup password<input type="password" autoComplete="new-password" minLength={12} required value={deploymentPasswords.password} onChange={event => onDeploymentPasswords({ ...deploymentPasswords, password: event.target.value })} /></label><label>Confirm deployment backup password<input type="password" autoComplete="new-password" minLength={12} required value={deploymentPasswords.confirmation} onChange={event => onDeploymentPasswords({ ...deploymentPasswords, confirmation: event.target.value })} /></label></section>}
        {operation.state !== "idle" && <OperationNotice operation={operation} />}
        <div className="form-actions"><span>{mode === "midnight" ? "A real deployment requires proof generation and Lace authorization." : "This creates a guided local program only."}</span><button className="primary-button" disabled={operation.state === "working" || (mode === "midnight" && !connected)}>Create program</button></div>
      </form>
    </section>
  );
}

export function ReportWizard({ report, onChange, onSeal, preserveDraftLines = false, attachmentDraft, onAttachmentDraftChange }: { readonly attachmentDraft?: AttachmentDraft; readonly onAttachmentDraftChange?: (value: AttachmentDraft) => void; readonly report: VulnerabilityReport; readonly onChange: (report: VulnerabilityReport) => void; readonly onSeal: () => void; readonly preserveDraftLines?: boolean }) {
  const [attachmentWorkingOrDirty, setAttachmentPending] = useState(false);
  const attachmentPending = attachmentWorkingOrDirty || Object.values(attachmentDraft ?? {}).some(Boolean);
  const [reproductionText, setReproductionText] = useState(() => report.reproductionSteps.join("\n"));
  const update = <K extends keyof VulnerabilityReport>(key: K, value: VulnerabilityReport[K]): void => onChange({ ...report, [key]: value });
  return (
    <section className="page narrow-page">
      <PageHeading eyebrow="Researcher submission" title="Seal a vulnerability report" detail="Everything below stays inside the authenticated ciphertext. Only digests and workflow metadata cross the public boundary." actions={<Pill tone="success">Draft stays local</Pill>} />
      <div className="wizard-steps" aria-label="Submission progress"><div className="active"><span>1</span><small>Report</small></div><div><span>2</span><small>Encrypt</small></div><div><span>3</span><small>Commit</small></div><div><span>4</span><small>Receipt</small></div></div>
      <form className="form-panel" onSubmit={(event) => { event.preventDefault(); if (!attachmentPending) onSeal(); }}>
        <div className="privacy-callout"><span className="lock-mark" aria-hidden="true">◆</span><div><strong>Private input boundary</strong><p>Title, reproduction, impact, attachments, and contact are canonicalized and encrypted in your browser.</p></div><Pill tone="success">Not public</Pill></div>
        <label>Report title<input value={report.title} onChange={(event) => update("title", event.target.value)} required /></label>
        <div className="field-grid"><label>Affected asset<input value={report.affectedAsset} onChange={(event) => update("affectedAsset", event.target.value)} required /></label><label>Weakness<input value={report.weakness} onChange={(event) => update("weakness", event.target.value)} required /></label></div>
        <label>Executive summary<textarea rows={3} value={report.summary} onChange={(event) => update("summary", event.target.value)} required /></label>
        <label>Reproduction steps<textarea rows={6} value={reproductionText} onChange={(event) => { setReproductionText(event.target.value); update("reproductionSteps", event.target.value.split("\n").filter((step) => preserveDraftLines || step.trim().length > 0)); }} required /><small>One step per line. Never paste production credentials or third-party personal data.</small></label>
        <label>Impact<textarea rows={3} value={report.impact} onChange={(event) => update("impact", event.target.value)} required /></label>
        <label>Suggested remediation<textarea rows={3} value={report.suggestedRemediation} onChange={(event) => update("suggestedRemediation", event.target.value)} /></label>
        <label>Private researcher contact<input type="email" value={report.researcherContact} onChange={(event) => update("researcherContact", event.target.value)} /><small>Encrypted with the report; never added to public ledger state.</small></label>
        <AttachmentEditor draft={attachmentDraft} onDraftChange={onAttachmentDraftChange} attachments={report.attachments} onChange={(value) => update("attachments", value)} onPending={setAttachmentPending} />
        <CipherstoreDestinations urls={env.cipherstoreUrls} />
        <label className="check-row"><input type="checkbox" required /><span>I confirm this test was authorized and the report excludes live secrets.</span></label>
        <div className="form-actions"><span>Next: local AES-256-GCM encryption and Compact commitment.</span><button className="primary-button" disabled={attachmentPending}>Encrypt &amp; seal <span aria-hidden="true">→</span></button></div>
      </form>
    </section>
  );
}

function SealProgress({ operation, hasPreparation, canRetry, onRetry, onBack }: { readonly operation: Operation; readonly hasPreparation: boolean; readonly canRetry: boolean; readonly onRetry: () => void; readonly onBack: () => void }) {
  return (
    <section className="page focus-page">
      <div className={`progress-orb ${operation.state}`} aria-hidden="true"><span>{operation.state === "error" ? "!" : "V"}</span></div>
      <span className="eyebrow accent">Private computation</span>
      <h1>{operation.state === "error" ? hasPreparation ? "Keep your prepared report" : "Review your draft" : operation.state === "working" ? operation.label : "Preparing your receipt"}</h1>
      <p>{operation.state === "error" ? operation.detail : operation.state === "working" ? operation.detail : "Finalizing the next safe step."}</p>
      <div className="progress-list">
        <div className={hasPreparation ? "complete" : operation.state === "error" ? "failed" : "active"}><span>{hasPreparation ? "✓" : operation.state === "error" ? "!" : "1"}</span><p>Canonical report<small>Deterministic UTF-8 JSON</small></p></div>
        <div className={operation.state === "working" ? "active" : operation.state === "error" ? "failed" : "complete"}><span>{operation.state === "error" ? "!" : "◌"}</span><p>Encrypt &amp; store<small>Authenticated ciphertext only</small></p></div>
        <div><span>3</span><p>Generate ownership proof<small>Runs only in Midnight mode</small></p></div>
        <div><span>4</span><p>Finalize receipt<small>Transaction evidence when available</small></p></div>
      </div>
      {operation.state === "error" && <><p>Use Private recovery to retain an encrypted backup. {!hasPreparation ? "Preparation did not finish. Review the draft before trying again; no upload or submission started." : canRetry ? "Retry reuses the saved ciphertext, key, salt and report ID." : "Submission setup already started; its outcome needs reconciliation. Resubmission is blocked."}</p><div className="button-row"><button className="secondary-button" onClick={onBack}>Review report</button>{canRetry && hasPreparation && <button className="primary-button" onClick={onRetry}>Retry saved report upload</button>}</div></>}
      <div className="privacy-footnote">No plaintext, key, salt, or researcher secret is sent to the ciphertext service.</div>
    </section>
  );
}

function Receipt({ sealed, reportId, evidence, network, onTriage, onReset, resetBlocked }: { readonly sealed: SealedReport | undefined; readonly reportId: Uint8Array | undefined; readonly evidence: readonly TransactionEvidence[]; readonly network: boolean; readonly onTriage: () => void; readonly onReset: () => void; readonly resetBlocked: boolean }) {
  const tx = [...evidence].reverse().find((entry: TransactionEvidence) => entry.circuit === "submitReport");
  if (sealed === undefined || reportId === undefined) return <section className="page"><EmptyState title="No receipt yet" detail="Seal a report to create a content digest and Compact commitment." /></section>;
  return (
    <section className="page narrow-page receipt-page">
      <div className="success-emblem" aria-hidden="true">✓</div>
      <Pill tone={network ? "success" : "warning"}>{network ? tx ? "Midnight transaction finalized" : "Recovered report · ledger checked" : "Guided local receipt · not on-chain"}</Pill>
      <h1>Your report is sealed</h1>
      <p>The encrypted artifact has a content address and the report has a Compact-derived commitment. Keep the encryption material secure.</p>
      <section className="receipt-card">
        <div className="receipt-top"><div><span className="eyebrow">Submission receipt</span><strong>VULN-{bytesToHex(reportId).slice(0, 8).toUpperCase()}</strong></div><Pill tone="accent">Sealed</Pill></div>
        <HashValue label="Report commitment" value={reportId} />
        <HashValue label="Ciphertext digest" value={sealed.ciphertextDigest} />
        <div className="receipt-facts"><div><span>Encryption</span><strong>AES-256-GCM</strong></div><div><span>Network evidence</span><strong>{tx ? `Block ${tx.blockHeight}` : network ? "Current ledger record" : "None in guided local"}</strong></div><div><span>Public exploit data</span><strong>0 fields</strong></div></div>
        {tx && <div className="tx-evidence"><span>Transaction ID</span><code>{tx.txId}</code></div>}
      </section>
      <div className="warning-box"><span aria-hidden="true">!</span><div><strong>Back up your private material</strong><p>Open Private recovery to download a password-encrypted backup before closing this tab. Public state cannot recover your secrets. Keep the backup private; it controls both experimental roles.</p></div></div>
      <div className="button-row centered"><button className="secondary-button" disabled={resetBlocked} onClick={onReset}>Seal another</button><button className="primary-button" onClick={onTriage}>Continue as vendor <span aria-hidden="true">→</span></button></div>
    </section>
  );
}

function Triage({ transactionsBlocked, status, reportId, report, usingLocalCiphertext, operation, severity, rationale, onSeverity, onRationale, onBegin, onAccept, onReject, onResolution, onClose }: { readonly transactionsBlocked: boolean; readonly status: ReportStatusName; readonly reportId: Uint8Array | undefined; readonly report: VulnerabilityReport | undefined; readonly usingLocalCiphertext: boolean; readonly operation: Operation; readonly severity: number; readonly rationale: string; readonly onSeverity: (value: number) => void; readonly onRationale: (value: string) => void; readonly onBegin: () => void; readonly onAccept: () => void; readonly onReject: () => void; readonly onResolution: () => void; readonly onClose: () => void }) {
  if (reportId === undefined) return <section className="page"><EmptyState title="Triage queue is empty" detail="A sealed submission is required before vendor review." /></section>;
  if (report === undefined) return <section className="page"><EmptyState title="Encrypted report is not open" detail="Open the report from its receipt or program queue to fetch and decrypt the authenticated ciphertext." /></section>;
  return (
    <section className="page">
      <PageHeading eyebrow="Vendor triage" title="Review without breaking the seal" detail="The vendor decrypts through the authorized client. Public state records only the decision path and coarse severity." actions={<Pill tone="accent">{publicStatusLabel[status]}</Pill>} />
      <div className="triage-layout">
        <section className="panel decrypted-report">
          <div className="decrypted-banner"><span aria-hidden="true">◆</span><p><strong>Decrypted locally for vendor persona</strong><small>This content is never written to public state or logs.</small></p><Pill tone="success">Private</Pill></div>
          {usingLocalCiphertext && <p role="status">Using your local encrypted copy. The ciphertext service is unavailable or returned invalid data.</p>}
          <h2>{report.title}</h2><p className="muted">{report.affectedAsset} · {report.weakness}</p>
          <div className="report-section"><span>Summary</span><p>{report.summary}</p></div>
          <div className="report-section"><span>Impact</span><p>{report.impact}</p></div>
          <div className="report-section"><span>Reproduction</span><ol>{report.reproductionSteps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>
          <AttachmentReview attachments={report.attachments} />
        </section>
        <aside className="panel decision-panel">
          <span className="eyebrow">Authorized decision</span><h2>Triage controls</h2>
          <label>Public severity tier<select value={severity} disabled={status !== "COMMITTED" && status !== "TRIAGED"} onChange={(event) => onSeverity(Number(event.target.value))}><option value="4">P1 · Critical</option><option value="3">P2 · High</option><option value="2">P3 · Medium</option><option value="1">P4 · Low</option></select></label>
          <label>Private rationale<textarea rows={5} value={rationale} readOnly={status !== "COMMITTED" && status !== "TRIAGED"} onChange={(event) => onRationale(event.target.value)} /></label>
          <div className="reveal-list"><strong>On acceptance, reveal:</strong><span>✓ Accepted status</span><span>✓ Severity tier {severity}</span><span>✓ Decision digest</span><span className="private">◆ Rationale remains private</span></div>
          {operation.state !== "idle" && <OperationNotice operation={operation} />}
          {status === "COMMITTED" && <button className="primary-button wide" disabled={transactionsBlocked} onClick={onBegin}>Begin authorized triage</button>}
          {status === "TRIAGED" && <><button className="primary-button wide" disabled={transactionsBlocked} onClick={onAccept}>Accept as {severityLabel(severity)}</button><button className="danger-button wide" disabled={transactionsBlocked} onClick={onReject}>Reject with digest</button></>}
          {status === "REJECTED" && <div className="warning-box"><span aria-hidden="true">!</span><div><strong>Report rejected</strong><p>The authorized rejection and decision digest are now part of the public trail; private rationale remains sealed.</p></div></div>}
          {status === "REJECTED" && <button className="secondary-button wide" disabled={transactionsBlocked} onClick={onClose}>Close report</button>}
          {(status === "ACCEPTED" || status === "PATCH_READY" || status.startsWith("RETEST") || status === "PAYOUT_AUTHORIZED") && <button className="primary-button wide" onClick={onResolution}>Continue to remediation</button>}
        </aside>
      </div>
    </section>
  );
}

function Resolution(props: {
  readonly transactionsBlocked: boolean;
  readonly status: ReportStatusName; readonly reportId: Uint8Array | undefined; readonly patchCommitment: Uint8Array | undefined; readonly retestCommitment: Uint8Array | undefined; readonly payoutReceipt: Uint8Array | undefined; readonly operation: Operation;
  readonly patchReference: string; readonly retestNotes: string; readonly onPatchReference: (value: string) => void; readonly onRetestNotes: (value: string) => void;
  readonly onAnchor: () => void; readonly onRetest: (passed: boolean) => void; readonly onAuthorize: () => void; readonly onVerify: () => void;
  readonly onClose: () => void;
  readonly severity: number;
}) {
  if (props.reportId === undefined) return <section className="page"><EmptyState title="No resolution workflow" detail="Accept a report before anchoring a patch." /></section>;
  if (["COMMITTED", "TRIAGED", "REJECTED", "CLOSED"].includes(props.status)) return <section className="page"><EmptyState title="Resolution unavailable" detail={workflowStatement[props.status]} action={<button className="secondary-button" onClick={props.onVerify}>Open public verifier</button>} /></section>;
  const stage = props.status === "ACCEPTED" ? 0 : props.status === "PATCH_READY" ? 1 : props.status === "RETEST_PASSED" ? 2 : props.status === "PAYOUT_AUTHORIZED" ? 3 : 0;
  return (
    <section className="page narrow-page">
      <PageHeading eyebrow="Patch and retest" title="Prove the resolution path" detail="Each commitment is bound to this report. A payout receipt can exist only after acceptance and a passing retest." />
      <div className="resolution-rail">{["Patch", "Retest", "Authorize", "Verify"].map((label, index) => <div className={index <= stage ? "complete" : ""} key={label}><span>{index < stage ? "✓" : index + 1}</span><small>{label}</small></div>)}</div>
      <section className="form-panel resolution-card">
        {props.status === "RETEST_FAILED" && <div className="warning-box"><strong>Retest failed. Anchor a revised patch before requesting another retest.</strong></div>}
        {stage === 0 && <><span className="eyebrow">Vendor step</span><h2>Anchor a private patch commitment</h2><p>Hash the release reference locally. The circuit binds its private digest to report {shortHex(props.reportId)}.</p><label>Patch or release reference<input value={props.patchReference} onChange={(event) => props.onPatchReference(event.target.value)} /></label><div className="reveal-box"><span aria-hidden="true">◈</span><div><strong>Public output</strong><p>A domain-separated patch commitment—never source code, diff contents, or private repository location.</p></div></div><button className="primary-button" disabled={props.transactionsBlocked} onClick={props.onAnchor}>Anchor patch commitment</button></>}
        {stage === 1 && <><span className="eyebrow">Researcher step</span><h2>Submit private retest evidence</h2><HashValue label="Patch commitment" value={props.patchCommitment} /><label>Private retest notes<textarea rows={5} value={props.retestNotes} onChange={(event) => props.onRetestNotes(event.target.value)} /></label><div className="result-choice"><button className="selected" disabled={props.transactionsBlocked} onClick={() => props.onRetest(true)}><span>✓</span><strong>Pass retest</strong><small>Disclose result only</small></button><button disabled={props.transactionsBlocked} onClick={() => props.onRetest(false)}><span>×</span><strong>Fail retest</strong><small>Return to vendor</small></button></div></>}
        {stage === 2 && <><span className="eyebrow">Vendor step</span><h2>Authorize the bounty—not a transfer</h2><HashValue label="Retest commitment" value={props.retestCommitment} /><div className="reward-summary"><div><span>Public reward tier</span><strong>Tier {props.severity} · {severityLabel(props.severity)}</strong></div><div><span>Funds moved</span><strong>None in Wave 1</strong></div></div><button className="primary-button" disabled={props.transactionsBlocked} onClick={props.onAuthorize}>Generate payout authorization</button></>}
        {stage === 3 && <><div className="success-emblem small" aria-hidden="true">✓</div><span className="eyebrow accent">Workflow complete</span><h2>Payout authorization is verifiable</h2><HashValue label="Payout authorization receipt" value={props.payoutReceipt} /><p>No token transfer is claimed. The receipt proves the contract reached the configured accepted → patch → passed-retest path.</p><button className="primary-button" onClick={props.onVerify}>Open public verifier</button></>}
        {props.operation.state !== "idle" && <OperationNotice operation={props.operation} />}
        {props.status === "PAYOUT_AUTHORIZED" && <button className="secondary-button" disabled={props.transactionsBlocked} onClick={props.onClose}>Close report</button>}
      </section>
    </section>
  );
}

function Verifier({ status, reportId, sealed, patchCommitment, retestCommitment, payoutReceipt, timeline, network }: {
  readonly status: ReportStatusName; readonly reportId: Uint8Array | undefined; readonly sealed: SealedReport | undefined; readonly patchCommitment: Uint8Array | undefined; readonly retestCommitment: Uint8Array | undefined; readonly payoutReceipt: Uint8Array | undefined; readonly timeline: WorkflowTimeline; readonly network: boolean;
}) {
  if (reportId === undefined || sealed === undefined) return <section className="page"><PageHeading eyebrow="Public verifier" title="Verify a sealed disclosure" detail="Open a completed receipt to load its public commitment trail." /><EmptyState title="No public trail loaded" detail="The verifier never needs the vulnerability plaintext, encryption key, salt, or researcher identity." /></section>;
  return (
    <section className="page verifier-page">
      <PageHeading eyebrow="Public verifier" title={network ? "Public transaction trail" : "Guided workflow preview"} detail="This view contains public commitments and workflow metadata, without exploit content or researcher contact." actions={<Pill tone={network ? "success" : "warning"}>{network ? "Session transaction evidence" : "Guided local trail"}</Pill>} />
      <div className="verdict-card"><span className="verdict-mark" aria-hidden="true">{status === "PAYOUT_AUTHORIZED" ? "✓" : "i"}</span><div><span className="eyebrow">{network ? "Recorded workflow state" : "Simulated workflow state"}</span><h2>{workflowStatement[status]}</h2><p>{network ? "Transaction entries show finalized evidence from this tab. Recovery entries show ledger state observed when restoring; earlier transaction history is not reconstructed. This is not a live refresh." : "This screen demonstrates the public data model only. It is not presented as on-chain evidence."}</p></div></div>
      <div className="verifier-grid">
        <section className="panel audit-timeline"><div className="panel-head"><div><span className="eyebrow">Audit timeline</span><h2>Public workflow</h2></div><Pill tone="accent">{publicStatusLabel[status]}</Pill></div>
          {timeline.map(({ entry, complete, evidence: transaction, source }, index) => (
            <div className={complete ? "audit-event complete" : "audit-event"} key={index}><span>{complete ? "✓" : index + 1}</span><div><strong>{publicStatusLabel[entry]}</strong><small>{complete ? transaction ? `Finalized at block ${transaction.blockHeight}` : source === "ledger" ? "Observed on ledger during recovery; prior transaction history not loaded" : source === "recovered" ? `Recovered local sequence ${index + 1}` : network ? "Finality evidence unavailable" : `Guided sequence ${index + 1}` : "Not reached"}</small>{transaction && <code className="audit-transaction">{transaction.txId}</code>}</div>{complete && <Pill tone={transaction ? "success" : "warning"}>{transaction ? "Finalized" : source === "ledger" ? "Ledger state" : network ? "Unverified" : "Local step"}</Pill>}</div>
          ))}
        </section>
        <aside className="panel public-data-card"><div className="panel-head"><div><span className="eyebrow">Public data</span><h2>Commitment set</h2></div></div><HashValue label="Report" value={reportId} /><HashValue label="Ciphertext" value={sealed.ciphertextDigest} /><HashValue label="Patch" value={patchCommitment} /><HashValue label="Retest" value={retestCommitment} /><HashValue label="Payout auth" value={payoutReceipt} /><div className="privacy-score"><span>Private fields exposed</span><strong>0</strong></div></aside>
      </div>
      <section className="not-proven"><span aria-hidden="true">i</span><div><strong>What this does not prove</strong><p>It does not prove the exploit is technically valid, severity is objective, two differently sealed reports are semantic duplicates, or money was transferred.</p></div></section>
    </section>
  );
}

function PrivacyModel() {
  return (
    <section className="page privacy-page">
      <PageHeading eyebrow="Privacy model" title="Know exactly what is revealed" detail="VulnSeal separates encrypted application data, private witness inputs, and the minimum public audit surface." />
      <div className="boundary-grid">
        <article className="boundary-card private-card"><div className="boundary-head"><span aria-hidden="true">◆</span><div><span className="eyebrow">Private · researcher</span><h2>Never public</h2></div></div><ul><li>Canonical report and reproduction</li><li>Impact and remediation notes</li><li>Attachment digests before commitment</li><li>Report salt and researcher secret</li><li>Encryption key and private contact</li><li>Private retest evidence</li></ul><p>Held by the client’s private-state boundary and encrypted report artifact.</p></article>
        <article className="boundary-card encrypted-card"><div className="boundary-head"><span aria-hidden="true">▣</span><div><span className="eyebrow">Off-chain · encrypted</span><h2>Ciphertext only</h2></div></div><ul><li>AES-256-GCM envelope</li><li>Random 96-bit IV</li><li>Program-bound additional data</li><li>Content-addressed SHA-256 digest</li><li>No plaintext storage endpoint</li></ul><p>A compromised store can delete or observe ciphertext size and timing, but cannot decrypt without the key.</p></article>
        <article className="boundary-card public-card"><div className="boundary-head"><span aria-hidden="true">⌁</span><div><span className="eyebrow">Public · Midnight</span><h2>Verifiable minimum</h2></div></div><ul><li>Program and policy digests</li><li>Derived authorization identities</li><li>Report and ciphertext commitments</li><li>Coarse workflow and severity</li><li>Patch and retest commitments</li><li>Payout-authorization receipt</li></ul><p>Public state supports auditability without making the exploit readable.</p></article>
      </div>
      <section className="guarantee-table panel"><div className="panel-head"><div><span className="eyebrow">Honest guarantees</span><h2>Cryptographic claim boundary</h2></div></div><div className="table-row header"><span>Claim</span><span>Mechanism</span><span>Status</span></div><div className="table-row"><span>Knowledge of sealed preimage and secret</span><span>Compact witness constraints</span><Pill tone="success">Proven in circuit</Pill></div><div className="table-row"><span>Authorized vendor state transition</span><span>Domain-separated owner key</span><Pill tone="success">Proven in circuit</Pill></div><div className="table-row"><span>Exploit is valid and severity objective</span><span>Human security review</span><Pill tone="warning">Not ZK-proven</Pill></div><div className="table-row"><span>Funds were paid</span><span>Future escrow transaction</span><Pill>Wave 2</Pill></div></section>
    </section>
  );
}

function OperationNotice({ operation }: { readonly operation: Exclude<Operation, { state: "idle" }> }) {
  return <div className={`operation-notice ${operation.state}`} role={operation.state === "error" ? "alert" : "status"}><span aria-hidden="true">{operation.state === "error" ? "!" : "◌"}</span><div><strong>{operation.label}</strong><p>{operation.detail}</p></div></div>;
}

export default App;
