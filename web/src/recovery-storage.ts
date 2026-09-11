// SPDX-License-Identifier: Apache-2.0
import { createEncryptedCopyStorage } from "./encrypted-copy-storage.js";
import { parseRecoveryEnvelope } from "./recovery.js";
export type { StoredCopy, StoredCopyLabel } from "./encrypted-copy-storage.js";
const storage = createEncryptedCopyStorage("vulnseal-encrypted-recovery", "copies", (encrypted) => { parseRecoveryEnvelope(encrypted); });
export const listStoredRecoveries = storage.list;
export const readStoredRecovery = storage.read;
export const writeStoredRecovery = storage.write;
export const deleteStoredRecovery = storage.remove;
