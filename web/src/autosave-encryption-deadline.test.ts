// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryAutosave } from "./recovery-autosave.js";
import { RoleAutosave } from "./role-autosave.js";
import * as combined from "./recovery.js";
import * as role from "./role-recovery.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

for (const kind of ["combined", "role"] as const) for (const expiry of ["timer", "wall", "monotonic"] as const) it(`${kind} autosave stops its queue after ${expiry} encryption expiry without storing a late result`, async () => {
  const { snapshot } = await recoveryFixture();
  const vault: role.RoleVault = { version: 1, role: "vendor", network: "preprod", programId: "12".repeat(32), actorSecret: "34".repeat(32), contractAddress: null, reports: [] };
  let finish!: (value: string) => void;
  const encrypt = kind === "combined" ? vi.spyOn(combined, "encryptRecovery") : vi.spyOn(role, "encryptRoleVault");
  encrypt.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
  const write = vi.fn();
  const row = { id: "12345678-1234-1234-1234-123456789abc", label: "Synthetic copy", revision: 1, updatedAt: "2026-09-11T00:00:00.000Z", encrypted: "original ciphertext" };
  const combinedWriter = new RecoveryAutosave(row, "Synthetic autosave password", write), roleWriter = new RoleAutosave(row, "Synthetic autosave password", write);
  const save = () => kind === "combined" ? combinedWriter.save(snapshot) : roleWriter.save(vault);
  vi.useFakeTimers();
  const outcomes = Promise.allSettled([save(), save()]);
  await Promise.resolve();
  expect(encrypt).toHaveBeenCalledOnce();
  if (expiry === "timer") await vi.advanceTimersByTimeAsync(180000);
  else if (expiry === "wall") vi.setSystemTime(Date.now() + 180001);
  else {
    const later = performance.now() + 180001;
    vi.spyOn(performance, "now").mockReturnValue(later);
    vi.setSystemTime(Date.now() - 60000);
  }
  finish("late ciphertext");
  const results = await outcomes;
  expect(results[0]).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("encryption timed out") }) });
  expect(results[1]).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("stopped") }) });
  expect(write).not.toHaveBeenCalled();
  expect(encrypt).toHaveBeenCalledOnce();
  await expect(save()).rejects.toThrow("stopped");
  expect(row.encrypted).toBe("original ciphertext");
});
