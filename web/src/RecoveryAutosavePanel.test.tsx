// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryAutosavePanel, type AcquireRecoveryPersistence } from "./RecoveryAutosavePanel.js";
import { RecoveryAutosave } from "./recovery-autosave.js";
import * as storage from "./recovery-storage.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
const row = { id: "copy", label: "Copy", revision: 1, encrypted: "synthetic", updatedAt: "2026-09-11T00:00:00.000Z" };
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function setup() {
  const { snapshot } = await recoveryFixture();
  vi.spyOn(storage, "writeStoredRecovery").mockResolvedValue(row);
  const save = vi.spyOn(RecoveryAutosave.prototype, "save").mockResolvedValue({ ...row, revision: 2 });
  let acquire: AcquireRecoveryPersistence | undefined;
  const props = { snapshot, onSaved: vi.fn(), onActive: vi.fn(), onPersistence: (value: typeof acquire) => { acquire = value; } };
  const view = render(<RecoveryAutosavePanel {...props} />);
  fireEvent.change(screen.getByLabelText("Autosave password"), { target: { value: "Synthetic checkpoint password" } });
  fireEvent.change(screen.getByLabelText("Confirm autosave password"), { target: { value: "Synthetic checkpoint password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Enable encrypted autosave" }).closest("form")!);
  await screen.findByRole("button", { name: "Stop encrypted autosave" }, { timeout: 5000 });
  return { view, props, save, acquire: () => acquire!(), available: () => acquire !== undefined };
}
it("suspends pending and newly rendered debounce writes while a transaction owns persistence", async () => {
  const { view, props, save, acquire } = await setup(); vi.useFakeTimers();
  view.rerender(<RecoveryAutosavePanel {...props} snapshot={{ ...props.snapshot, rationale: "Old pending draft" }} />);
  const lease = acquire(); expect(() => acquire()).toThrow("already in use");
  const confirmed = { ...props.snapshot, rationale: "Confirmed transaction snapshot" };
  view.rerender(<RecoveryAutosavePanel {...props} snapshot={confirmed} />);
  await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(save).not.toHaveBeenCalled();
  await act(async () => { await lease.save(confirmed); lease.release(); });
  await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(save).toHaveBeenCalledExactlyOnceWith(confirmed);
  const latest = { ...confirmed, rationale: "Next private edit" };
  view.rerender(<RecoveryAutosavePanel {...props} snapshot={latest} />);
  await act(async () => vi.advanceTimersByTimeAsync(750)); expect(save).toHaveBeenLastCalledWith(latest);
  await expect(lease.save(confirmed)).rejects.toThrow("closed");
});
it.each(["stop", "unmount"])("does not confirm a leased save completed after %s", async reason => {
  const { view, props, save, acquire, available } = await setup();
  let finish!: () => void;
  save.mockImplementation(() => new Promise(resolve => { finish = () => resolve(row); }));
  const lease = acquire(), pending = lease.save(props.snapshot), rejection = expect(pending).rejects.toThrow("closed");
  if (reason === "unmount") view.unmount();
  else act(() => lease.stop());
  expect(available()).toBe(false);
  await act(async () => { finish(); await rejection; });
  expect(props.onSaved).toHaveBeenCalledOnce();
});
