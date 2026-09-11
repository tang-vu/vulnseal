// SPDX-License-Identifier: Apache-2.0
import { pureCircuits, type Ledger } from "@vulnseal/contract";
import { base64UrlToBytes, bytesToBase64Url, bytesToHex, canonicalizeReport, contractStatusName, hexToBytes, openReport, parseCiphertextEnvelope, randomBytes, sha256, utf8, type ReportStatusName, type SealedReport, type VulnerabilityReport } from "@vulnseal/shared";
import { programConstructor, readProgramForm, validateProgramDraft, type ProgramDraft, type ProgramPolicy } from "./program.js";
import { submissionReceipt } from "./submission-receipt.js";

import { validateAttachmentDraft, type AttachmentDraft } from "./attachment-draft.js";
export const MAX_RECOVERY_BYTES = 20 * 1024 * 1024;
const iterations = 600_000;
const aad = utf8("vulnseal:browser-recovery:v1");
const buffer = (value: Uint8Array): ArrayBuffer => Uint8Array.from(value).buffer;

export const uncertainCircuits = ["beginTriage", "acceptReport", "rejectReport", "anchorPatch", "submitRetest", "authorizePayout", "closeReport"] as const;
export type UncertainCircuit = typeof uncertainCircuits[number];
export type RecoverySnapshot = {
  readonly version: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly deploymentTransactionId?: string;
  readonly deploymentAttempt?: { readonly startedAt: string };
  readonly programDraft?: ProgramDraft;
  readonly uncertainTransition?: UncertainCircuit | null;
  readonly pendingReport?: { readonly report: NonNullable<RecoverySnapshot["report"]>; readonly submissionStarted: boolean } | null;
  readonly attachmentDraft?: AttachmentDraft | null;
  readonly mode: "guided-local" | "midnight";
  readonly network: string;
  readonly contractAddress: string | null;
  readonly programId: string;
  readonly policy: ProgramPolicy;
  readonly vendorSecret: string;
  readonly researcherSecret: string;
  readonly draft: VulnerabilityReport;
  readonly report: { readonly envelope: string; readonly key: string; readonly salt: string; readonly id: string } | null;
  readonly status: ReportStatusName;
  readonly history: readonly ReportStatusName[];
  readonly patch: string | null;
  readonly retest: string | null;
  readonly payout: string | null;
  readonly severity: number;
  readonly rationale: string;
  readonly patchReference: string;
  readonly retestNotes: string;
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid recovery document");
  return value as Record<string, unknown>;
};
const text = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length > MAX_RECOVERY_BYTES) throw new Error(`Invalid recovery ${name}`);
  return value;
};
const hex = (value: unknown): string => {
  const result = text(value, "key or commitment");
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error("Invalid recovery key or commitment");
  return result;
};
const optionalHex = (value: unknown) => value === null ? null : hex(value);
const states = ["COMMITTED", "TRIAGED", "ACCEPTED", "REJECTED", "PATCH_READY", "RETEST_PASSED", "RETEST_FAILED", "PAYOUT_AUTHORIZED", "CLOSED"] as const;
const statusName = (value: unknown): ReportStatusName => {
  if (!states.includes(value as ReportStatusName)) throw new Error("Invalid recovery workflow status");
  return value as ReportStatusName;
};

const validateDraft = (input: unknown): VulnerabilityReport => {
  const draft = object(input);
  if (draft.schemaVersion !== 1 || !Array.isArray(draft.reproductionSteps) || !Array.isArray(draft.attachments)) throw new Error("Invalid recovery draft");
  const result: VulnerabilityReport = {
    schemaVersion: 1,
    title: text(draft.title, "draft title"), summary: text(draft.summary, "draft summary"), affectedAsset: text(draft.affectedAsset, "draft asset"),
    weakness: text(draft.weakness, "draft weakness"), impact: text(draft.impact, "draft impact"), suggestedRemediation: text(draft.suggestedRemediation, "draft remediation"), researcherContact: text(draft.researcherContact, "draft contact"),
    reproductionSteps: draft.reproductionSteps.map((step) => text(step, "draft step")),
    attachments: draft.attachments.map((item) => {
      const attachment = object(item);
      if (!Number.isSafeInteger(attachment.size) || Number(attachment.size) < 0) throw new Error("Invalid recovery attachment size");
      return { filename: text(attachment.filename, "attachment name"), mediaType: text(attachment.mediaType, "attachment media type"), size: Number(attachment.size), sha256: hex(attachment.sha256) };
    }),
  };
  return result;
};

