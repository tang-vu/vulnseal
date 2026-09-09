// SPDX-License-Identifier: Apache-2.0
import type { ActorRole } from "@vulnseal/api/role-session";
import { base64UrlToBytes, bytesToBase64Url, randomBytes, utf8, type VulnerabilityReport } from "@vulnseal/shared";
import { validateDisclosure, type Disclosure } from "./handoff.js";

export type SubmissionAttempt = { readonly transactionId: string; readonly recordedAt: string };
export type RoleVault = { readonly version: 1 | 2 | 3; readonly role: ActorRole; readonly network: string; readonly contractAddress: string | null; readonly programId: string; readonly actorSecret: string; readonly reports: readonly Disclosure[]; readonly submissionAttempts?: readonly SubmissionAttempt[]; readonly draft?: VulnerabilityReport | null };
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
export const withRoleDraft = (vault: RoleVault, draft: VulnerabilityReport | null): RoleVault => ({ ...vault, version: 3, submissionAttempts: vault.submissionAttempts ?? [], draft });
export const parseInvitation = (serialized: string): ProgramInvitation => {
  if (utf8(serialized).length > 4096) throw new Error("Program invitation is too large");
  const value = object(JSON.parse(serialized), ["format", "version", "network", "contractAddress", "programId"]);
  if (value.format !== "vulnseal-program-invitation" || value.version !== 1) throw new Error("Not a public program invitation");
  return { format: "vulnseal-program-invitation", version: 1, network: network(value.network), contractAddress: hex(value.contractAddress), programId: hex(value.programId) };
};
export const validateRoleVault = async (input: unknown): Promise<RoleVault> => {
  const version = (input as { version?: unknown } | null)?.version;
  const journaled = version === 2 || version === 3;
  const value = object(input, ["version", "role", "network", "contractAddress", "programId", "actorSecret", "reports", ...(journaled ? ["submissionAttempts"] : []), ...(version === 3 ? ["draft"] : [])]);
  if ((value.version !== 1 && value.version !== 2 && value.version !== 3) || !["vendor", "researcher"].includes(String(value.role)) || !Array.isArray(value.reports) || value.reports.length > 100) throw new Error("Invalid role backup");
  const attempts: SubmissionAttempt[] = [];
  if (journaled) {
    if (!Array.isArray(value.submissionAttempts) || value.submissionAttempts.length > 200) throw new Error("Invalid submission journal");
    const ids = new Set<string>();
    for (const item of value.submissionAttempts) {
      const entry = object(item, ["transactionId", "recordedAt"]);
      if (typeof entry.transactionId !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{66})$/.test(entry.transactionId)) throw new Error("Invalid role identifier");
      const transactionId = entry.transactionId;
      if (ids.has(transactionId) || typeof entry.recordedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.recordedAt) || !Number.isFinite(Date.parse(entry.recordedAt))) throw new Error("Invalid submission journal entry");
      ids.add(transactionId); attempts.push({ transactionId, recordedAt: entry.recordedAt });
    }
  }
  if (version === 3 && value.draft !== null && value.role !== "researcher") throw new Error("Only researcher workspaces can hold an authoring draft");
  const result: RoleVault = { version: value.version, role: value.role as ActorRole, network: network(value.network), contractAddress: value.contractAddress === null ? null : hex(value.contractAddress), programId: hex(value.programId), actorSecret: hex(value.actorSecret), reports: [], ...(journaled ? { submissionAttempts: attempts } : {}), ...(version === 3 ? { draft: value.draft === null ? null : validateDraft(value.draft) } : {}) };
  const reports: Disclosure[] = [];
  if (result.contractAddress === null && result.role !== "vendor") throw new Error("A researcher role backup must name a deployed program");
  const ids = new Set<string>();
  for (const item of value.reports) {
    const { disclosure } = await validateDisclosure(item);
    if (disclosure.network !== result.network || disclosure.contractAddress !== result.contractAddress || disclosure.programId !== result.programId || ids.has(disclosure.reportId)) throw new Error("Role backup contains a duplicate or foreign report");
    ids.add(disclosure.reportId); reports.push(disclosure);
  }
  if (result.contractAddress === null && reports.length > 0) throw new Error("Role backup reports require a deployed program");
  return { ...result, reports };
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
