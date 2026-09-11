// SPDX-License-Identifier: Apache-2.0
import { submissionReceipt } from "./submission-receipt.js";
import { emptyAttachmentDraft } from "./attachment-draft.js";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexToBytes, sha256, utf8 } from "@vulnseal/shared";
import { pureCircuits } from "@vulnseal/contract";
import { recoveryFixture } from "./test/recovery-fixture.js";
import { decryptRecovery, encryptRecovery } from "./recovery.js";
import { programConstructor } from "./program.js";
import { DEMO_TRANSITION_TIMEOUT_MS } from "./demo-transition-wait.js";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), deploy: vi.fn(), join: vi.fn(), write: vi.fn() }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.connect }));
vi.mock("@vulnseal/api/api", () => ({ VulnSealApi: { deploy: mocks.deploy, join: mocks.join } }));
vi.mock("./recovery-storage.js", async importOriginal => ({ ...await importOriginal<typeof import("./recovery-storage.js")>(), writeStoredRecovery: mocks.write }));
import App from "./App.js";
const deploymentId = "ab".repeat(32);
const deploymentPassword = "Synthetic deployment copy password";
const fillDeploymentPassword = () => {
  fireEvent.change(screen.getByLabelText("Deployment backup password"), { target: { value: deploymentPassword } });
  fireEvent.change(screen.getByLabelText("Confirm deployment backup password"), { target: { value: deploymentPassword } });
};
const checkpoint = () => mocks.connect.mock.calls[0]![1](deploymentId);


