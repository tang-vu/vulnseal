// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), backup: vi.fn() }));
vi.mock("./handoff.js", async (original) => ({ ...await original<typeof import("./handoff.js")>(), createRecipient: mocks.create, backupRecipient: mocks.backup }));
import { HandoffPanel } from "./HandoffPanel.js";
import type { RecipientKeys } from "./handoff.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const keys = { recipient: { format: "vulnseal-recipient", version: 1, publicKey: "synthetic", fingerprint: "ab".repeat(32) }, privateKey: {} } as RecipientKeys;
const start = () => {
  fireEvent.change(screen.getByLabelText("Recipient backup password"), { target: { value: "Synthetic receiving password" } });
  fireEvent.change(screen.getByLabelText("Confirm recipient backup password"), { target: { value: "Synthetic receiving password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create receiving key and save backup" }).closest("form")!);
};

it("does not download or attach a receiving key after unmount during backup encryption", async () => {
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
  view.unmount();
  await act(async () => { finish("encrypted synthetic backup"); });
  expect(createUrl).not.toHaveBeenCalled();
  expect(onKeys).not.toHaveBeenCalled();
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
  await screen.findByText(/Recipient backup downloaded/);
  expect(current).toHaveBeenCalledExactlyOnceWith(keys);
  expect(abandoned).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledOnce();
});
