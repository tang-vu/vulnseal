// SPDX-License-Identifier: Apache-2.0
import { createEncryptedCopyStorage } from "./encrypted-copy-storage.js";
export { BROWSER_STORAGE_TIMEOUT_MS as ROLE_STORAGE_TIMEOUT_MS } from "./encrypted-copy-storage.js";
export type { StoredCopy as StoredRole, StoredCopyLabel as StoredRoleLabel } from "./encrypted-copy-storage.js";
const storage = createEncryptedCopyStorage("vulnseal-encrypted-roles", "roles", (encrypted) => {
  const envelope = JSON.parse(encrypted) as Record<string, unknown>;
  if (!envelope || JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(["ciphertext", "format", "iv", "salt", "version"]) || envelope.format !== "vulnseal-role-backup" || envelope.version !== 1 || typeof envelope.salt !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(envelope.salt) || typeof envelope.iv !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) || typeof envelope.ciphertext !== "string" || !/^[A-Za-z0-9_-]{22,}$/.test(envelope.ciphertext)) throw new Error("Only encrypted single-role backups can be stored here");
});
export const listStoredRoles = storage.list;
export const readStoredRole = storage.read;
export const writeStoredRole = storage.write;
export const deleteStoredRole = storage.remove;
