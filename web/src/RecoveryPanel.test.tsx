// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryPanel } from "./RecoveryPanel.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const submit = (name: string) => fireEvent.submit(screen.getByRole("button", { name }).closest("form")!);
const exportInput = () => {
  fireEvent.change(screen.getByLabelText("Backup password"), { target: { value: "Synthetic recovery password" } });
  fireEvent.change(screen.getByLabelText("Confirm backup password"), { target: { value: "Synthetic recovery password" } });
};

it("does not download an export completed after the panel unmounts", async () => {
  let finish!: (value: string) => void;
  const onExport = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const create = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = create; });
  const view = render(<RecoveryPanel onExport={onExport} onImport={vi.fn()} canImport />);
  exportInput(); submit("Download encrypted backup");
  expect(screen.getByLabelText("Backup password")).toBeDisabled();
  submit("Download encrypted backup");
  expect(onExport).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => finish("encrypted backup"));
  expect(create).not.toHaveBeenCalled();
});

it.each(["unmount", "active session"])("does not start recovery after a delayed file read and %s", async reason => {
  let finish!: (value: string) => void;
  const file = new File(["{}"], "recovery.json");
  Object.defineProperty(file, "text", { value: () => new Promise<string>(resolve => { finish = resolve; }) });
  const onImport = vi.fn(), onExport = vi.fn();
  const view = render(<RecoveryPanel onExport={onExport} onImport={onImport} canImport />);
  fireEvent.change(screen.getByLabelText("Recovery file"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "Synthetic recovery password" } });
  submit("Restore encrypted backup");
  submit("Download encrypted backup");
  expect(onExport).not.toHaveBeenCalled();
  if (reason === "unmount") view.unmount();
  else view.rerender(<RecoveryPanel onExport={onExport} onImport={onImport} canImport={false} />);
  await act(async () => finish("encrypted backup"));
  expect(onImport).not.toHaveBeenCalled();
  if (reason === "active session") expect(screen.getByRole("alert")).toHaveTextContent("Restore in a fresh tab");
});

it("cleans a failed download, retains the password and permits an explicit retry", async () => {
  vi.useFakeTimers();
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:recovery"; static revokeObjectURL = revoke; });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementationOnce(() => { throw new Error("Synthetic download failure"); }).mockImplementation(() => {});
  const onExport = vi.fn().mockResolvedValue("encrypted backup");
  render(<RecoveryPanel onExport={onExport} onImport={vi.fn()} canImport />);
  exportInput();
  await act(async () => submit("Download encrypted backup"));
  expect(screen.getByRole("alert")).toHaveTextContent("Synthetic download failure");
  expect(document.querySelector('a[download="vulnseal-recovery.json"]')).toBeNull();
  expect(screen.getByLabelText("Backup password")).toHaveValue("Synthetic recovery password");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(revoke).toHaveBeenCalledWith("blob:recovery");
  await act(async () => submit("Download encrypted backup"));
  expect(click).toHaveBeenCalledTimes(2);
  expect(onExport).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Backup password")).toHaveValue("");
  expect(screen.getByText(/Encrypted backup download started/)).toBeInTheDocument();
  await act(async () => vi.runOnlyPendingTimers());
});

const leaving = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event); return event.defaultPrevented;
};

it.each(["Backup password", "Confirm backup password", "Recovery password", "Recovery file"])("warns for unfinished %s and clears it explicitly", label => {
  const view = render(<RecoveryPanel onExport={vi.fn()} onImport={vi.fn()} canImport />);
  expect(leaving()).toBe(false);
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: label === "Recovery file" ? { files: [new File(["{}"], "recovery.json")] } : { value: "Unfinished recovery password" } });
  expect(leaving()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear recovery inputs" }));
  expect(leaving()).toBe(false);
  expect(input).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Backup password"), { target: { value: "New input" } });
  view.unmount();
  expect(leaving()).toBe(false);
});

it("clears the restored file and password only after successful import", async () => {
  const file = new File(["{}"], "recovery.json");
  Object.defineProperty(file, "text", { value: async () => "encrypted backup" });
  const onImport = vi.fn().mockRejectedValueOnce(new Error("Wrong backup password")).mockResolvedValueOnce(undefined);
  render(<RecoveryPanel onExport={vi.fn()} onImport={onImport} canImport />);
  fireEvent.change(screen.getByLabelText("Recovery file"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "Synthetic recovery password" } });
  await act(async () => submit("Restore encrypted backup"));
  expect(screen.getByRole("alert")).toHaveTextContent("Wrong backup password");
  expect(leaving()).toBe(true);
  await act(async () => submit("Restore encrypted backup"));
  expect(onImport).toHaveBeenLastCalledWith("encrypted backup", "Synthetic recovery password");
  expect(screen.getByLabelText("Recovery file")).toHaveValue("");
  expect(screen.getByLabelText("Recovery password")).toHaveValue("");
  expect(leaving()).toBe(false);
});
