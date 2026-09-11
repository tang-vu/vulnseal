// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hexToBytes } from "@vulnseal/shared";
import { pureCircuits } from "@vulnseal/contract";
import { programConstructor } from "./program.js";
import { decryptRecovery } from "./recovery.js";
import { SUBMISSION_PREPARATION_TIMEOUT_MS } from "./submission-wait.js";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), deploy: vi.fn(), join: vi.fn(), write: vi.fn() }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.connect }));
vi.mock("@vulnseal/api/api", () => ({ VulnSealApi: { deploy: mocks.deploy, join: mocks.join } }));
vi.mock("./recovery-storage.js", async importOriginal => ({ ...await importOriginal<typeof import("./recovery-storage.js")>(), writeStoredRecovery: mocks.write }));
import App from "./App.js";
const password = "Synthetic durable deployment password", transactionId = "cd".repeat(32);
const row = (id: string, label: string, encrypted: string, revision: number | null) => ({ id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() });
const checkpoint = () => mocks.connect.mock.calls[0]![1](transactionId);
beforeEach(() => {
  mocks.connect.mockReset().mockResolvedValue({}); mocks.deploy.mockReset(); mocks.join.mockReset(); mocks.write.mockReset().mockImplementation(async (...args) => row(...args as Parameters<typeof row>));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const start = async () => {
  const view = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Guided local" }));
  fireEvent.click(await screen.findByRole("button", { name: "Set up program" }));
  fireEvent.change(screen.getByLabelText("Deployment backup password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm deployment backup password"), { target: { value: password } });
  fireEvent.submit(screen.getByRole("button", { name: "Create program" }).closest("form")!);
  return view;
};

it("does not invoke the SDK when the initial encrypted copy fails, preserving password for retry", async () => {
  mocks.write.mockRejectedValueOnce(new Error("Synthetic initial quota failure"));
  await start();
  await screen.findAllByText("Synthetic initial quota failure", {}, { timeout: 5000 });
  expect(mocks.deploy).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Deployment backup password")).toHaveValue(password);
  expect(screen.getByRole("button", { name: "Create program" })).toBeEnabled();
});

it("does not invoke the SDK after an initial save completes following unmount", async () => {
  let finish!: () => void;
  mocks.write.mockImplementationOnce((...args) => new Promise(resolve => { finish = () => resolve(row(...args as Parameters<typeof row>)); }));
  const view = await start();
  await waitFor(() => expect(finish).toBeTypeOf("function"), { timeout: 5000 });
  view.unmount(); await act(async () => finish());
  expect(mocks.deploy).not.toHaveBeenCalled();
});

it.each(["storage failure", "timeout", "unmount"])("blocks broadcast after %s during identifier persistence", async outcome => {
  const broadcast = vi.fn();
  mocks.deploy.mockImplementation(async () => { await checkpoint(); broadcast(); return new Promise(() => {}); });
  let finish!: () => void;
  mocks.write.mockImplementationOnce(async (...args) => row(...args as Parameters<typeof row>));
  mocks.write.mockImplementationOnce((...args) => new Promise((resolve, reject) => { finish = () => outcome === "storage failure" ? reject(new Error("Synthetic journal write failure")) : resolve(row(...args as Parameters<typeof row>)); }));
  const timers = vi.spyOn(globalThis, "setTimeout");
  const view = await start();
  await waitFor(() => expect(finish).toBeTypeOf("function"), { timeout: 5000 });
  expect(broadcast).not.toHaveBeenCalled();
  const initial = await decryptRecovery(mocks.write.mock.calls[0]![2], password);
  const recorded = await decryptRecovery(mocks.write.mock.calls[1]![2], password);
  expect(initial.snapshot.version).toBe(6);
  expect(recorded.snapshot.deploymentTransactionId).toBe(transactionId);
  expect(recorded.snapshot.programId).toBe(initial.snapshot.programId);
  if (outcome === "unmount") view.unmount();
  if (outcome === "timeout") {
    const expire = timers.mock.calls.find(([, duration]) => duration === SUBMISSION_PREPARATION_TIMEOUT_MS)![0] as () => void;
    await act(async () => expire());
  }
  await act(async () => finish());
  expect(broadcast).not.toHaveBeenCalled();
  if (outcome !== "unmount") {
    await waitFor(() => expect(screen.getByRole("button", { name: "Private recovery" })).toBeEnabled());
    expect(screen.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create program" })).not.toBeInTheDocument();
  }
}, 20_000);

it("rejects a first checkpoint that arrives after preparation expired", async () => {
  let resume!: () => void;
  const broadcast = vi.fn();
  mocks.deploy.mockImplementation(async () => { await new Promise<void>(resolve => { resume = resolve; }); await checkpoint(); broadcast(); return new Promise(() => {}); });
  const timers = vi.spyOn(globalThis, "setTimeout");
  await start();
  await waitFor(() => expect(resume).toBeTypeOf("function"), { timeout: 5000 });
  const expire = timers.mock.calls.find(([, duration]) => duration === SUBMISSION_PREPARATION_TIMEOUT_MS)![0] as () => void;
  await act(async () => expire());
  await act(async () => resume());
  expect(mocks.write).toHaveBeenCalledOnce(); expect(broadcast).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeInTheDocument();
});


it.each(["saved", "storage failure"])("retains finalized deployment when its recovery update is %s", async outcome => {
  const contractAddress = "ef".repeat(32);
  mocks.deploy.mockImplementation(async () => { await checkpoint(); return { api: { contractAddress }, evidence: { circuit: "constructor", txId: transactionId, blockHeight: "123" } }; });
  if (outcome === "storage failure") {
    mocks.write.mockImplementationOnce(async (...args) => row(...args as Parameters<typeof row>));
    mocks.write.mockImplementationOnce(async (...args) => row(...args as Parameters<typeof row>));
    mocks.write.mockRejectedValueOnce(new Error("Synthetic final update failure"));
  }
  const view = await start();
  await screen.findByRole("heading", { name: "Acme Security Program" }, { timeout: 5000 });
  expect(mocks.deploy).toHaveBeenCalledOnce();
  expect(mocks.write).toHaveBeenCalledTimes(3);
  const initial = await decryptRecovery(mocks.write.mock.calls[1]![2], password);
  const updated = await decryptRecovery(mocks.write.mock.calls[2]![2], password);
  expect(initial.snapshot.contractAddress).toBeNull();
  expect(updated.snapshot.contractAddress).toBe(contractAddress);
  expect(updated.snapshot.deploymentTransactionId).toBe(transactionId);
  expect(updated.snapshot.deploymentAttempt).toBeUndefined();
  expect(mocks.write.mock.calls[2]![0]).toBe(mocks.write.mock.calls[0]![0]);
  expect(mocks.write.mock.calls[2]![3]).toBe(2);
  expect(screen.queryByRole("heading", { name: "Deployment outcome needs investigation" })).not.toBeInTheDocument();
  expect(screen.getByText(outcome === "saved" ? /Confirmed deployment address saved/ : /Deployment finalized, but its browser recovery update was not confirmed/)).toBeInTheDocument();
  if (outcome === "saved") {
    const material = updated.snapshot, programId = hexToBytes(material.programId);
    const ledger = { ...await programConstructor(programId, material.policy), ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(material.vendorSecret)) };
    const readPublicState = vi.fn().mockResolvedValue({ ledger });
    mocks.join.mockResolvedValue({ contractAddress, readPublicState });
    const serialized = mocks.write.mock.calls[2]![2];
    view.unmount(); render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Private recovery" }));
    const file = new File([serialized], "confirmed-deployment.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serialized });
    fireEvent.change(screen.getByLabelText("Recovery file"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: password } });
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    await screen.findByRole("heading", { name: "Seal a vulnerability report" }, { timeout: 5000 });
    expect(mocks.join).toHaveBeenCalledOnce(); expect(readPublicState).toHaveBeenCalledOnce();
    expect(mocks.join.mock.calls[0]![1]).toBe(contractAddress);
    expect(mocks.deploy).toHaveBeenCalledOnce();
  }
}, 20_000);
