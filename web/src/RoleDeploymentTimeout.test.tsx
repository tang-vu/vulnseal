// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { VulnSealApi } from "@vulnseal/api/api";
import { RoleSession } from "@vulnseal/api/role-session";
import { decryptRoleVault } from "./role-recovery.js";
import { writeStoredRole } from "./role-storage.js";
import { SUBMISSION_CONFIRMATION_TIMEOUT_MS, SUBMISSION_PREPARATION_TIMEOUT_MS } from "./submission-wait.js";

const mocks = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.initialize }));
vi.mock("./role-storage.js", () => ({
  listStoredRoles: vi.fn(async () => []), readStoredRole: vi.fn(), deleteStoredRole: vi.fn(),
  writeStoredRole: vi.fn(async (id, label, encrypted, revision) => ({ id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() })),
}));
import { RoleWorkspace } from "./RoleWorkspace.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

it.each(["resolve", "reject"])("retains deployment recovery and blocks redeployment after timeout with late %s", async (outcome) => {
  const user = userEvent.setup();
  mocks.initialize.mockResolvedValue({});
  const attach = vi.spyOn(RoleSession, "attach");
  const transactionId = "cd".repeat(32), address = "ab".repeat(32);
  let finish!: () => void, fail!: (error: Error) => void;
  const deploy = vi.spyOn(VulnSealApi, "deploy").mockImplementationOnce(async () => {
    const checkpoint = mocks.initialize.mock.calls.at(-1)![1] as (id: string) => Promise<void>;
    await checkpoint(transactionId);
    await new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    return { api: { contractAddress: address }, evidence: { circuit: "constructor", txId: transactionId, blockHeight: "900" } } as Awaited<ReturnType<typeof VulnSealApi.deploy>>;
  });
  render(<RoleWorkspace />);
  await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
  await user.type(screen.getByLabelText("Browser copy password"), "Deployment recovery password");
  await user.type(screen.getByLabelText("Confirm browser copy password"), "Deployment recovery password");
  await user.click(screen.getByRole("button", { name: "Enable encrypted browser autosave" }));
  await screen.findByRole("button", { name: "Stop browser autosave" });
  await user.click(screen.getByRole("button", { name: "Reports" }));
  const button = screen.getByRole("button", { name: "Connect Lace and deploy program" });
  await waitFor(() => expect(button).toBeEnabled());
  let expire!: () => void;
  const realTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === SUBMISSION_CONFIRMATION_TIMEOUT_MS) expire = callback;
    return realTimeout(callback, delay, ...args);
  }) as typeof setTimeout);
  await user.click(button);
  await waitFor(() => expect(expire).toBeTypeOf("function"));
  const ciphertext = vi.mocked(writeStoredRole).mock.calls.at(-1)![2];
  const saved = await decryptRoleVault(ciphertext, "Deployment recovery password");
  expect(saved.contractAddress).toBeNull();
  expect(saved.submissionAttempts).toHaveLength(1);
  expect(saved.submissionAttempts![0]).toMatchObject({ transactionId, intent: { circuit: "constructor", reportId: null } });
  await act(async () => { expire(); });
  expect(screen.getByRole("alert")).toHaveTextContent(transactionId);
  expect(button).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save role backup" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Connect Lace and verify program" })).not.toBeInTheDocument();
  const writes = vi.mocked(writeStoredRole).mock.calls.length;
  await act(async () => { if (outcome === "resolve") finish(); else fail(new Error("Late deployment failure")); });
  expect(screen.getByRole("alert")).toHaveTextContent("Stopped waiting for confirmation");
  expect(writeStoredRole).toHaveBeenCalledTimes(writes);
  expect(attach).not.toHaveBeenCalled();
  expect(screen.queryByText(`Contract: ${address}`)).not.toBeInTheDocument();
  expect(screen.queryByText(/Finalized constructor:/)).not.toBeInTheDocument();
  // The handler also rejects programmatic submission, beyond the disabled button.
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("transactions remain disabled here"));
  expect(deploy).toHaveBeenCalledOnce();
  expect(mocks.initialize).toHaveBeenCalledOnce();
  expect(writeStoredRole).toHaveBeenCalledTimes(writes);
}, 15_000);


it.each(["before checkpoint", "during save"])("blocks deployment after preparation timeout %s, including a late storage completion", async (stage) => {
  const user = userEvent.setup(), password = "Preparation deadline password", txId = "ef".repeat(32);
  mocks.initialize.mockResolvedValue({});
  let finish!: () => void, savedRow: Awaited<ReturnType<typeof writeStoredRole>> | undefined;
  vi.mocked(writeStoredRole).mockImplementation(async (id, label, encrypted, revision) => {
    const row = { id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() };
    if (stage === "during save" && revision !== null) await new Promise<void>(resolve => { finish = resolve; });
    savedRow = row; return row;
  });
  const broadcast = vi.fn();
  const deploy = vi.spyOn(VulnSealApi, "deploy").mockImplementationOnce(async () => {
    if (stage === "before checkpoint") await new Promise<void>(resolve => { finish = resolve; });
    const checkpoint = mocks.initialize.mock.calls.at(-1)![1] as (id: string) => Promise<void>;
    await checkpoint(txId);
    broadcast(); throw new Error("Should not reach broadcast after preparation expiry");
  });
  render(<RoleWorkspace />);
  await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
  await user.type(screen.getByLabelText("Browser copy password"), password);
  await user.type(screen.getByLabelText("Confirm browser copy password"), password);
  await user.click(screen.getByRole("button", { name: "Enable encrypted browser autosave" }));
  await screen.findByRole("button", { name: "Stop browser autosave" });
  await user.click(screen.getByRole("button", { name: "Reports" }));
  const button = screen.getByRole("button", { name: "Connect Lace and deploy program" });
  await waitFor(() => expect(button).toBeEnabled());
  let expire!: () => void;
  const realTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === SUBMISSION_PREPARATION_TIMEOUT_MS) expire = callback;
    return realTimeout(callback, delay, ...args);
  }) as typeof setTimeout);
  await user.click(button);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => { expire(); });
  expect(screen.getByRole("alert")).toHaveTextContent("Stopped waiting for transaction preparation");
  expect(button).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save role backup" })).toBeEnabled();
  const writes = vi.mocked(writeStoredRole).mock.calls.length;
  await act(async () => { finish(); await Promise.resolve(); });
  expect(broadcast).not.toHaveBeenCalled();
  expect(writeStoredRole).toHaveBeenCalledTimes(writes);
  const recovered = await decryptRoleVault(savedRow!.encrypted, password);
  if (stage === "during save") expect(recovered.submissionAttempts?.[0]?.transactionId).toBe(txId);
  else expect(recovered.submissionAttempts ?? []).toHaveLength(0);
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("transactions remain disabled here"));
  expect(deploy).toHaveBeenCalledOnce();
}, 15_000);
