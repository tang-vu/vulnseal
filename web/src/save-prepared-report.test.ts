// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { savePreparedReport } from "./save-prepared-report.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
const row = { id: "copy", label: "Copy", revision: 1, encrypted: "synthetic", updatedAt: "now" };
afterEach(() => vi.restoreAllMocks());
it("releases upload only after its preparation copy is confirmed", async () => {
  const { snapshot } = await recoveryFixture();
  const events: string[] = [];
  let finish!: () => void;
  const lease = { save: vi.fn(() => new Promise<typeof row>(resolve => { finish = () => resolve(row); })), release: vi.fn(() => events.push("release")), stop: vi.fn() };
  const pending = savePreparedReport(snapshot, lease, () => {}).then(() => events.push("upload"));
  expect(lease.save).toHaveBeenCalledWith(snapshot); expect(events).toEqual([]);
  finish(); await pending; expect(events).toEqual(["release", "upload"]); expect(lease.stop).not.toHaveBeenCalled();
});
it.each(["storage error", "timeout", "unmount", "elapsed wall clock"])("never releases upload after %s, including a late save", async reason => {
  const { snapshot } = await recoveryFixture();
  let finish!: () => void, active = true;
  const lease = { save: vi.fn(() => new Promise<typeof row>((resolve, reject) => { finish = () => reason === "storage error" ? reject(new Error("Synthetic quota failure")) : resolve(row); })), release: vi.fn(), stop: vi.fn() };
  const upload = vi.fn(), timers = vi.spyOn(globalThis, "setTimeout");
  const pending = savePreparedReport(snapshot, lease, () => { if (!active) throw new Error("Session closed"); }).then(upload);
  const rejected = expect(pending).rejects.toThrow();
  if (reason === "timeout") (timers.mock.calls.find(([, duration]) => duration === 60_000)![0] as () => void)();
  if (reason === "unmount") active = false;
  if (reason === "elapsed wall clock") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
  finish(); await rejected;
  expect(lease.stop).toHaveBeenCalledOnce(); expect(lease.release).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
