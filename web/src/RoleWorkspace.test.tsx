// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptRoleVault, encryptRoleVault } from "./role-recovery.js";
import { recoveryDraft, recoveryFixture } from "./test/recovery-fixture.js";
import { RoleAutosave } from "./role-autosave.js";
import { writeStoredRole } from "./role-storage.js";
import { SUBMISSION_CONFIRMATION_TIMEOUT_MS } from "./submission-wait.js";
const mocks = vi.hoisted(() => ({ join: vi.fn() }));
vi.mock("./role-network.js", () => ({ joinRoleVault: mocks.join }));
vi.mock("./role-storage.js", () => ({
  listStoredRoles: vi.fn(async () => []),
  readStoredRole: vi.fn(), deleteStoredRole: vi.fn(),
  writeStoredRole: vi.fn(async (id, label, encrypted, revision) => ({ id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() })),
}));
import { RoleWorkspace } from "./RoleWorkspace.js";
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const enableJournal = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Browser copy password"), "Workspace journal password");
  await user.type(screen.getByLabelText("Confirm browser copy password"), "Workspace journal password");
  await user.click(screen.getByRole("button", { name: "Enable encrypted browser autosave" }));
  await screen.findByRole("button", { name: "Stop browser autosave" });
};

const roleTransactionId = "cd".repeat(32);
const restore = async (role: "researcher" | "vendor", status: number, journalCount = 0) => {
  const { snapshot } = await recoveryFixture();
  const vault = { version: 1 as const, role, network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: role === "vendor" ? snapshot.vendorSecret : snapshot.researcherSecret, reports: [{ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] };
  const record = { status, patchCommitment: new Uint8Array(32).fill(7) };
  const publicState = { ledger: { reports: { member: () => true, lookup: () => record } } };
  const session = { execute: vi.fn(async (_command: unknown) => { await mocks.join.mock.calls.at(-1)![1](roleTransactionId); record.status = role === "researcher" ? 5 : 1; return { circuit: role === "researcher" ? "submitRetest" : "beginTriage", txId: roleTransactionId, blockHeight: "900" }; }), readPublicState: vi.fn().mockResolvedValue(publicState) };
  mocks.join.mockResolvedValue({ session, snapshot: publicState });
  const serialized = await encryptRoleVault(journalCount ? { ...vault, version: 2, submissionAttempts: Array.from({ length: journalCount }, (_, i) => ({ transactionId: (i + 1).toString(16).padStart(64, "0"), recordedAt: "2026-09-09T00:00:00.000Z" })) } : vault, "Role workspace test password");
  render(<RoleWorkspace />);
  const file = new File([serialized], "role.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => serialized });
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText("Single-role backup file"), file);
  await user.type(screen.getByLabelText("Role restore password"), "Role workspace test password");
  fireEvent.submit(screen.getByRole("button", { name: "Restore role workspace" }).closest("form")!);
  await screen.findByRole("heading", { name: `${role === "researcher" ? "Researcher" : "Vendor"} workspace` });
  await enableJournal(user);
  return { user, session, vault, publicState };
};

describe("independent role workspace", () => {
  it.each(["resolve", "reject"])("keeps the journal accessible after confirmation timeout and ignores late %s", async (outcome) => {
    const { user, session } = await restore("vendor", 0);
    const checkpoint = mocks.join.mock.calls.at(-1)![1] as (id: string) => Promise<void>;
    let expire!: () => void;
    const realTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
      if (delay === SUBMISSION_CONFIRMATION_TIMEOUT_MS) expire = callback;
      return realTimeout(callback, delay, ...args);
    }) as typeof setTimeout);
    let finish!: () => void, fail!: (error: Error) => void;
    session.execute.mockImplementationOnce(async () => {
      await checkpoint(roleTransactionId);
      await new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
      return { circuit: "beginTriage", txId: roleTransactionId, blockHeight: "900" };
    });
    await user.click(screen.getByRole("button", { name: "Begin triage" }));
    await waitFor(() => expect(expire).toBeTypeOf("function"));
    const ciphertext = vi.mocked(writeStoredRole).mock.calls.at(-1)![2];
    const saved = await decryptRoleVault(ciphertext, "Workspace journal password");
    expect(saved.submissionAttempts![0]!.transactionId).toBe(roleTransactionId);
    await act(async () => { expire(); });
    expect(screen.getByRole("alert")).toHaveTextContent("Stopped waiting for confirmation");
    expect(screen.getByRole("button", { name: "Save role backup" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Begin triage" })).not.toBeInTheDocument();
    const writes = vi.mocked(writeStoredRole).mock.calls.length;
    await act(async () => { if (outcome === "resolve") finish(); else fail(new Error("Late SDK failure")); });
    expect(screen.getByRole("alert")).toHaveTextContent("Stopped waiting for confirmation");
    expect(screen.queryByText(/Saved SDK finalization: block 900/)).not.toBeInTheDocument();
    expect(writeStoredRole).toHaveBeenCalledTimes(writes);
    expect(session.readPublicState).not.toHaveBeenCalled();
    expect(session.execute).toHaveBeenCalledOnce();
    await expect(checkpoint("ef".repeat(32))).rejects.toThrow("Submission intent is missing");
  }, 15_000);
  it("rejects a full journal before starting a contract call while retaining recovery access", async () => {
    const { user, session } = await restore("vendor", 0, 200);
    await user.click(screen.getByRole("button", { name: "Begin triage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("journal is full (200 attempts)");
    expect(session.execute).not.toHaveBeenCalled();
    expect(session.readPublicState).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save role backup" }));
    expect(screen.getByText("Submission journal: 200 of 200 attempts retained.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download single-role backup" })).toBeEnabled();
    expect(screen.getAllByText(/Operation and report were not recorded/)).toHaveLength(10);
    expect(screen.getByText(/Page 1 of 20/)).toBeInTheDocument();
  }, 15_000);
  it.each([{ passed: true, saveFails: false }, { passed: false, saveFails: false }, { passed: false, saveFails: true }])("waits for encrypted retest context before continuing: $passed / storage failure $saveFails", async ({ passed, saveFails }) => {
    const { user, session, vault } = await restore("researcher", 4);
    const text = "  Retest evidence\nExact whitespace  ";
    fireEvent.change(screen.getByLabelText("Private decision, patch reference or retest notes"), { target: { value: text } });
    const button = screen.getByRole("button", { name: passed ? "Pass retest" : "Fail retest" });
    await waitFor(() => expect(button).toBeEnabled());
    const checkpoint = mocks.join.mock.calls.at(-1)![1] as (id: string) => Promise<void>;
    const continueSubmission = vi.fn();
    session.execute.mockImplementationOnce(async (command) => {
      expect(command).toMatchObject({ kind: "submitRetest", passed });
      await checkpoint(roleTransactionId);
      continueSubmission();
      throw new Error("Stopped after durable retest checkpoint");
    });
    let release!: () => void;
    let attemptedCiphertext: string | undefined;
    vi.mocked(writeStoredRole).mockImplementationOnce((id, label, encrypted, revision) => {
      attemptedCiphertext = encrypted;
      return new Promise((resolve, reject) => { release = () => saveFails ? reject(new Error("Retest storage unavailable")) : resolve({ id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() }); });
    });
    await user.click(button);
    await waitFor(() => expect(attemptedCiphertext).toBeDefined());
    const checkpointVault = await decryptRoleVault(attemptedCiphertext!, "Workspace journal password");
    expect(checkpointVault.version).toBe(10);
    expect(checkpointVault.submissionAttempts![0]!.retestPatchCommitment).toBe("07".repeat(32));
    expect(checkpointVault.submissionAttempts![0]).toMatchObject({ transactionId: roleTransactionId, intent: { circuit: "submitRetest", reportId: vault.reports[0]!.reportId }, notes: { reportId: vault.reports[0]!.reportId, text, tier: "3" }, retestPassed: passed, finalization: null });
    expect(continueSubmission).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Private decision, patch reference or retest notes")).toBeDisabled();
    expect(screen.queryByRole("button", { name: passed ? "Pass retest" : "Fail retest" })).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole("alert")).toHaveTextContent(saveFails ? "Retest storage unavailable" : "Stopped after durable retest checkpoint");
    expect(continueSubmission).toHaveBeenCalledTimes(saveFails ? 0 : 1);
    expect(session.readPublicState).not.toHaveBeenCalled();
    expect(session.execute).toHaveBeenCalledOnce();
    await expect(checkpoint("ef".repeat(32))).rejects.toThrow(saveFails ? "Enable encrypted browser autosave" : "Submission intent is missing");
  }, 15_000);
  it.each(["stop", "unmount"])("does not upload later saved reports after %s", async (mode) => {
    const { snapshot } = await recoveryFixture();
    const second = (await recoveryFixture({ ...recoveryDraft, title: "Another private report" })).snapshot.report!;
    const reports = [snapshot.report!, second].map((report) => ({ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: report.id, envelope: report.envelope, key: report.key, salt: report.salt }));
    const password = "Offline batch test password";
    const serialized = await encryptRoleVault({ version: 1, role: "researcher", network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: snapshot.researcherSecret, reports }, password);
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<RoleWorkspace />), user = userEvent.setup();
    await user.click(screen.getByLabelText("Restore backups without connecting Lace"));
    const file = new File([serialized], "role.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serialized });
    await user.upload(screen.getByLabelText("Single-role backup file"), file);
    await user.type(screen.getByLabelText("Role restore password"), password);
    fireEvent.submit(screen.getByRole("button", { name: "Restore role workspace" }).closest("form")!);
    await screen.findByRole("heading", { name: "Researcher workspace" });
    await user.click(screen.getByRole("button", { name: "Upload all saved ciphertext (2)" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "PUT", body: reports[0]!.envelope });
    if (mode === "unmount") view.unmount();
    else {
      await user.click(screen.getByRole("button", { name: "Stop remaining uploads" }));
      expect(screen.getByText(/Stopping after the current report finishes/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload all saved ciphertext (2)" })).toBeDisabled();
    }
    await act(async () => { finish(new Response(null, { status: 201 })); });
    if (mode === "stop") {
      await screen.findByText(/1 of 2 saved reports acknowledged.*Remaining uploads stopped/);
      expect(screen.getByRole("button", { name: "Upload all saved ciphertext (2)" })).toBeEnabled();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.join).not.toHaveBeenCalled();
  }, 15_000);
  it("keeps a finalized report receipt exportable when its encrypted checkpoint fails and skips follow-up reads", async () => {
    const { user, session } = await restore("vendor", 0);
    vi.mocked(writeStoredRole).mockImplementationOnce(async (id, label, encrypted, revision) => ({ id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() }));
    vi.mocked(writeStoredRole).mockRejectedValueOnce(new Error("Receipt storage unavailable"));
    await user.click(screen.getByRole("button", { name: "Begin triage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transaction finalized, but its receipt could not be saved");
    expect(screen.getByText(/Saved SDK finalization: block 900/)).toBeInTheDocument();
    expect(session.readPublicState).not.toHaveBeenCalled();
    expect(session.execute).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download single-role backup" })).toBeEnabled();
    const attempted = await decryptRoleVault(vi.mocked(writeStoredRole).mock.calls.at(-1)![2], "Workspace journal password");
    expect(attempted.version).toBe(8);
    expect(attempted.submissionAttempts![0]!.finalization?.blockHeight).toBe("900");
  }, 15_000);
  it("persists operation/report intent before wallet failure and clears the active callback context afterwards", async () => {
    const { user, session, vault } = await restore("vendor", 0);
    const checkpoint = mocks.join.mock.calls.at(-1)![1] as (id: string) => Promise<void>;
    const transactionId = "cd".repeat(32);
    session.execute.mockImplementationOnce(async () => {
      await checkpoint(transactionId);
      const encrypted = vi.mocked(writeStoredRole).mock.calls.at(-1)![2];
      const saved = await decryptRoleVault(encrypted, "Workspace journal password");
      expect(saved.submissionAttempts![0]!.intent).toEqual({ circuit: "beginTriage", reportId: vault.reports[0]!.reportId });
      throw new Error("Wallet connection interrupted after checkpoint");
    });
    await user.click(screen.getByRole("button", { name: "Begin triage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wallet connection interrupted after checkpoint");
    expect(screen.getByText(/Recorded intent: beginTriage/)).toHaveTextContent(vault.reports[0]!.reportId);
    await expect(checkpoint("ef".repeat(32))).rejects.toThrow("Submission intent is missing");
  });
  it("stops submission when the contextual encrypted checkpoint cannot be written", async () => {
    const { user, session } = await restore("vendor", 0);
    const checkpoint = mocks.join.mock.calls.at(-1)![1] as (id: string) => Promise<void>;
    const broadcast = vi.fn();
    session.execute.mockImplementationOnce(async () => {
      await checkpoint("cd".repeat(32));
      broadcast();
      throw new Error("Unexpected broadcast");
    });
    vi.mocked(writeStoredRole).mockRejectedValueOnce(new Error("Storage quota exceeded"));
    await user.click(screen.getByRole("button", { name: "Begin triage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage quota exceeded");
    expect(broadcast).not.toHaveBeenCalled();
    expect(screen.queryByText(/Recorded intent: beginTriage/)).not.toBeInTheDocument();
  });
  const leavingIsBlocked = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  it("warns before leaving an unsaved identity and removes the guard after encrypted persistence", async () => {
    const user = userEvent.setup(); const view = render(<RoleWorkspace />);
    expect(leavingIsBlocked()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
    expect(leavingIsBlocked()).toBe(true);
    await enableJournal(user);
    expect(leavingIsBlocked()).toBe(false);
    view.unmount();
    expect(leavingIsBlocked()).toBe(false);
  });
  it("requires saved ownership before locking and starts a fresh password-gated workspace", async () => {
    const stopped = vi.spyOn(RoleAutosave.prototype, "stop");
    const user = userEvent.setup(); render(<RoleWorkspace />);
    await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
    expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toBeDisabled();
    await enableJournal(user);
    await user.click(screen.getByRole("button", { name: "Lock and switch workspace" }));
    expect(screen.getByRole("heading", { name: "Work with your own authority" })).toBeInTheDocument();
    expect(screen.getByText(/Workspace locked/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Vendor workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop browser autosave" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Browser unlock password")).toHaveValue("");
    expect(screen.getByLabelText("Role restore password")).toHaveValue("");
    expect(stopped).toHaveBeenCalled();
    expect(leavingIsBlocked()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
    expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toBeDisabled();
  });
  it("requires retention of the separate receiving-key backup before locking loaded keys", async () => {
    vi.stubGlobal("URL", class extends URL { static override createObjectURL = () => "blob:recipient-backup"; static override revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup(); render(<RoleWorkspace />);
    await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
    await enableJournal(user);
    await user.click(screen.getByRole("button", { name: "Disclosure exchange" }));
    fireEvent.change(screen.getByLabelText("Recipient backup password"), { target: { value: "Retain this receiving key password" } });
    fireEvent.change(screen.getByLabelText("Confirm recipient backup password"), { target: { value: "Retain this receiving key password" } });
    await user.click(screen.getByRole("button", { name: "Create receiving key and save backup" }));
    // Real RSA-3072 generation and encrypted backup derivation can exceed the
    // default one-second query deadline while other crypto tests run in parallel.
    await screen.findByText(/Your receiving fingerprint/, {}, { timeout: 5_000 });
    expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toBeDisabled();
    await user.click(screen.getByLabelText("I retained the separate encrypted receiving-key backup and its password."));
    await user.click(screen.getByRole("button", { name: "Lock and switch workspace" }));
    expect(screen.queryByText(/Your receiving fingerprint/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Work with your own authority" })).toBeInTheDocument();
  }, 15_000);
  it("warns for pending private notes and draft edits until encrypted autosave finishes", async () => {
    const { user } = await restore("researcher", 4);
    expect(leavingIsBlocked()).toBe(false);
    const notes = screen.getByLabelText("Private decision, patch reference or retest notes");
    await user.type(notes, "Private retest evidence");
    expect(leavingIsBlocked()).toBe(true);
    expect(screen.getByText(/Working notes and the selected tier are saved privately per report/)).toBeInTheDocument();
    await user.clear(notes);
    await waitFor(() => expect(leavingIsBlocked()).toBe(false));
    await user.click(screen.getByRole("button", { name: "Prepare report" }));
    const title = screen.getByLabelText("Report title");
    await user.type(title, "An incomplete private report");
    expect(leavingIsBlocked()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save role backup" }));
    expect(leavingIsBlocked()).toBe(true);
    cleanup();
    expect(leavingIsBlocked()).toBe(false);
  }, 15_000);
  it("joins with one researcher identity and backs up multiple prepared reports before submission", async () => {
    const snapshot = { ledger: { reports: { member: () => false } } };
    const session = { execute: vi.fn(async (_command: unknown) => { await mocks.join.mock.calls.at(-1)![1](roleTransactionId); return { circuit: "submitReport", txId: roleTransactionId, blockHeight: "901" }; }), readPublicState: vi.fn().mockResolvedValue(snapshot) };
    mocks.join.mockResolvedValue({ session, snapshot });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 201 })));
    let blob: Blob | undefined;
    vi.stubGlobal("URL", class extends URL { static override createObjectURL = (value: Blob) => { blob = value; return "blob:role-backup"; }; static override revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup(); render(<RoleWorkspace />);
    const invitation = JSON.stringify({ format: "vulnseal-program-invitation", version: 1, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) });
    const file = new File([invitation], "invitation.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => invitation });
    await user.upload(screen.getByLabelText("Public program invitation"), file);
    fireEvent.submit(screen.getByRole("button", { name: "Connect Lace and join as researcher" }).closest("form")!);
    await screen.findByRole("heading", { name: "Researcher workspace" });
    expect(mocks.join.mock.calls[0]![0].role).toBe("researcher");
    expect(mocks.join.mock.calls[0]![0]).not.toHaveProperty("vendorSecret");
    const save = async () => {
      await user.type(screen.getByLabelText("Role backup password"), "Prepared reports backup password");
      await user.type(screen.getByLabelText("Confirm role backup password"), "Prepared reports backup password");
      await user.click(screen.getByRole("button", { name: "Download single-role backup" }));
      await screen.findByText(/Role backup downloaded/);
      const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob!); });
      return decryptRoleVault(text, "Prepared reports backup password");
    };
    await save();
    for (const title of ["First independent report", "Second independent report"]) {
      await user.click(screen.getByRole("button", { name: "Prepare report" }));
      await user.type(screen.getByLabelText("Report title"), title);
      await user.type(screen.getByLabelText("Affected asset"), "api.example.test");
      await user.type(screen.getByLabelText("Weakness"), "CWE-862");
      await user.type(screen.getByLabelText("Executive summary"), "Synthetic summary");
      await user.type(screen.getByLabelText(/^Reproduction steps/), "Synthetic reproduction");
      await user.type(screen.getByLabelText("Impact"), "Synthetic impact");
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
      await screen.findByRole("button", { name: "Download single-role backup" });
      expect(fetch).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Reports" }));
      expect(screen.getByRole("button", { name: "Submit prepared report" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Upload saved ciphertext" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Upload all saved ciphertext/ })).toBeDisabled();
      expect(session.execute).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Save role backup" }));
    }
    const saved = await save();
    expect(saved.reports).toHaveLength(2);
    expect(saved.version).toBe(3);
    expect(saved.draft).toBeNull();
    expect(new Set(saved.reports.map((entry) => entry.reportId)).size).toBe(2);
    expect(saved.actorSecret).toBe(mocks.join.mock.calls[0]![0].actorSecret);
    await enableJournal(user);
    await user.click(screen.getByRole("button", { name: "Reports" }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await user.click(screen.getByRole("button", { name: "Submit prepared report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ciphertext upload was not confirmed");
    expect(session.execute).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit prepared report" })).toBeEnabled();
    const failedUpload = vi.mocked(fetch).mock.calls[0]!;
    expect(failedUpload[1]?.body).toBe(saved.reports[1]!.envelope);
    await user.click(screen.getByRole("button", { name: "Upload saved ciphertext" }));
    await screen.findByText(/Storage acknowledged the saved ciphertext/);
    expect(vi.mocked(fetch).mock.calls[1]).toEqual([failedUpload[0], expect.objectContaining({ method: "PUT", body: failedUpload[1]?.body })]);
    await user.click(screen.getByRole("button", { name: "Submit prepared report" }));
    await screen.findByText(new RegExp(`Finalized submitReport: ${roleTransactionId}`));
    await screen.findByText(/public read does not yet match the finalized transaction/);
    expect(screen.getByRole("button", { name: "Submit prepared report" })).toBeDisabled();
    expect(session.execute).toHaveBeenCalledOnce();
    expect(session.execute.mock.calls[0]![0]).toMatchObject({ kind: "submitReport" });
  }, 30_000);
  it("exposes researcher actions only and preserves finalized evidence through a failed ledger read", async () => {
    const { user, session, vault, publicState } = await restore("researcher", 4);
    expect(mocks.join.mock.calls[0]![0].actorSecret).toBe(vault.actorSecret);
    expect(mocks.join.mock.calls[0]![0]).not.toHaveProperty("vendorSecret");
    expect(screen.queryByRole("button", { name: "Begin triage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize payout (no transfer)" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Private decision, patch reference or retest notes"), "Fixed in isolated test");
    session.readPublicState.mockRejectedValueOnce(new Error("Indexer unavailable"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pass retest" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Pass retest" }));
    await screen.findByRole("alert");
    expect(screen.getByText(new RegExp(`Finalized submitRetest: ${roleTransactionId} at block 900`))).toBeInTheDocument();
    const durable = await decryptRoleVault(vi.mocked(writeStoredRole).mock.calls.at(-1)![2], "Workspace journal password");
    expect(durable.submissionAttempts![0]!.finalization?.blockHeight).toBe("900");
    expect(session.execute.mock.calls[0]![0]).toMatchObject({ kind: "submitRetest", passed: true });
    expect(screen.getByRole("button", { name: "Submit prepared report" })).toBeDisabled();
    session.readPublicState.mockResolvedValue(publicState);
    await user.click(screen.getByRole("button", { name: "Refresh ledger" }));
    expect(await screen.findByText("RETEST_PASSED")).toBeInTheDocument();
    expect(session.execute).toHaveBeenCalledOnce();
  }, 15_000);
  it("exposes vendor actions without researcher preparation or retest controls", async () => {
    const { user, session } = await restore("vendor", 0);
    expect(screen.queryByRole("button", { name: "Prepare report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pass retest" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Read selected private report"));
    expect(await screen.findByRole("heading", { name: "Private vulnerability" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Begin triage" }));
    expect(await screen.findByText("TRIAGED")).toBeInTheDocument();
    expect(session.execute.mock.calls[0]![0]).toMatchObject({ kind: "beginTriage" });
    expect(screen.getByRole("button", { name: "Accept report" })).toBeDisabled();
    await user.type(screen.getByLabelText("Private decision, patch reference or retest notes"), "Verified independently");
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept report" })).toBeEnabled());
  }, 15_000);
});