describe("browser network workflow with mocked wallet and finalized API results", () => {
  beforeEach(() => {
    mocks.connect.mockReset().mockResolvedValue({});
    mocks.deploy.mockReset();
    mocks.join.mockReset();
    mocks.write.mockReset().mockImplementation(async (id, label, encrypted, revision) => ({ id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() }));
    const store = new Map<string, string>();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        store.set(url, String(init.body));
        return new Response(JSON.stringify({ stored: true }), { status: 201 });
      }
      return new Response(store.get(url), { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); cleanup(); vi.unstubAllGlobals(); });

  it.each(["failure", "timeout"])("retains uncertain deployment after %s through backup and wallet-free restore", async outcome => {
    const user = userEvent.setup();
    let fail!: (error: Error) => void, finish!: (value: unknown) => void;
    mocks.deploy.mockImplementation(async () => { await checkpoint(); return new Promise((resolve, reject) => { fail = reject; finish = resolve; }); });
    const leaving = () => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    const view = render(<App />);
    expect(leaving()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    await user.click(await screen.findByRole("button", { name: "Set up program" }));
    const timers = vi.spyOn(globalThis, "setTimeout");
    fillDeploymentPassword();
    await user.click(screen.getByRole("button", { name: "Create program" }));
    await waitFor(() => expect(fail).toBeTypeOf("function"), { timeout: 5000 });
    expect(mocks.deploy).toHaveBeenCalledOnce();
    const expire = timers.mock.calls.find(([, duration]) => duration === DEMO_TRANSITION_TIMEOUT_MS)![0] as () => void;
    timers.mockRestore();
    expect(leaving()).toBe(true);
    if (outcome === "timeout") {
      await act(async () => expire());
      await act(async () => finish({ api: { contractAddress: "ab".repeat(32) }, evidence: {} }));
    } else await act(async () => fail(new Error("Deployment interrupted")));
    expect(screen.getByRole("heading", { name: "Deployment outcome needs investigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create program" })).not.toBeInTheDocument();
    expect(mocks.deploy).toHaveBeenCalledOnce();
    expect(leaving()).toBe(true);
    let downloaded: Blob | undefined;
    vi.stubGlobal("URL", class extends URL { static override createObjectURL = (blob: Blob) => { downloaded = blob; return "blob:deployment"; }; static override revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const password = "Preserve interrupted deployment";
    let serialized: string;
    try {
      await user.click(screen.getByRole("button", { name: "Private recovery" }));
      expect(screen.getByRole("button", { name: "Restore encrypted backup" })).toBeDisabled();
      await user.type(screen.getByLabelText("Backup password", { exact: true }), password);
      await user.type(screen.getByLabelText("Confirm backup password"), password);
      await user.click(screen.getByRole("button", { name: "Download encrypted backup" }));
      await screen.findByText(/Encrypted backup download started/);
      serialized = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(downloaded!); });
    } finally { click.mockRestore(); }
    const checked = await decryptRecovery(serialized, password);
    expect(checked.snapshot.version).toBe(7);
    expect(checked.snapshot.deploymentTransactionId).toBe(deploymentId);
    const stored = await decryptRecovery(mocks.write.mock.calls[1]![2], deploymentPassword);
    expect(stored.snapshot).toEqual(checked.snapshot);
    expect(checked.snapshot.deploymentAttempt?.startedAt).toMatch(/Z$/);
    expect(checked.snapshot.contractAddress).toBeNull();
    const [, privateState, constructor] = mocks.deploy.mock.calls[0]!;
    expect(hexToBytes(checked.snapshot.vendorSecret)).toEqual(privateState.actorSecret);
    expect(await programConstructor(hexToBytes(checked.snapshot.programId), checked.snapshot.policy)).toEqual(constructor);
    view.unmount(); expect(leaving()).toBe(false);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Private recovery" }));
    const file = new File([serialized], "deployment.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serialized });
    await user.upload(screen.getByLabelText("Recovery file"), file);
    await user.type(screen.getByLabelText("Recovery password"), password);
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    await screen.findByRole("heading", { name: "Deployment outcome needs investigation" }, { timeout: 5000 });
    expect(screen.queryByRole("button", { name: "Create program" })).not.toBeInTheDocument();
    expect(mocks.connect).toHaveBeenCalledOnce(); expect(mocks.join).not.toHaveBeenCalled(); expect(mocks.deploy).toHaveBeenCalledOnce();
    expect(leaving()).toBe(true);
  }, 20_000);

  it.each(["failure", "timeout"])("keeps transition %s uncertainty across encrypted export and ledger-checked restore", async (outcome) => {
    const user = userEvent.setup();
    const { snapshot, sealed } = await recoveryFixture();
    const source = { ...snapshot, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32) };
    const password = "Preserve uncertain demo transition";
    const programId = hexToBytes(snapshot.programId), reportId = hexToBytes(snapshot.report!.id);
    const record = { commitment: reportId, ciphertextDigest: sealed.ciphertextDigest, researcherKey: pureCircuits.deriveResearcherKey(programId, reportId, hexToBytes(snapshot.researcherSecret)), status: 0, severity: 0n, patchCommitment: new Uint8Array(32), retestCommitment: new Uint8Array(32), payoutReceipt: new Uint8Array(32) };
    const ledger = { ...await programConstructor(programId, snapshot.policy), ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member: () => true, lookup: () => ({ ...record, submissionReceipt: submissionReceipt(reportId, record.ciphertextDigest, record.researcherKey) }) } };
    const api = { contractAddress: source.contractAddress, readPublicState: vi.fn().mockResolvedValue({ ledger }), usePrivateState: vi.fn().mockResolvedValue(undefined), beginTriage: vi.fn().mockRejectedValue(new Error("Finality connection lost")) };
    let confirmLate!: (value: unknown) => void;
    if (outcome === "timeout") api.beginTriage.mockImplementation(() => new Promise((resolve) => { confirmLate = resolve; }));
    mocks.join.mockResolvedValue(api);
    const restore = async (serialized: string) => {
      await user.click(screen.getByRole("button", { name: "Private recovery" }));
      const file = new File([serialized], "recovery.json", { type: "application/json" });
      Object.defineProperty(file, "text", { value: async () => serialized });
      await user.upload(screen.getByLabelText("Recovery file"), file);
      await user.type(screen.getByLabelText("Recovery password"), password);
      fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
      await screen.findByText(/Recovered report.*ledger checked/, {}, { timeout: 5000 });
    };
    render(<App />);
    await restore(await encryptRecovery(source, password));
    await user.click(screen.getByRole("button", { name: /Continue as vendor/ }));
    const triage = await screen.findByRole("button", { name: "Begin authorized triage" });
    if (outcome === "timeout") {
      vi.useFakeTimers();
      fireEvent.click(triage);
      await act(async () => { await vi.advanceTimersByTimeAsync(DEMO_TRANSITION_TIMEOUT_MS); });
      vi.useRealTimers();
      expect(screen.getAllByText(/Stopped waiting for this transition/).length).toBeGreaterThan(0);
      await act(async () => { confirmLate({ circuit: "beginTriage" }); });
      expect(screen.getAllByText(/Stopped waiting for this transition/).length).toBeGreaterThan(0);
    } else await user.click(triage);
    await screen.findByText("Transaction outcome unknown: beginTriage");
    expect(screen.getByRole("button", { name: "Begin authorized triage" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Begin authorized triage" }));
    expect(api.beginTriage).toHaveBeenCalledOnce();
    expect(api.usePrivateState).toHaveBeenCalledOnce();
    let downloaded: Blob | undefined;
    vi.stubGlobal("URL", class extends URL { static override createObjectURL = (blob: Blob) => { downloaded = blob; return "blob:uncertain-demo"; }; static override revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await user.click(screen.getByRole("button", { name: "Private recovery" }));
      await user.type(screen.getByLabelText("Backup password", { exact: true }), password);
      await user.type(screen.getByLabelText("Confirm backup password"), password);
      await user.click(screen.getByRole("button", { name: "Download encrypted backup" }));
      await screen.findByText(/Encrypted backup download started/);
      const serialized = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(downloaded!); });
      const checked = await decryptRecovery(serialized, password);
      expect(checked.snapshot.version).toBe(5);
      expect(checked.snapshot.programDraft).toBeDefined();
      expect(checked.snapshot.uncertainTransition).toBe("beginTriage");
      cleanup(); render(<App />);
      await restore(serialized);
      expect(screen.getByRole("button", { name: "Seal another" })).toBeDisabled();
      expect(screen.getByText("Transaction outcome unknown: beginTriage")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Continue as vendor/ }));
      expect(await screen.findByRole("button", { name: "Begin authorized triage" })).toBeDisabled();
      await user.click(await screen.findByRole("button", { name: "Begin authorized triage" }));
      expect(api.beginTriage).toHaveBeenCalledOnce();
      expect(api.usePrivateState).toHaveBeenCalledOnce();
    } finally { click.mockRestore(); }
  }, 20_000);

  it.each([false, true])("preserves a fresh session when a prepared backup already exists on the ledger (started=%s)", async (submissionStarted) => {
    const user = userEvent.setup();
    const { snapshot } = await recoveryFixture();
    const source = { ...snapshot, version: 3 as const, attachmentDraft: emptyAttachmentDraft, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32), report: null, history: [], pendingReport: { report: snapshot.report!, submissionStarted } };
    const programId = hexToBytes(snapshot.programId);
    const ledger = { ...await programConstructor(programId, snapshot.policy), ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member: vi.fn(() => true) } };
    const api = { contractAddress: source.contractAddress, readPublicState: vi.fn().mockResolvedValue({ ledger }), submitReport: vi.fn(), usePrivateState: vi.fn() };
    mocks.join.mockResolvedValue(api);
    const password = "Prepared report recovery password";
    const serialized = await encryptRecovery(source, password);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Private recovery" }));
    const file = new File([serialized], "prepared.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serialized });
    await user.upload(screen.getByLabelText("Recovery file"), file);
    await user.type(screen.getByLabelText("Recovery password"), password);
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    expect(await screen.findByText(/The prepared report already exists/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore encrypted backup" })).toBeEnabled();
    expect(screen.queryByText("Your report is sealed")).not.toBeInTheDocument();
    expect(screen.queryByText(/Recovered report/)).not.toBeInTheDocument();
    expect(api.submitReport).not.toHaveBeenCalled();
    expect(api.usePrivateState).not.toHaveBeenCalled();
    expect(mocks.deploy).not.toHaveBeenCalled();
  }, 15_000);

  it("restores network authority only after verification and uses ledger progress newer than the backup", async () => {
    const user = userEvent.setup();
    const { snapshot, sealed } = await recoveryFixture();
    const networkSnapshot = { ...snapshot, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32) };
    const serialized = await encryptRecovery(networkSnapshot, "network recovery test password");
    const programId = hexToBytes(snapshot.programId);
    const reportId = hexToBytes(snapshot.report!.id);
    const record = { commitment: reportId, ciphertextDigest: sealed.ciphertextDigest, researcherKey: pureCircuits.deriveResearcherKey(programId, reportId, hexToBytes(snapshot.researcherSecret)), status: 4, severity: 4n, patchCommitment: new Uint8Array(32).fill(7), retestCommitment: new Uint8Array(32), payoutReceipt: new Uint8Array(32) };
    const ledger = { ...await programConstructor(programId, snapshot.policy), ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member: () => true, lookup: () => ({ ...record, submissionReceipt: submissionReceipt(reportId, record.ciphertextDigest, record.researcherKey) }) } };
    const api = {
      contractAddress: networkSnapshot.contractAddress,
      readPublicState: vi.fn().mockResolvedValueOnce({ ledger: { ...ledger, ownerKey: new Uint8Array(32) } }).mockResolvedValue({ ledger }),
      usePrivateState: vi.fn().mockResolvedValue(undefined),
      submitRetest: vi.fn().mockImplementation(async () => { record.status = 5; record.retestCommitment.fill(8); return { circuit: "submitRetest", txId: "restored-retest", blockHeight: "901" }; }),
    };
    mocks.join.mockResolvedValue(api);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Private recovery" }));
    const file = new File([serialized], "recovery.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serialized });
    await user.upload(screen.getByLabelText("Recovery file"), file);
    await user.type(screen.getByLabelText("Recovery password"), "network recovery test password");
    expect((screen.getByLabelText("Recovery file") as HTMLInputElement).files).toHaveLength(1);
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    expect(await screen.findByText("Recovery does not match the ledger: owner authority", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("Your report is sealed")).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    await screen.findByText("Recovered report · ledger checked");
    let downloaded: Blob | undefined;
    const createUrl = vi.fn((blob: Blob) => { downloaded = blob; return "blob:public-receipt"; });
    vi.stubGlobal("URL", class extends URL { static override createObjectURL = createUrl; static override revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await user.click(screen.getByRole("button", { name: "Download public receipt" }));
      const serializedReceipt = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
        reader.readAsText(downloaded!);
      });
      expect(JSON.parse(serializedReceipt)).toEqual({ kind: "vulnseal-public-receipt", version: 1, network: "preprod", contractAddress: networkSnapshot.contractAddress, reportId: snapshot.report!.id, ciphertextDigest: Array.from(sealed.ciphertextDigest, (byte) => byte.toString(16).padStart(2, "0")).join("") });
      expect(click).toHaveBeenCalledOnce();
    } finally { click.mockRestore(); }
    expect(mocks.join.mock.calls[1]![1]).toBe(networkSnapshot.contractAddress);
    expect(mocks.connect).toHaveBeenCalledWith("preprod");
    await user.click(screen.getAllByRole("button", { name: /Resolve/ })[0]!);
    await screen.findByRole("heading", { name: "Submit private retest evidence" });
    await user.click(screen.getByRole("button", { name: /Pass retest/ }));
    await screen.findByRole("button", { name: "Generate payout authorization" });
    expect(api.usePrivateState.mock.calls[0]![0].actorSecret).toEqual(hexToBytes(snapshot.researcherSecret));
    expect(api.usePrivateState.mock.calls[0]![0].report.salt).toEqual(hexToBytes(snapshot.report!.salt));
    expect(screen.getByText("Tier 4 · P1")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Verify/ })[0]!);
    expect(screen.getByText("Ledger state")).toBeInTheDocument();
    expect(screen.getByText("restored-retest")).toBeInTheDocument();
    expect(screen.queryByText("Finalized at block 202")).not.toBeInTheDocument();
  });

  it("requires deployment after wallet connection and does not upload a phantom network report", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    expect(await screen.findByText("Network setup required")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/ }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
    expect(await screen.findByText("Program not deployed")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Your report is sealed")).not.toBeInTheDocument();
  });

  it("keeps an existing local report local when connection is requested", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/ }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
    await screen.findByText("Your report is sealed");
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    expect(screen.getByText("Local report remains local")).toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(screen.getByText(/Guided local receipt/)).toBeInTheDocument();
  });

  it.each(["failure", "preparation timeout", "submission timeout"])("blocks initial report retry and replacement after %s", async (outcome) => {
    const user = userEvent.setup();
    const api = { contractAddress: "ab".repeat(32), usePrivateState: vi.fn().mockResolvedValue(undefined), submitReport: vi.fn().mockRejectedValue(new Error("Wallet response interrupted")) };
    let finishLate!: (value: unknown) => void;
    if (outcome === "preparation timeout") api.usePrivateState.mockImplementation(() => new Promise((resolve) => { finishLate = resolve; }));
    if (outcome === "submission timeout") api.submitReport.mockImplementation(() => new Promise((resolve) => { finishLate = resolve; }));
    const expectedSubmissions = outcome === "preparation timeout" ? 0 : 1;
    mocks.deploy.mockImplementation(async () => { await checkpoint(); return { api, evidence: { circuit: "constructor", txId: deploymentId, blockHeight: "100" } }; });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    await user.click(await screen.findByRole("button", { name: "Set up program" }));
    fillDeploymentPassword();
    await user.click(screen.getByRole("button", { name: "Create program" }));
    await screen.findByRole("heading", { name: "Acme Security Program" }, { timeout: 5000 });
    await user.click(screen.getAllByRole("button", { name: /Submit/ })[0]!);
    await user.click(screen.getByRole("checkbox"));
    if (outcome === "failure") {
      await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
      await screen.findByText("Wallet response interrupted");
    } else {
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
      await vi.waitFor(() => expect(api.usePrivateState).toHaveBeenCalledOnce());
      if (outcome === "submission timeout") await vi.waitFor(() => expect(api.submitReport).toHaveBeenCalledOnce());
      await act(async () => { await vi.advanceTimersByTimeAsync(DEMO_TRANSITION_TIMEOUT_MS); });
      vi.useRealTimers();
      expect(screen.getAllByText(/Stopped waiting for this transition/).length).toBeGreaterThan(0);
      await act(async () => { finishLate({ circuit: "submitReport", txId: "late-submit", blockHeight: "101" }); });
      expect(screen.queryByText("Your report is sealed")).not.toBeInTheDocument();
      expect(screen.queryByText("late-submit")).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Retry saved report upload" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review report" }));
    expect(screen.getByText(/Its outcome needs reconciliation/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Report title")).not.toBeInTheDocument();
    expect(api.submitReport).toHaveBeenCalledTimes(expectedSubmissions);
    let downloaded: Blob | undefined;
    vi.stubGlobal("URL", class extends URL { static override createObjectURL = (blob: Blob) => { downloaded = blob; return "blob:pending-backup"; }; static override revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await user.click(screen.getByRole("button", { name: "Private recovery" }));
      await user.type(screen.getByLabelText("Backup password", { exact: true }), "Retain uncertain submission backup");
      await user.type(screen.getByLabelText("Confirm backup password"), "Retain uncertain submission backup");
      await user.click(screen.getByRole("button", { name: "Download encrypted backup" }));
      await screen.findByText(/Encrypted backup download started/);
      const serialized = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(downloaded!); });
      const { snapshot } = await decryptRecovery(serialized, "Retain uncertain submission backup");
      expect(snapshot.pendingReport?.submissionStarted).toBe(true);
      const uploaded = vi.mocked(fetch).mock.calls.find((call) => call[1]?.method === "PUT");
      expect(snapshot.pendingReport?.report.envelope).toBe(uploaded?.[1]?.body);
      expect(snapshot.pendingReport?.report.key).toHaveLength(64);
      expect(snapshot.pendingReport?.report.salt).toHaveLength(64);
      expect(snapshot.report).toBeNull();
      expect(snapshot.history).toEqual([]);
      const programId = hexToBytes(snapshot.programId);
      mocks.join.mockResolvedValue({ ...api, readPublicState: vi.fn().mockResolvedValue({ ledger: { ...await programConstructor(programId, snapshot.policy), ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member: () => false } } }) });
      cleanup(); render(<App />);
      await user.click(screen.getByRole("button", { name: "Private recovery" }));
      const file = new File([serialized], "uncertain.json", { type: "application/json" });
      Object.defineProperty(file, "text", { value: async () => serialized });
      await user.upload(screen.getByLabelText("Recovery file"), file);
      await user.type(screen.getByLabelText("Recovery password", { exact: true }), "Retain uncertain submission backup");
      fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
      await screen.findByRole("heading", { name: "Keep the prepared report" }, { timeout: 5000 });
      expect(screen.getByText(/Its outcome needs reconciliation/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry saved report upload" })).not.toBeInTheDocument();
      expect(api.submitReport).toHaveBeenCalledTimes(expectedSubmissions);
      expect(vi.mocked(fetch).mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(1);
    } finally { click.mockRestore(); }
  }, 15_000);

  it("uses form policies, random role secrets, selected severity and rationale, and exact transaction evidence", async () => {
    const user = userEvent.setup();
    const api = {
      usePrivateState: vi.fn().mockResolvedValue(undefined),
      submitReport: vi.fn().mockResolvedValue({ circuit: "submitReport", txId: "sealed-tx", blockHeight: "202" }),
      beginTriage: vi.fn().mockResolvedValue({ circuit: "beginTriage", txId: "triage-tx", blockHeight: "211" }),
      acceptReport: vi.fn().mockResolvedValue({ circuit: "acceptReport", txId: "accept-tx", blockHeight: "215" }),
      anchorPatch: vi.fn(),
      readPublicState: vi.fn().mockRejectedValueOnce(new Error("Indexer temporarily unavailable")),
    };
    mocks.deploy.mockImplementation(async () => { await checkpoint(); return { api, evidence: { circuit: "constructor", txId: deploymentId, blockHeight: "100" } }; });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    await user.click(await screen.findByRole("button", { name: "Set up program" }));
    await user.clear(screen.getByLabelText("Program name"));
    await user.type(screen.getByLabelText("Program name"), "Independent Security");
    await user.selectOptions(screen.getByLabelText("First response target"), "2");
    await user.selectOptions(screen.getByLabelText("Coordinated disclosure window"), "30");
    fillDeploymentPassword();
    await user.click(screen.getByRole("button", { name: "Create program" }));
    await screen.findByRole("heading", { name: "Independent Security" }, { timeout: 5000 });
    const [, ownerState, constructor] = mocks.deploy.mock.calls[0]!;
    expect(constructor.responseDays).toBe(2n);
    expect(constructor.disclosureDelayDays).toBe(30n);
    expect(constructor.responsePolicyDigest).toEqual(await sha256(utf8(JSON.stringify({ responseDays: 2 }))));
    expect(ownerState.actorSecret).toHaveLength(32);
    expect(new Set(ownerState.actorSecret).size).toBeGreaterThan(1);
    await user.click(screen.getAllByRole("button", { name: /Submit/ })[0]!);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
    await screen.findByText("Your report is sealed");
    const researcher = api.usePrivateState.mock.calls[0]![0];
    expect(researcher.actorSecret).not.toEqual(ownerState.actorSecret);
    await user.click(screen.getByRole("button", { name: /Continue as vendor/ }));
    await user.click(await screen.findByRole("button", { name: "Begin authorized triage" }));
    await user.selectOptions(screen.getByLabelText("Public severity tier"), "1");
    await user.clear(screen.getByLabelText("Private rationale"));
    await user.type(screen.getByLabelText("Private rationale"), "Reproduced with minimal impact");
    await user.click(screen.getByRole("button", { name: "Accept as P4" }));
    await screen.findByRole("button", { name: "Continue to remediation" });
    expect(api.acceptReport.mock.calls[0]![1]).toBe(1n);
    expect(api.acceptReport.mock.calls[0]![2]).toEqual(await sha256(utf8("Reproduced with minimal impact")));
    await user.click(screen.getAllByRole("button", { name: /Verify/ })[0]!);
    const submitted = screen.getByText("sealed-tx").closest(".audit-event")!;
    expect(within(submitted as HTMLElement).getByText("Finalized at block 202")).toBeInTheDocument();
    expect(screen.queryByText(deploymentId, { selector: ".audit-transaction" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /No patch or passing retest is recorded yet/ })).toBeInTheDocument();
    expect(screen.queryByText("Reproduced with minimal impact")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Resolve/ })[0]!);
    let finishPatch!: (value: unknown) => void;
    api.anchorPatch.mockImplementation(() => new Promise((resolve) => { finishPatch = resolve; }));
    const anchor = screen.getByRole("button", { name: "Anchor patch commitment" });
    await user.dblClick(anchor);
    expect(api.anchorPatch).toHaveBeenCalledTimes(1);
    expect(anchor).toBeDisabled();
    await act(async () => { finishPatch({ circuit: "anchorPatch", txId: "patch-tx", blockHeight: "230" }); });
    const refresh = await screen.findByRole("button", { name: "Refresh public commitments" });
    expect(screen.getByRole("button", { name: /Pass retest/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Fail retest/ })).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: /Verify/ })[0]!);
    expect(screen.getByText("patch-tx")).toBeInTheDocument();
    api.readPublicState.mockResolvedValue({ ledger: { reports: { lookup: () => ({ status: 4, patchCommitment: new Uint8Array(32).fill(9), retestCommitment: new Uint8Array(32), payoutReceipt: new Uint8Array(32) }) } } });
    await user.click(refresh);
    expect(api.anchorPatch).toHaveBeenCalledTimes(1);
    expect(api.readPublicState).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Refresh public commitments" })).not.toBeInTheDocument();
    expect(screen.getAllByText("patch-tx")).toHaveLength(1);
    await user.click(screen.getAllByRole("button", { name: /Resolve/ })[0]!);
    expect(screen.getByRole("button", { name: /Pass retest/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Fail retest/ })).toBeEnabled();
  }, 15_000);
});