/** Validate decrypted input before allowing it to replace any live session. */
export const validateRecovery = async (input: unknown): Promise<{ snapshot: RecoverySnapshot; sealed: SealedReport | undefined; pendingSeal?: SealedReport | undefined }> => {
  // Capture nested caller-owned state before the first asynchronous crypto check.
  const value = object(structuredClone(input));
  if (![1, 2, 3, 4, 5, 6, 7].includes(Number(value.version)) || typeof value.version !== "number" || !["guided-local", "midnight"].includes(String(value.mode))) throw new Error("Unsupported recovery version or mode");
  if (!["undeployed", "local", "preview", "preprod", "mainnet"].includes(String(value.network))) throw new Error("Unsupported recovery network");
  const mode = value.mode as RecoverySnapshot["mode"];
  const contractAddress = optionalHex(value.contractAddress);
  let deploymentAttempt: RecoverySnapshot["deploymentAttempt"];
  let deploymentTransactionId: string | undefined;
  if (value.version === 7) {
    if (typeof value.deploymentTransactionId !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{66})$/.test(value.deploymentTransactionId)) throw new Error("Invalid deployment transaction identifier");
    deploymentTransactionId = value.deploymentTransactionId;
    if (mode !== "midnight" || value.network === "undeployed") throw new Error("Deployment transaction requires a network recovery");
  } else if (value.deploymentTransactionId !== undefined) throw new Error("Deployment transaction identifiers require recovery version 7");
  if (value.version === 6 || (value.version === 7 && contractAddress === null)) {
    const attempt = object(value.deploymentAttempt);
    const startedAt = text(attempt.startedAt, "deployment timestamp");
    if (Object.keys(attempt).length !== 1 || !Number.isFinite(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) throw new Error("Invalid recovery deployment timestamp");
    if (mode !== "midnight" || value.network === "undeployed" || contractAddress !== null || value.report !== null || value.pendingReport !== null || value.uncertainTransition !== null || value.patch !== null || value.retest !== null || value.payout !== null) throw new Error("Recovery deployment attempt conflicts with a deployed workflow");
    deploymentAttempt = { startedAt };
  } else if (value.deploymentAttempt !== undefined) throw new Error("Deployment attempts require recovery version 6");
  if (!deploymentAttempt && (mode === "midnight") !== (contractAddress !== null)) throw new Error("Recovery network mode and contract address disagree");
  const policyInput = object(value.policy);
  const form = new FormData();
  for (const name of ["name", "primaryScope", "additionalScope", "responseDays", "disclosureDays", "rewardPolicy"]) {
    const item = policyInput[name];
    if (typeof item !== "string" && typeof item !== "number") throw new Error("Invalid recovery policy");
    form.set(name, String(item));
  }
  const policy = readProgramForm(form);
  const programId = hex(value.programId);
  const vendorSecret = hex(value.vendorSecret);
  const researcherSecret = hex(value.researcherSecret);
  const draft = validateDraft(value.draft);
  const status = statusName(value.status);
  if (!Array.isArray(value.history) || value.history.length > 10_000) throw new Error("Invalid recovery history");
  const history = value.history.map(statusName);
  if (!Number.isInteger(value.severity) || Number(value.severity) < 1 || Number(value.severity) > 4) throw new Error("Invalid recovery severity");
  let report: RecoverySnapshot["report"] = null;
  let sealed: SealedReport | undefined;
  if (value.report !== null) {
    const entry = object(value.report);
    report = { envelope: text(entry.envelope, "envelope"), key: hex(entry.key), salt: hex(entry.salt), id: hex(entry.id) };
    const envelope = parseCiphertextEnvelope(report.envelope);
    if (envelope.aad !== `vulnseal:ciphertext:v1:${programId}`) throw new Error("Recovery ciphertext belongs to another program");
    const opened = await openReport(report.envelope, hexToBytes(report.key));
    const canonicalReport = canonicalizeReport(opened);
    const canonicalReportDigest = await sha256(utf8(canonicalReport));
    const commitment = pureCircuits.deriveReportCommitment(hexToBytes(programId), Uint8Array.from(canonicalReportDigest), hexToBytes(report.salt));
    if (bytesToHex(commitment) !== report.id) throw new Error("Recovery report does not match its commitment");
    const ciphertextDigest = await sha256(utf8(report.envelope));
    sealed = { canonicalReport, canonicalReportDigest, key: hexToBytes(report.key), envelope, serializedEnvelope: report.envelope, ciphertextDigest, contentAddress: `sha256:${bytesToHex(ciphertextDigest)}` };
    if ((mode === "guided-local" && history[0] !== "COMMITTED") || history.at(-1) !== status) throw new Error("Recovery history does not match its report");
  } else if (history.length !== 0 || status !== "COMMITTED") throw new Error("Recovery history has no report");
  if (value.version < 5 && value.programDraft !== undefined) throw new Error("Program drafts require recovery version 5");
  const snapshot: RecoverySnapshot = {
    version: value.version as RecoverySnapshot["version"], ...(deploymentTransactionId ? { deploymentTransactionId } : {}), ...(deploymentAttempt ? { deploymentAttempt } : {}), ...(value.version >= 5 ? { programDraft: validateProgramDraft(value.programDraft) } : {}), ...(value.version >= 2 ? { attachmentDraft: value.attachmentDraft === null ? null : validateAttachmentDraft(value.attachmentDraft) } : {}), mode, network: String(value.network), contractAddress, programId, policy, vendorSecret, researcherSecret, draft, report, status, history,
    patch: optionalHex(value.patch), retest: optionalHex(value.retest), payout: optionalHex(value.payout), severity: Number(value.severity),
    rationale: text(value.rationale, "rationale"), patchReference: text(value.patchReference, "patch reference"), retestNotes: text(value.retestNotes, "retest notes"),
  };
  if (mode === "guided-local") {
    const edges: Record<ReportStatusName, readonly ReportStatusName[]> = {
      COMMITTED: ["TRIAGED"], TRIAGED: ["ACCEPTED", "REJECTED"], ACCEPTED: ["PATCH_READY"], REJECTED: ["CLOSED"],
      PATCH_READY: ["RETEST_PASSED", "RETEST_FAILED"], RETEST_PASSED: ["PAYOUT_AUTHORIZED"], RETEST_FAILED: ["PATCH_READY"], PAYOUT_AUTHORIZED: ["CLOSED"], CLOSED: [],
    };
    for (let index = 1; index < history.length; index++) if (!edges[history[index - 1]!].includes(history[index]!)) throw new Error("Recovery history contains an invalid transition");
    const patched = history.includes("PATCH_READY");
    const retested = ["RETEST_FAILED", "RETEST_PASSED", "PAYOUT_AUTHORIZED"].includes(status) || (status === "CLOSED" && history.includes("RETEST_PASSED"));
    if ((snapshot.patch !== null) !== patched || (snapshot.retest !== null) !== retested || (snapshot.payout !== null) !== history.includes("PAYOUT_AUTHORIZED")) throw new Error("Recovery commitments do not match the workflow");
  }
  if (value.version < 4 && value.uncertainTransition !== undefined) throw new Error("Uncertain transitions require recovery version 4");
  if (value.version >= 4 && value.uncertainTransition !== null && (!uncertainCircuits.includes(value.uncertainTransition as UncertainCircuit) || mode !== "midnight" || !report)) throw new Error("Invalid uncertain recovery transition");
  let pendingSeal: SealedReport | undefined;
  if (value.version >= 3) {
    let pendingReport: RecoverySnapshot["pendingReport"] = null;
    if (value.pendingReport !== null) {
      const pending = object(value.pendingReport);
      if (Object.keys(pending).sort().join() !== "report,submissionStarted" || typeof pending.submissionStarted !== "boolean" || (mode === "guided-local" && pending.submissionStarted)) throw new Error("Invalid pending recovery operation");
      if (report || history.length || snapshot.patch || snapshot.retest || snapshot.payout) throw new Error("Pending preparation cannot have a completed report history");
      const material = object(pending.report);
      if (Object.keys(material).sort().join() !== "envelope,id,key,salt") throw new Error("Invalid pending recovery report");
      // Reuse all envelope/commitment checks without treating this local preparation as a completed report.
      const checked = await validateRecovery({ ...snapshot, version: 2, deploymentTransactionId: undefined, deploymentAttempt: undefined, programDraft: undefined, report: material, status: "COMMITTED", history: ["COMMITTED"] });
      pendingSeal = checked.sealed;
      if (!pendingSeal || pendingSeal.canonicalReport !== canonicalizeReport(draft)) throw new Error("Pending recovery report differs from its draft");
      pendingReport = { report: checked.snapshot.report!, submissionStarted: pending.submissionStarted };
    }
    return { snapshot: { ...snapshot, pendingReport, ...(value.version >= 4 ? { uncertainTransition: value.uncertainTransition as UncertainCircuit | null } : {}) }, sealed, pendingSeal };
  }
  if (value.pendingReport !== undefined) throw new Error("Pending reports require recovery version 3");
  return { snapshot, sealed };
};

