// SPDX-License-Identifier: Apache-2.0
import type { ActorRole, RoleCommand } from "@vulnseal/api/role-session";
import type { TransactionEvidence } from "@vulnseal/api/types";
import { base64UrlToBytes, bytesToBase64Url, randomBytes, utf8, type VulnerabilityReport } from "@vulnseal/shared";
import { validateDisclosure, type Disclosure } from "./handoff.js";

export type SubmissionIntent = { readonly circuit: "constructor"; readonly reportId: null } | { readonly circuit: RoleCommand["kind"]; readonly reportId: string };
export type SavedFinalization = { readonly blockHeight: string; readonly recordedAt: string };
export type SubmissionAttempt = { readonly transactionId: string; readonly recordedAt: string; readonly intent?: SubmissionIntent | null; readonly finalization?: SavedFinalization | null };
export type ReportNotes = { readonly reportId: string; readonly text: string; readonly tier: string };
export type RoleVault = { readonly version: 1 | 2 | 3 | 4 | 5 | 6; readonly role: ActorRole; readonly network: string; readonly contractAddress: string | null; readonly programId: string; readonly actorSecret: string; readonly reports: readonly Disclosure[]; readonly submissionAttempts?: readonly SubmissionAttempt[]; readonly draft?: VulnerabilityReport | null; readonly reportNotes?: readonly ReportNotes[] };
export type ProgramInvitation = { readonly format: "vulnseal-program-invitation"; readonly version: 1; readonly network: string; readonly contractAddress: string; readonly programId: string };
export const MAX_ROLE_BACKUP_BYTES = 32 * 1024 * 1024;
const buffer = (value: Uint8Array) => Uint8Array.from(value).buffer;
const aad = buffer(utf8("vulnseal:single-role-backup:v1"));
const object = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error("Unsupported role document");
  return value as Record<string, unknown>;
};
const hex = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid role identifier");
  return value;
};
const network = (value: unknown): string => {
  if (typeof value !== "string" || !["local", "preview", "preprod", "mainnet"].includes(value)) throw new Error("Invalid role network");
  return value;
};
const validateIntent = (input: unknown, role: unknown): SubmissionIntent => {
  const value = object(input, ["circuit", "reportId"]);
  if (value.circuit === "constructor") {
    if (role !== "vendor" || value.reportId !== null) throw new Error("Invalid deployment intent");
    return { circuit: "constructor", reportId: null };
  }
  const circuits = role === "researcher" ? ["submitReport", "submitRetest"] : ["beginTriage", "acceptReport", "rejectReport", "anchorPatch", "authorizePayout", "closeReport"];
  if (typeof value.circuit !== "string" || !circuits.includes(value.circuit)) throw new Error("Invalid submission intent circuit for this role");
  return { circuit: value.circuit as RoleCommand["kind"], reportId: hex(value.reportId) };
};
/** Legacy entries retain unknown intent; never infer an operation from current ledger state. */
export const withSubmissionAttempt = (vault: RoleVault, transactionId: string, intent: SubmissionIntent, recordedAt = new Date().toISOString()): Promise<RoleVault> => validateRoleVault({
  ...vault, version: vault.version === 6 ? 6 : 5, draft: vault.draft ?? null, reportNotes: vault.reportNotes ?? [],
  submissionAttempts: [...(vault.submissionAttempts ?? []).map((entry) => ({ ...entry, intent: entry.intent ?? null })), { transactionId, recordedAt, intent, ...(vault.version === 6 ? { finalization: null } : {}) }],
});
const timestamp = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("Invalid finalization timestamp");
  return value;
};
const validateFinalization = (input: unknown): SavedFinalization => {
  const value = object(input, ["blockHeight", "recordedAt"]);
  if (typeof value.blockHeight !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(value.blockHeight) || !Number.isSafeInteger(Number(value.blockHeight))) throw new Error("Invalid finalization block height");
  return { blockHeight: value.blockHeight, recordedAt: timestamp(value.recordedAt) };
};
/** Preserve the SDK receipt as a local claim, never infer it from current report state. */
export const withFinalizedSubmission = async (vault: RoleVault, evidence: TransactionEvidence, recordedAt = new Date().toISOString()): Promise<RoleVault> => {
  const entry = vault.submissionAttempts?.find((item) => item.transactionId === evidence.txId);
  if (!entry?.intent || entry.intent.circuit !== evidence.circuit) throw new Error("Finalized receipt does not match a recorded submission intent");
  const finalization = validateFinalization({ blockHeight: evidence.blockHeight, recordedAt });
  if (entry.finalization && entry.finalization.blockHeight !== finalization.blockHeight) throw new Error("Finalized receipt conflicts with the saved receipt");
  return validateRoleVault({ ...vault, version: 6, draft: vault.draft ?? null, reportNotes: vault.reportNotes ?? [], submissionAttempts: vault.submissionAttempts!.map((item) => ({ ...item, intent: item.intent ?? null, finalization: item.transactionId === evidence.txId ? item.finalization ?? finalization : item.finalization ?? null })) });
};
/** Incomplete authoring text is preserved exactly, without sealed-report normalization. */
const validateDraft = (input: unknown): VulnerabilityReport => {
  const value = object(input, ["schemaVersion", "title", "summary", "affectedAsset", "weakness", "reproductionSteps", "impact", "suggestedRemediation", "attachments", "researcherContact"]);
  const text = (entry: unknown): string => {
    if (typeof entry !== "string" || utf8(entry).length > 1024 * 1024) throw new Error("Invalid role draft text");
    return entry;
  };
  if (value.schemaVersion !== 1 || !Array.isArray(value.reproductionSteps) || value.reproductionSteps.length > 10_000 || !Array.isArray(value.attachments) || value.attachments.length > 50) throw new Error("Invalid role draft");
  const draft: VulnerabilityReport = {
    schemaVersion: 1, title: text(value.title), summary: text(value.summary), affectedAsset: text(value.affectedAsset), weakness: text(value.weakness), impact: text(value.impact), suggestedRemediation: text(value.suggestedRemediation), researcherContact: text(value.researcherContact),
    reproductionSteps: value.reproductionSteps.map(text),
    attachments: value.attachments.map((input) => {
      const attachment = object(input, ["filename", "mediaType", "size", "sha256"]);
      if (!Number.isSafeInteger(attachment.size) || Number(attachment.size) < 0) throw new Error("Invalid role draft attachment size");
      return { filename: text(attachment.filename), mediaType: text(attachment.mediaType), size: Number(attachment.size), sha256: hex(attachment.sha256) };
    }),
  };
  if (utf8(JSON.stringify(draft)).length > 2 * 1024 * 1024) throw new Error("Role draft is too large");
  return draft;
};
export const withRoleDraft = (vault: RoleVault, draft: VulnerabilityReport | null): RoleVault => ({ ...vault, version: vault.version >= 4 ? vault.version : 3, submissionAttempts: vault.submissionAttempts ?? [], draft });
const validateReportNotes = (input: unknown): ReportNotes => {
  const value = object(input, ["reportId", "text", "tier"]);
  if (typeof value.text !== "string" || utf8(value.text).length > 64 * 1024) throw new Error("Report notes must be text of at most 64 KiB");
  if (typeof value.tier !== "string" || !["1", "2", "3", "4"].includes(value.tier)) throw new Error("Invalid report notes tier");
  return { reportId: hex(value.reportId), text: value.text, tier: value.tier };
};
export const withReportNotes = (vault: RoleVault, input: ReportNotes): RoleVault => {
  const note = validateReportNotes(input);
  if (!vault.reports.some((report) => report.reportId === note.reportId)) throw new Error("Report notes must name a saved report");
  return { ...vault, version: vault.version >= 5 ? vault.version : 4, draft: vault.draft ?? null, submissionAttempts: vault.submissionAttempts ?? [], reportNotes: [...(vault.reportNotes ?? []).filter((entry) => entry.reportId !== note.reportId), note] };
};
export const parseInvitation = (serialized: string): ProgramInvitation => {
  if (utf8(serialized).length > 4096) throw new Error("Program invitation is too large");
  const value = object(JSON.parse(serialized), ["format", "version", "network", "contractAddress", "programId"]);
  if (value.format !== "vulnseal-program-invitation" || value.version !== 1) throw new Error("Not a public program invitation");
  return { format: "vulnseal-program-invitation", version: 1, network: network(value.network), contractAddress: hex(value.contractAddress), programId: hex(value.programId) };
};
export const validateRoleVault = async (input: unknown): Promise<RoleVault> => {
  const version = (input as { version?: unknown } | null)?.version;
  const receipted = version === 6;
  const contextual = version === 5 || receipted;
  const noted = version === 4 || contextual;
  const drafted = version === 3 || noted;
  const journaled = version === 2 || drafted;
  const value = object(input, ["version", "role", "network", "contractAddress", "programId", "actorSecret", "reports", ...(journaled ? ["submissionAttempts"] : []), ...(drafted ? ["draft"] : []), ...(noted ? ["reportNotes"] : [])]);
  if ((value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5 && value.version !== 6) || !["vendor", "researcher"].includes(String(value.role)) || !Array.isArray(value.reports) || value.reports.length > 100) throw new Error("Invalid role backup");
  const attempts: SubmissionAttempt[] = [];
  if (journaled) {
    if (!Array.isArray(value.submissionAttempts) || value.submissionAttempts.length > 200) throw new Error("Invalid submission journal");
    const ids = new Set<string>();
    for (const item of value.submissionAttempts) {
      const entry = object(item, ["transactionId", "recordedAt", ...(contextual ? ["intent"] : []), ...(receipted ? ["finalization"] : [])]);
      if (typeof entry.transactionId !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{66})$/.test(entry.transactionId)) throw new Error("Invalid role identifier");
      const transactionId = entry.transactionId;
      if (ids.has(transactionId) || typeof entry.recordedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.recordedAt) || !Number.isFinite(Date.parse(entry.recordedAt))) throw new Error("Invalid submission journal entry");
      const finalization = receipted && entry.finalization !== null ? validateFinalization(entry.finalization) : null;
      if (finalization && (!entry.intent || value.contractAddress === null)) throw new Error("Saved finalization requires a deployed contract and recorded intent");
      ids.add(transactionId); attempts.push({ transactionId, recordedAt: entry.recordedAt, ...(contextual ? { intent: entry.intent === null ? null : validateIntent(entry.intent, value.role) } : {}), ...(receipted ? { finalization } : {}) });
    }
  }
  if (drafted && value.draft !== null && value.role !== "researcher") throw new Error("Only researcher workspaces can hold an authoring draft");
  const result: RoleVault = { version: value.version, role: value.role as ActorRole, network: network(value.network), contractAddress: value.contractAddress === null ? null : hex(value.contractAddress), programId: hex(value.programId), actorSecret: hex(value.actorSecret), reports: [], ...(journaled ? { submissionAttempts: attempts } : {}), ...(drafted ? { draft: value.draft === null ? null : validateDraft(value.draft) } : {}) };
  const reports: Disclosure[] = [];
  if (result.contractAddress === null && result.role !== "vendor") throw new Error("A researcher role backup must name a deployed program");
  const ids = new Set<string>();
  for (const item of value.reports) {
    const { disclosure } = await validateDisclosure(item);
    if (disclosure.network !== result.network || disclosure.contractAddress !== result.contractAddress || disclosure.programId !== result.programId || ids.has(disclosure.reportId)) throw new Error("Role backup contains a duplicate or foreign report");
    ids.add(disclosure.reportId); reports.push(disclosure);
  }
  if (result.contractAddress === null && reports.length > 0) throw new Error("Role backup reports require a deployed program");
  const reportNotes: ReportNotes[] = [];
  if (noted) {
    if (!Array.isArray(value.reportNotes) || value.reportNotes.length > 100) throw new Error("Invalid report notes");
    const seen = new Set<string>();
    for (const input of value.reportNotes) {
      const note = validateReportNotes(input);
      if (!ids.has(note.reportId) || seen.has(note.reportId)) throw new Error("Report notes must name one unique saved report");
      seen.add(note.reportId); reportNotes.push(note);
    }
  }
  for (const entry of attempts) {
    if (entry.intent?.reportId && !ids.has(entry.intent.reportId)) throw new Error("Submission intent must name a saved report");
  }
  return { ...result, reports, ...(noted ? { reportNotes } : {}) };
};
const passwordKey = async (password: string, salt: Uint8Array, usage: KeyUsage) => {
  if (password.length < 12 || utf8(password).length > 1024) throw new Error("Use a role backup password of at least 12 characters (at most 1024 UTF-8 bytes)");
  const material = await crypto.subtle.importKey("raw", buffer(utf8(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations: 600_000 }, material, { name: "AES-GCM", length: 256 }, false, [usage]);
};
export const encryptRoleVault = async (input: RoleVault, password: string) => {
  const vault = await validateRoleVault(input);
  const plaintext = utf8(JSON.stringify(vault));
  if (plaintext.length > MAX_ROLE_BACKUP_BYTES / 2) throw new Error("Role backup is too large");
  const salt = randomBytes(16), iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: aad }, await passwordKey(password, salt, "encrypt"), buffer(plaintext));
  return JSON.stringify({ format: "vulnseal-role-backup", version: 1, salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)) });
};
export const decryptRoleVault = async (serialized: string, password: string) => {
  if (utf8(serialized).length > MAX_ROLE_BACKUP_BYTES) throw new Error("Role backup is too large");
  const value = object(JSON.parse(serialized), ["format", "version", "salt", "iv", "ciphertext"]);
  if (value.format !== "vulnseal-role-backup" || value.version !== 1 || [value.salt, value.iv, value.ciphertext].some((item) => typeof item !== "string")) throw new Error("Not an encrypted single-role backup");
  const salt = base64UrlToBytes(value.salt as string), iv = base64UrlToBytes(value.iv as string), ciphertext = base64UrlToBytes(value.ciphertext as string);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error("Invalid role backup lengths");
  const key = await passwordKey(password, salt, "decrypt");
  let plaintext: ArrayBuffer;
  try { plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: aad }, key, buffer(ciphertext)); }
  catch { throw new Error("Wrong role backup password or damaged file"); }
  return validateRoleVault(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
};
