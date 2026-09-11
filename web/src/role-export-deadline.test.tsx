// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoleWorkspace } from "./RoleWorkspace.js";
import * as recovery from "./role-recovery.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(["timeout", "unmount"])("does not download role encryption completed after %s", async reason => {
  let finishOld!: (value: string) => void, finishNew!: (value: string) => void;
  const encrypt = vi.spyOn(recovery, "encryptRoleVault").mockImplementationOnce(() => new Promise<string>(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise<string>(resolve => { finishNew = resolve; }));
  const create = vi.fn().mockReturnValue("blob:synthetic");
  vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const view = render(<RoleWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
  fireEvent.change(screen.getByLabelText("Role backup password"), { target: { value: "Synthetic role export password" } });
  fireEvent.change(screen.getByLabelText("Confirm role backup password"), { target: { value: "Synthetic role export password" } });
  const start = () => fireEvent.submit(screen.getByRole("button", { name: "Download single-role backup" }).closest("form")!);
  vi.useFakeTimers(); start();
  if (reason === "unmount") view.unmount();
  else {
    await act(async () => vi.advanceTimersByTimeAsync(180000));
    expect(screen.getByText(/Role backup encryption timed out/)).toBeInTheDocument();
    expect(screen.getByLabelText("Role backup password")).toHaveValue("Synthetic role export password");
    expect(screen.getByRole("button", { name: "Download single-role backup" })).toBeEnabled();
    start();
  }
  await act(async () => finishOld("expired backup"));
  expect(create).not.toHaveBeenCalled();
  if (reason === "timeout") {
    expect(screen.getByRole("button", { name: "Download single-role backup" })).toBeDisabled();
    await act(async () => finishNew("new backup"));
    expect(create).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Role backup password")).toHaveValue("");
    expect(encrypt).toHaveBeenCalledTimes(2);
  }
});