const passwordKey = async (password: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> => {
  if (password.length < 12 || utf8(password).length > 1024) throw new Error("Use a backup password of at least 12 characters (at most 1024 UTF-8 bytes)");
  const key = await crypto.subtle.importKey("raw", buffer(utf8(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations }, key, { name: "AES-GCM", length: 256 }, false, [usage]);
};

export const encryptRecovery = async (snapshot: RecoverySnapshot, password: string): Promise<string> => {
  const validated = await validateRecovery(snapshot);
  const plaintext = utf8(JSON.stringify(validated.snapshot));
  if (plaintext.length > MAX_RECOVERY_BYTES / 2) throw new Error("Recovery document is too large");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: buffer(aad), tagLength: 128 }, await passwordKey(password, salt, "encrypt"), buffer(plaintext));
  return JSON.stringify({ format: "vulnseal-recovery", version: 1, algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations, salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)) });
};

export const parseRecoveryEnvelope = (serialized: string) => {
  if (utf8(serialized).length > MAX_RECOVERY_BYTES) throw new Error("Recovery file is too large");
  const value = object(JSON.parse(serialized));
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["algorithm", "ciphertext", "format", "iterations", "iv", "kdf", "salt", "version"]) || value.format !== "vulnseal-recovery" || value.version !== 1 || value.algorithm !== "AES-256-GCM" || value.kdf !== "PBKDF2-SHA-256" || value.iterations !== iterations) throw new Error("Unsupported recovery envelope");
  const salt = base64UrlToBytes(text(value.salt, "salt"));
  const iv = base64UrlToBytes(text(value.iv, "IV"));
  const ciphertext = base64UrlToBytes(text(value.ciphertext, "ciphertext"));
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error("Invalid recovery envelope lengths");
  return { salt, iv, ciphertext };
};

