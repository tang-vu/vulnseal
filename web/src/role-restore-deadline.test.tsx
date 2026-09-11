// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as recovery from "./role-recovery.js";
import * as storage from "./role-storage.js";
const mocks = vi.hoisted(() => ({ join: vi.fn() }));
vi.mock("./role-network.js", () => ({ joinRoleVault: mocks.join }));
import { RoleWorkspace } from "./RoleWorkspace.js";
import { LocalRoleStorage } from "./LocalRoleStorage.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); mocks.join.mockReset(); });
const vault: recovery.RoleVault = { version: 1, role: "vendor", network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32), actorSecret: "34".repeat(32), reports: [] };
const password = "Synthetic role restore password";
for (const stage of ["decrypt", "join"]) for (const close of ["timeout", "unmount"]) it(`role file restore rejects ${stage} after ${close}`, async () => {
  let finish!: (value: any) => void;
  const decrypt = vi.spyOn(recovery, "decryptRoleVault").mockResolvedValue(vault);
  if (stage === "decrypt") decrypt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  else mocks.join.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<RoleWorkspace />);
  const file = new File(["encrypted"], "role.json"); Object.defineProperty(file, "text", { value: async () => "encrypted" });
  fireEvent.change(screen.getByLabelText("Single-role backup file"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Role restore password"), { target: { value: password } });
  vi.useFakeTimers();
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Restore role workspace" }).closest("form")!));
  if (close === "unmount") view.unmount();
  else {
    await act(async () => vi.advanceTimersByTimeAsync(180000));
    expect(screen.getByText(/Role restoration timed out/)).toBeInTheDocument();
    expect(screen.getByLabelText("Role restore password")).toHaveValue(password);
    expect(screen.getByRole("button", { name: "Restore role workspace" })).toBeEnabled();
  }
  await act(async () => finish(stage === "decrypt" ? vault : { session: {}, snapshot: {} }));
  expect(screen.queryByRole("heading", { name: "Vendor workspace" })).not.toBeInTheDocument();
  if (stage === "decrypt") expect(mocks.join).not.toHaveBeenCalled();
});

it.each(["read", "decrypt"])("browser unlock rejects a late %s without restoring or activating autosave", async stage => {
  const row = { id: "copy", label: "Synthetic", revision: 1, updatedAt: "2026-09-11T00:00:00.000Z", encrypted: "encrypted" };
  vi.spyOn(storage, "listStoredRoles").mockResolvedValue([row]);
  const read = vi.spyOn(storage, "readStoredRole").mockResolvedValue(row);
  const decrypt = vi.spyOn(recovery, "decryptRoleVault").mockResolvedValue(vault);
  let finish!: (value: any) => void;
  if (stage === "read") read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  else decrypt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const restore = vi.fn();
  render(<LocalRoleStorage vault={undefined} disabled={false} onSaved={vi.fn()} onRestore={restore} />);
  await screen.findByRole("option", { name: /Synthetic/ });
  fireEvent.change(screen.getByLabelText("Saved browser workspace"), { target: { value: "copy" } });
  fireEvent.change(screen.getByLabelText("Browser unlock password"), { target: { value: password } });
  vi.useFakeTimers();
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Unlock browser workspace" }).closest("form")!));
  await act(async () => vi.advanceTimersByTimeAsync(180000));
  expect(screen.getByText(/Browser backup decryption timed out/)).toBeInTheDocument();
  expect(screen.getByLabelText("Browser unlock password")).toHaveValue(password);
  await act(async () => finish(stage === "read" ? row : vault));
  expect(restore).not.toHaveBeenCalled();
  if (stage === "read") expect(decrypt).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Stop browser autosave" })).not.toBeInTheDocument();
});
