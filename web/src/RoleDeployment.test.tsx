// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { decryptRoleVault } from "./role-recovery.js";
import type { StoredRole } from "./role-storage.js";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), deploy: vi.fn(), attach: vi.fn(), write: vi.fn() }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.connect }));
vi.mock("@vulnseal/api/api", () => ({ VulnSealApi: { deploy: mocks.deploy } }));
vi.mock("@vulnseal/api/role-session", () => ({ RoleSession: { attach: mocks.attach } }));
vi.mock("./role-storage.js", () => ({ listStoredRoles: async () => [], readStoredRole: vi.fn(), deleteStoredRole: vi.fn(), writeStoredRole: mocks.write }));
import { RoleWorkspace } from "./RoleWorkspace.js";

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const password = "Deployment recovery checkpoint password";
const address = "ab".repeat(32), transactionId = "cd".repeat(32);

for (const failSave of [false, true]) {
  it(`retains finalized deployment recovery when ${failSave ? "the address save" : "the follow-up ledger read"} fails`, async () => {
    let row: StoredRole | undefined;
    mocks.write.mockImplementation(async (id, label, encrypted, revision) => {
      const decoded = await decryptRoleVault(encrypted, password);
      if (failSave && decoded.contractAddress === address) throw new Error("Injected address storage failure");
      row = { id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() };
      return row;
    });
    let checkpoint!: (id: string) => Promise<void>;
    mocks.connect.mockImplementation(async (_network, beforeSubmit) => { checkpoint = beforeSubmit; return {}; });
    mocks.deploy.mockImplementation(async () => {
      await checkpoint(transactionId);
      const beforeWallet = await decryptRoleVault(row!.encrypted, password);
      expect(beforeWallet.contractAddress).toBeNull();
      expect(beforeWallet.submissionAttempts![0]!.intent).toEqual({ circuit: "constructor", reportId: null });
      return { api: { contractAddress: address }, evidence: { circuit: "constructor", txId: transactionId, blockHeight: "900" } };
    });
    mocks.attach.mockImplementation(async () => {
      // The encrypted address must already be durable before any follow-up read.
      expect((await decryptRoleVault(row!.encrypted, password)).contractAddress).toBe(address);
      expect((await decryptRoleVault(row!.encrypted, password)).submissionAttempts![0]!.finalization?.blockHeight).toBe("900");
      throw new Error("Indexer unavailable after deployment");
    });
    const user = userEvent.setup(); render(<RoleWorkspace />);
    await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
    await user.type(screen.getByLabelText("Browser copy password"), password);
    await user.type(screen.getByLabelText("Confirm browser copy password"), password);
    await user.click(screen.getByRole("button", { name: "Enable encrypted browser autosave" }));
    await screen.findByText(/Saved encrypted browser copy/);
    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.click(screen.getByRole("button", { name: "Connect Lace and deploy program" }));
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(failSave ? "Program deployment finalized, but its address could not be saved" : "Indexer unavailable after deployment");
    expect(screen.getByText(`Contract: ${address}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Finalized constructor: ${transactionId}`))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Lace and deploy program" })).not.toBeInTheDocument();
    expect(mocks.deploy).toHaveBeenCalledOnce();
    expect(mocks.attach).toHaveBeenCalledTimes(failSave ? 0 : 1);
    const durable = await decryptRoleVault(row!.encrypted, password);
    expect(durable.contractAddress).toBe(failSave ? null : address);
    expect(durable.submissionAttempts![0]!.transactionId).toBe(transactionId);
    expect(durable.submissionAttempts![0]!.finalization?.blockHeight).toBe(failSave ? undefined : "900");
    expect(screen.getByText(/Saved SDK finalization: block 900/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock and switch workspace" })).toHaveProperty("disabled", failSave);
    if (failSave) {
      let backup!: Blob;
      vi.stubGlobal("URL", class extends URL {
        static override createObjectURL = (blob: Blob) => { backup = blob; return "blob:deployment-backup"; };
        static override revokeObjectURL = vi.fn();
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      await user.type(screen.getByLabelText("Role backup password"), password);
      await user.type(screen.getByLabelText("Confirm role backup password"), password);
      await user.click(screen.getByRole("button", { name: "Download single-role backup" }));
      await screen.findByText(/Role backup downloaded/);
      const serialized = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(backup);
      });
      const exported = await decryptRoleVault(serialized, password);
      expect(exported.contractAddress).toBe(address);
      expect(exported.submissionAttempts![0]!.transactionId).toBe(transactionId);
      expect(exported.submissionAttempts![0]!.finalization?.blockHeight).toBe("900");
    }
  }, 20_000);
}