export const decryptRecovery = async (serialized: string, password: string) => {
  const { salt, iv, ciphertext } = parseRecoveryEnvelope(serialized);
  const key = await passwordKey(password, salt, "decrypt");
  let plaintext: ArrayBuffer;
  try { plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: buffer(aad), tagLength: 128 }, key, buffer(ciphertext)); }
  catch { throw new Error("Wrong backup password or damaged recovery file"); }
  return validateRecovery(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
};

/** A network restore derives authority and checks current ledger state, never backup claims. */
export const verifyRecoveryLedger = async (snapshot: RecoverySnapshot, sealed: SealedReport | undefined, ledger: Ledger) => {
  const equal = (actual: Uint8Array, expected: Uint8Array, label: string) => {
    if (bytesToHex(actual) !== bytesToHex(expected)) throw new Error(`Recovery does not match the ledger: ${label}`);
  };
  const id = hexToBytes(snapshot.programId);
  equal(ledger.programId, id, "program");
  equal(ledger.ownerKey, pureCircuits.deriveVendorKey(id, hexToBytes(snapshot.vendorSecret)), "owner authority");
  const policy = await programConstructor(id, snapshot.policy);
  for (const field of ["scopeDigest", "responsePolicyDigest", "rewardPolicyDigest", "disclosurePolicyDigest"] as const) equal(ledger[field], policy[field], field);
  if (ledger.responseDays !== policy.responseDays || ledger.disclosureDelayDays !== policy.disclosureDelayDays) throw new Error("Recovery policy windows do not match the ledger");
  if (!snapshot.report) {
    if (snapshot.pendingReport && ledger.reports.member(hexToBytes(snapshot.pendingReport.report.id))) {
      throw new Error("The prepared report already exists in this contract. Keep this backup and investigate the previous submission; this restore cannot establish that another submission is safe.");
    }
    return undefined;
  }
  if (!sealed) throw new Error("Recovered report decryption material is missing");
  const reportId = hexToBytes(snapshot.report.id);
  if (!ledger.reports.member(reportId)) throw new Error("The recovered report is absent from this contract");
  const record = ledger.reports.lookup(reportId);
  equal(record.commitment, reportId, "report");
  equal(record.ciphertextDigest, sealed.ciphertextDigest, "ciphertext");
  equal(record.researcherKey, pureCircuits.deriveResearcherKey(id, reportId, hexToBytes(snapshot.researcherSecret)), "researcher authority");
  equal(record.submissionReceipt, submissionReceipt(reportId, record.ciphertextDigest, record.researcherKey), "submission receipt");
  contractStatusName(record.status);
  return record;
};
