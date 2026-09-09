// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { RoleAutosave } from "./role-autosave.js";
import { decryptRoleVault, type RoleVault } from "./role-recovery.js";
import type { StoredRole } from "./role-storage.js";
const vault: RoleVault = { version: 1, role: "vendor", network: "preprod", programId: "12".repeat(32), actorSecret: "34".repeat(32), contractAddress: null, reports: [] };
const row: StoredRole = { id: "12345678-1234-1234-1234-123456789abc", label: "Test copy", revision: 1, updatedAt: "2026-09-09T00:00:00.000Z", encrypted: "initial" };
describe("encrypted role autosave ordering", () => {
  it("serializes updates with fresh ciphertext and increasing expected revisions", async () => {
    const writes: { encrypted: string; expected: number | null }[] = [];
    const write = vi.fn(async (id: string, label: string, encrypted: string, expected: number | null) => { writes.push({ encrypted, expected }); return { ...row, id, label, encrypted, revision: expected! + 1 }; });
    const writer = new RoleAutosave(row, "Browser autosave test password", write);
    const deployed = { ...vault, contractAddress: "ab".repeat(32) };
    const first = writer.save(vault), second = writer.save(deployed);
    await Promise.all([first, second]);
    expect(writes.map((entry) => entry.expected)).toEqual([1, 2]);
    expect((await decryptRoleVault(writes[0]!.encrypted, "Browser autosave test password")).contractAddress).toBeNull();
    expect((await decryptRoleVault(writes[1]!.encrypted, "Browser autosave test password")).contractAddress).toBe(deployed.contractAddress);
    expect(writes[0]!.encrypted).not.toContain(vault.actorSecret);
  });
  it("stops on a conflict without letting queued snapshots overwrite the newer copy", async () => {
    const write = vi.fn().mockRejectedValue(new Error("Concurrent update"));
    const writer = new RoleAutosave(row, "Browser autosave test password", write);
    const outcomes = await Promise.allSettled([writer.save(vault), writer.save(vault)]);
    expect(outcomes.every((result) => result.status === "rejected")).toBe(true);
    expect(write).toHaveBeenCalledOnce();
  });
  it("stops before persisting an encryption that was in flight when paused", async () => {
    const write = vi.fn(); const writer = new RoleAutosave(row, "Browser autosave test password", write);
    const pending = writer.save(vault); writer.stop();
    await expect(pending).rejects.toThrow("stopped"); expect(write).not.toHaveBeenCalled();
  });
});
