// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), backup: vi.fn(), parse: vi.fn() }));
vi.mock("./handoff.js", async (original) => ({ ...await original<typeof import("./handoff.js")>(), createRecipient: mocks.create, backupRecipient: mocks.backup, parseRecipient: mocks.parse }));
import { HandoffPanel } from "./HandoffPanel.js";
import type { Disclosure, RecipientKeys } from "./handoff.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const keys = { recipient: { format: "vulnseal-recipient", version: 1, publicKey: "synthetic", fingerprint: "ab".repeat(32) }, privateKey: {} } as RecipientKeys;
const start = () => {
  fireEvent.change(screen.getByLabelText("Recipient backup password"), { target: { value: "Synthetic receiving password" } });
  fireEvent.change(screen.getByLabelText("Confirm recipient backup password"), { target: { value: "Synthetic receiving password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create receiving key and save backup" }).closest("form")!);
};

const warnsOnLeave = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

it("requires renewed recipient confirmation when selected disclosure changes, but preserves it across equivalent renders", async () => {
  const disclosure: Disclosure = { network: "undeployed", contractAddress: null, programId: "aa".repeat(32), reportId: "bb".repeat(32), envelope: "synthetic envelope", key: "cc".repeat(32), salt: "dd".repeat(32) };
  mocks.parse.mockResolvedValue(keys.recipient);
  const onKeys = vi.fn();
  const view = render(<HandoffPanel disclosure={disclosure} keys={undefined} onKeys={onKeys} />);
  const file = new File(["{}"], "recipient.json");
  Object.defineProperty(file, "text", { value: async () => "{}" });
  fireEvent.change(screen.getByLabelText("Recipient public key file"), { target: { files: [file] } });
  await screen.findByText(keys.recipient.fingerprint);
  const consent = screen.getByRole("checkbox"), send = screen.getByRole("button", { name: "Download encrypted disclosure" });
  fireEvent.click(consent);
  expect(send).toBeEnabled();
  view.rerender(<HandoffPanel disclosure={{ ...disclosure }} keys={undefined} onKeys={onKeys} />);
  expect(consent).toBeChecked();
  for (const change of [{ reportId: "ee".repeat(32) }, { envelope: "changed envelope" }, { network: "preprod" as const }, { contractAddress: "ff".repeat(32) }, { programId: "11".repeat(32) }, { key: "22".repeat(32) }, { salt: "33".repeat(32) }]) {
    view.rerender(<HandoffPanel disclosure={{ ...disclosure }} keys={undefined} onKeys={onKeys} />);
    if (!(consent as HTMLInputElement).checked) fireEvent.click(consent);
    expect(send).toBeEnabled();
    view.rerender(<HandoffPanel disclosure={{ ...disclosure, ...change }} keys={undefined} onKeys={onKeys} />);
    expect(consent).not.toBeChecked();
    expect(send).toBeDisabled();
    expect(screen.getByText(keys.recipient.fingerprint)).toBeInTheDocument();
    fireEvent.click(consent);
    expect(send).toBeEnabled();
  }
  view.rerender(<HandoffPanel disclosure={undefined} keys={undefined} onKeys={onKeys} />);
  expect(consent).not.toBeChecked(); expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Clear exchange inputs and preview" }));
  expect(screen.queryByText(keys.recipient.fingerprint)).not.toBeInTheDocument();
  expect(consent).toBeDisabled();
  expect(warnsOnLeave()).toBe(false);
});

it("clears unfinished passwords and file state without replacing the retained receiving key", () => {
  const onKeys = vi.fn();
  render(<HandoffPanel disclosure={undefined} keys={keys} onKeys={onKeys} />);
  fireEvent.change(screen.getByLabelText("Recipient backup password"), { target: { value: "unfinished password" } });
  fireEvent.change(screen.getByLabelText("Confirm recipient backup password"), { target: { value: "unfinished confirmation" } });
  fireEvent.change(screen.getByLabelText("Encrypted disclosure file"), { target: { files: [new File(["{}"], "package.json")] } });
  fireEvent.click(screen.getByRole("button", { name: "Clear exchange inputs and preview" }));
  expect(screen.getByLabelText("Recipient backup password")).toHaveValue("");
  expect(screen.getByLabelText("Confirm recipient backup password")).toHaveValue("");
  expect(screen.getByText(keys.recipient.fingerprint)).toBeInTheDocument();
  expect(onKeys).not.toHaveBeenCalled();
  expect(warnsOnLeave()).toBe(true);
});

