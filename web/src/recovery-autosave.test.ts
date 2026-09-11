// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { RecoveryAutosave } from "./recovery-autosave.js";
import { decryptRecovery } from "./recovery.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
import type { StoredCopy } from "./recovery-storage.js";
const initial: StoredCopy = { id: "12345678-1234-1234-1234-123456789abc", label: "Copy", revision: 1, updatedAt: "2026-09-11T00:00:00Z", encrypted: "initial" };
const password = "Synthetic recovery autosave password";
it("captures queued snapshots and the copy identity while advancing revisions serially", async () => {
  const { snapshot } = await recoveryFixture();
  const writes: { encrypted: string; expected: number | null }[] = [];
  const write = vi.fn(async (id: string, label: string, encrypted: string, expected: number | null) => { writes.push({ encrypted, expected }); return { ...initial, id, label, encrypted, revision: expected! + 1 }; });
  const row = { ...initial }, writer = new RecoveryAutosave(row, password, write);
  const next = { ...snapshot, rationale: "Captured queued note" };
  const pending = [writer.save(snapshot), writer.save(next)];
  row.id = "Changed caller-owned identity"; next.rationale = "Late caller edit";
  await Promise.all(pending);
  expect(writes.map((row) => row.expected)).toEqual([1, 2]);
  expect(write.mock.calls.every(([id]) => id === initial.id)).toBe(true);
  expect((await decryptRecovery(writes[0]!.encrypted, password)).snapshot.rationale).toBe(snapshot.rationale);
  expect((await decryptRecovery(writes[1]!.encrypted, password)).snapshot.rationale).toBe("Captured queued note");
  expect(writes[1]!.encrypted).not.toContain("Captured queued note");
});
it("stops after a conflict without allowing queued saves to overwrite the newer copy", async () => {
  const { snapshot } = await recoveryFixture();
  const write = vi.fn().mockRejectedValue(new Error("Concurrent revision changed"));
  const writer = new RecoveryAutosave(initial, password, write);
  const results = await Promise.allSettled([writer.save(snapshot), writer.save(snapshot)]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(write).toHaveBeenCalledOnce();
  await expect(writer.save(snapshot)).rejects.toThrow("stopped");
});
it("does not persist a queued save after explicit stop", async () => {
  const { snapshot } = await recoveryFixture();
  const write = vi.fn(), writer = new RecoveryAutosave(initial, password, write);
  const pending = writer.save(snapshot); writer.stop();
  await expect(pending).rejects.toThrow("stopped"); expect(write).not.toHaveBeenCalled();
});
