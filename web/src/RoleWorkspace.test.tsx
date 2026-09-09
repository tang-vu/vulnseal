// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptRoleVault, encryptRoleVault } from "./role-recovery.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
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

const restore = async (role: "researcher" | "vendor", status: number) => {
  const { snapshot } = await recoveryFixture();
  const vault = { version: 1 as const, role, network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: role === "vendor" ? snapshot.vendorSecret : snapshot.researcherSecret, reports: [{ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] };
  const record = { status, patchCommitment: new Uint8Array(32).fill(7) };
  const publicState = { ledger: { reports: { member: () => true, lookup: () => record } } };
  const session = { execute: vi.fn(async (_command: unknown) => { record.status = role === "researcher" ? 5 : 1; return { circuit: role === "researcher" ? "submitRetest" : "beginTriage", txId: "role-transaction", blockHeight: "900" }; }), readPublicState: vi.fn().mockResolvedValue(publicState) };
  mocks.join.mockResolvedValue({ session, snapshot: publicState });
  const serialized = await encryptRoleVault(vault, "Role workspace test password");
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
  it("keeps warning for private notes and draft edits even when the role is autosaved", async () => {
    const { user } = await restore("researcher", 4);
    expect(leavingIsBlocked()).toBe(false);
    const notes = screen.getByLabelText("Private decision, patch reference or retest notes");
    await user.type(notes, "Private retest evidence");
    expect(leavingIsBlocked()).toBe(true);
    expect(screen.getByText(/Decision, patch or retest notes are only in this tab/)).toBeInTheDocument();
    await user.clear(notes);
    expect(leavingIsBlocked()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Prepare report" }));
    const title = screen.getByLabelText("Report title");
    await user.type(title, "An incomplete private report");
    expect(leavingIsBlocked()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save role backup" }));
    expect(leavingIsBlocked()).toBe(true);
    cleanup();
    expect(leavingIsBlocked()).toBe(false);
  });
  it("joins with one researcher identity and backs up multiple prepared reports before submission", async () => {
    const snapshot = { ledger: { reports: { member: () => false } } };
    const session = { execute: vi.fn(async (_command: unknown) => ({ circuit: "submitReport", txId: "prepared-submit", blockHeight: "901" })), readPublicState: vi.fn().mockResolvedValue(snapshot) };
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
      if (title === "First independent report") {
        vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 500 }));
        await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
        await screen.findByRole("alert");
        expect(screen.getByLabelText("Report title")).toHaveValue(title);
        await user.click(screen.getByRole("button", { name: "Save role backup" }));
        const recoveredDraft = await save();
        expect(recoveredDraft.draft?.title).toBe(title);
        expect(recoveredDraft.reports).toHaveLength(0);
        await user.click(screen.getByRole("button", { name: "Prepare report" }));
        await user.click(screen.getByRole("checkbox"));
      }
      await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
      await screen.findByRole("button", { name: "Download single-role backup" });
      await user.click(screen.getByRole("button", { name: "Reports" }));
      expect(screen.getByRole("button", { name: "Submit prepared report" })).toBeDisabled();
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
    await user.click(screen.getByRole("button", { name: "Submit prepared report" }));
    await screen.findByText(/Finalized submitReport: prepared-submit/);
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
    await user.click(screen.getByRole("button", { name: "Pass retest" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/Finalized submitRetest: role-transaction at block 900/)).toBeInTheDocument();
    expect(session.execute.mock.calls[0]![0]).toMatchObject({ kind: "submitRetest", passed: true });
    expect(screen.getByRole("button", { name: "Submit prepared report" })).toBeDisabled();
    session.readPublicState.mockResolvedValue(publicState);
    await user.click(screen.getByRole("button", { name: "Refresh ledger" }));
    expect(await screen.findByText("RETEST_PASSED")).toBeInTheDocument();
    expect(session.execute).toHaveBeenCalledOnce();
  });
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
    expect(screen.getByRole("button", { name: "Accept report" })).toBeEnabled();
  });
});
