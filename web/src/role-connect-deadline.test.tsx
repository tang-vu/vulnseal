// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as recovery from "./role-recovery.js";
const mocks = vi.hoisted(() => ({ join: vi.fn() }));
vi.mock("./role-network.js", () => ({ joinRoleVault: mocks.join }));
import { RoleWorkspace } from "./RoleWorkspace.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); mocks.join.mockReset(); });
const invitation = { format: "vulnseal-program-invitation", version: 1, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
for (const path of ["invitation", "reconnect"]) for (const ending of ["timeout", "unmount"]) it(`${path} cannot install a role connection after ${ending}`, async () => {
  let finish!: (value: any) => void;
  mocks.join.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  vi.spyOn(recovery, "decryptRoleVault").mockResolvedValue({ version: 1, role: "vendor", network: "preprod", contractAddress: invitation.contractAddress, programId: invitation.programId, actorSecret: "34".repeat(32), reports: [] });
  const view = render(<RoleWorkspace />);
  const file = new File([JSON.stringify(invitation)], "synthetic.json"); Object.defineProperty(file, "text", { value: async () => JSON.stringify(invitation) });
  if (path === "invitation") await act(async () => fireEvent.change(screen.getByLabelText("Public program invitation"), { target: { files: [file] } }));
  else {
    fireEvent.click(screen.getByLabelText("Restore backups without connecting Lace"));
    fireEvent.change(screen.getByLabelText("Single-role backup file"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Role restore password"), { target: { value: "Synthetic reconnect password" } });
    await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Restore role workspace" }).closest("form")!));
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
  }
  const button = path === "invitation" ? "Connect Lace and join as researcher" : "Connect Lace and verify program";
  vi.useFakeTimers();
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: button }).closest("form")!));
  expect(mocks.join).toHaveBeenCalledOnce();
  const assertActive = mocks.join.mock.calls[0]![2] as () => void;
  if (ending === "unmount") view.unmount();
  else {
    await act(async () => vi.advanceTimersByTimeAsync(180000));
    expect(screen.getByText(/Role connection timed out/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: button })).toBeEnabled();
  }
  expect(assertActive).toThrow();
  await act(async () => finish({ session: {}, snapshot: {} }));
  expect(screen.queryByRole("button", { name: "Refresh ledger" })).not.toBeInTheDocument();
  if (path === "invitation") expect(screen.queryByRole("heading", { name: "Researcher workspace" })).not.toBeInTheDocument();
});
