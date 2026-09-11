// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { writeStoredRecovery } from "./recovery-storage.js";
import { writeStoredRole } from "./role-storage.js";
const id = "12345678-1234-1234-1234-123456789abc";
afterEach(() => vi.unstubAllGlobals());
it.each(["private plaintext", JSON.stringify({ format: "vulnseal-role-backup", version: 1, salt: "a".repeat(22), iv: "b".repeat(16), ciphertext: "c".repeat(22) })])("rejects non-recovery content before opening browser storage", async encrypted => {
  const open = vi.fn(); vi.stubGlobal("indexedDB", { open });
  await expect(writeStoredRecovery(id, "Copy", encrypted, null)).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});
it("keeps combined envelopes out of single-role storage", async () => {
  const open = vi.fn(); vi.stubGlobal("indexedDB", { open });
  await expect(writeStoredRole(id, "Copy", JSON.stringify({ format: "vulnseal-recovery", version: 1 }), null)).rejects.toThrow("Only encrypted single-role backups");
  expect(open).not.toHaveBeenCalled();
});