it("warns for unfinished exchange input, clears reverted input and removes the guard on unmount", () => {
  const view = render(<HandoffPanel disclosure={undefined} keys={undefined} onKeys={vi.fn()} />);
  expect(warnsOnLeave()).toBe(false);
  for (const label of ["Recipient backup password", "Confirm recipient backup password", "Recipient restore password"]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: "unfinished private input" } });
    expect(warnsOnLeave()).toBe(true);
    fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    expect(warnsOnLeave()).toBe(false);
  }
  fireEvent.change(screen.getByLabelText("Encrypted disclosure file"), { target: { files: [new File(["{}"], "disclosure.json")] } });
  expect(warnsOnLeave()).toBe(true);
  fireEvent.change(screen.getByLabelText("Encrypted disclosure file"), { target: { files: [] } });
  expect(warnsOnLeave()).toBe(false);
  fireEvent.change(screen.getByLabelText("Recipient backup file"), { target: { files: [new File(["{}"], "backup.json")] } });
  expect(warnsOnLeave()).toBe(true);
  view.unmount();
  expect(warnsOnLeave()).toBe(false);
});

it("keeps a guard for a retained receiving key even with no unfinished fields", () => {
  const view = render(<HandoffPanel disclosure={undefined} keys={keys} onKeys={vi.fn()} />);
  expect(warnsOnLeave()).toBe(true);
  view.unmount();
  expect(warnsOnLeave()).toBe(false);
});

it("retains the receiving key before backup encryption but does not download after unmount", async () => {
  let finish!: (value: string) => void;
  mocks.create.mockResolvedValue(keys);
  mocks.backup.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve; }));
  const createUrl = vi.fn(() => "blob:synthetic");
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createUrl; });
  const onKeys = vi.fn();
  const view = render(<HandoffPanel disclosure={undefined} keys={undefined} onKeys={onKeys} />);
  start();
  await act(async () => {});
  expect(mocks.backup).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Clear exchange inputs and preview" })).toBeDisabled();
  expect(onKeys).toHaveBeenCalledExactlyOnceWith(keys);
  view.unmount();
  await act(async () => { finish("encrypted synthetic backup"); });
  expect(createUrl).not.toHaveBeenCalled();
  expect(onKeys).toHaveBeenCalledExactlyOnceWith(keys);
});

it("does not start backup derivation when key generation finishes after unmount", async () => {
  let finish!: (value: RecipientKeys) => void;
  mocks.create.mockImplementation(() => new Promise<RecipientKeys>((resolve) => { finish = resolve; }));
  const onKeys = vi.fn();
  const view = render(<HandoffPanel disclosure={undefined} keys={undefined} onKeys={onKeys} />);
  start(); view.unmount();
  await act(async () => { finish(keys); });
  expect(mocks.backup).not.toHaveBeenCalled();
  expect(onKeys).not.toHaveBeenCalled();
});

it("ignores a late failure from a closed panel and permits a fresh panel to create its own key", async () => {
  let fail!: (error: Error) => void;
  mocks.create.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; })).mockResolvedValue(keys);
  mocks.backup.mockResolvedValue("encrypted synthetic backup");
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:synthetic"; static revokeObjectURL = vi.fn(); });
  const abandoned = vi.fn(), current = vi.fn();
  const view = render(<HandoffPanel disclosure={undefined} keys={undefined} onKeys={abandoned} />);
  start(); view.unmount();
  render(<HandoffPanel disclosure={undefined} keys={undefined} onKeys={current} />);
  await act(async () => { fail(new Error("Late failure from closed workspace")); });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  start();
  await screen.findByText(/Recipient backup download started/);
  expect(current).toHaveBeenCalledExactlyOnceWith(keys);
  expect(abandoned).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledOnce();
});

it.each(["encryption", "download"])("retries the same retained receiving key after %s failure", async failure => {
  mocks.create.mockResolvedValue(keys);
  mocks.backup.mockResolvedValue("encrypted synthetic backup");
  if (failure === "encryption") mocks.backup.mockRejectedValueOnce(new Error("Synthetic encryption failure"));
  const createUrl = vi.fn(() => "blob:synthetic");
  if (failure === "download") createUrl.mockImplementationOnce(() => { throw new Error("Synthetic download failure"); });
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createUrl; static revokeObjectURL = vi.fn(); });
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  function Parent() {
    const [retained, setRetained] = useState<RecipientKeys>();
    return <HandoffPanel disclosure={undefined} keys={retained} onKeys={setRetained} />;
  }
  render(<Parent />); start();
  expect(await screen.findByRole("alert")).toHaveTextContent(`Synthetic ${failure} failure`);
  expect(screen.getByText(keys.recipient.fingerprint)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save receiving key backup" }));
  await screen.findByText(/Recipient backup download started/);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.backup).toHaveBeenCalledTimes(2);
  for (const call of mocks.backup.mock.calls) expect(call).toEqual([keys, "Synthetic receiving password"]);
  expect(download).toHaveBeenCalledOnce();
});
