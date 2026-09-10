// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pureCircuits } from "@vulnseal/contract";
import { hexToBytes } from "@vulnseal/shared";
import { recoveryFixture } from "./test/recovery-fixture.js";
import type { RoleVault } from "./role-recovery.js";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), join: vi.fn() }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.connect }));
vi.mock("@vulnseal/api/role-session", () => ({ RoleSession: { join: mocks.join } }));
import { joinRoleVault } from "./role-network.js";
import { submissionReceipt } from "./submission-receipt.js";
beforeEach(() => { vi.clearAllMocks(); mocks.connect.mockResolvedValue({}); });
const fixture = async () => {
  const { snapshot, sealed } = await recoveryFixture();
  const vault: RoleVault = { version: 1, role: "researcher", network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: snapshot.researcherSecret, reports: [{ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] };
  const commitment = hexToBytes(vault.reports[0]!.reportId);
  const researcherKey = pureCircuits.deriveResearcherKey(hexToBytes(vault.programId), commitment, hexToBytes(vault.actorSecret));
  const record = { commitment, ciphertextDigest: sealed.ciphertextDigest, researcherKey, submissionReceipt: submissionReceipt(commitment, sealed.ciphertextDigest, researcherKey) };
  const member = vi.fn(() => true);
  const session = { readPublicState: vi.fn().mockResolvedValue({ ledger: { reports: { member, lookup: () => record } } }) };
  mocks.join.mockResolvedValue(session);
  return { vault, record, member, session };
};
describe("role restore ledger binding", () => {
  it("connects to the backup network and passes exactly one role identity", async () => {
    const { vault, session } = await fixture();
    expect((await joinRoleVault(vault)).session).toBe(session);
    expect(mocks.connect).toHaveBeenCalledWith("preprod");
    expect(mocks.join.mock.calls[0]![2]).toEqual({ role: "researcher", programId: hexToBytes(vault.programId), actorSecret: hexToBytes(vault.actorSecret) });
  });
  it("rejects another researcher's authority even when the report can be decrypted", async () => {
    const { vault, record } = await fixture(); record.researcherKey = new Uint8Array(32);
    await expect(joinRoleVault(vault)).rejects.toThrow("another researcher authority");
  });
  it("rejects a different ledger ciphertext", async () => {
    const { vault, record } = await fixture(); record.ciphertextDigest = new Uint8Array(32);
    await expect(joinRoleVault(vault)).rejects.toThrow("ciphertext does not match");
  });
  it("restores prepared reports that have not yet been submitted", async () => {
    const { vault, member, session } = await fixture(); member.mockReturnValue(false);
    expect((await joinRoleVault(vault)).session).toBe(session);
  });
  it.each(["researcher", "vendor"] as const)("rejects inconsistent immutable ledger fields for a %s restore", async (role) => {
    const { vault, record } = await fixture();
    const selected = { ...vault, role };
    const commitment = record.commitment;
    record.commitment = new Uint8Array(32);
    await expect(joinRoleVault(selected)).rejects.toThrow("commitment does not match");
    record.commitment = commitment;
    record.submissionReceipt = new Uint8Array(32);
    await expect(joinRoleVault(selected)).rejects.toThrow("submission receipt is inconsistent");
  });
  it("refuses absent reports with saved finalization while preserving uncertain attempts", async () => {
    const { vault, member, session } = await fixture(); member.mockReturnValue(false);
    const attempt = { transactionId: "cd".repeat(32), recordedAt: "2026-09-10T00:00:00.000Z", intent: { circuit: "submitReport" as const, reportId: vault.reports[0]!.reportId }, finalization: null };
    const uncertain: RoleVault = { ...vault, version: 6, draft: null, reportNotes: [], submissionAttempts: [attempt] };
    expect((await joinRoleVault(uncertain)).session).toBe(session);
    const finalized = { ...uncertain, submissionAttempts: [{ ...attempt, finalization: { blockHeight: "12", recordedAt: attempt.recordedAt } }] };
    await expect(joinRoleVault(finalized)).rejects.toThrow("Saved finalization conflicts with an absent ledger report");
    member.mockReturnValue(true);
    expect((await joinRoleVault(finalized)).session).toBe(session);
  });
  it("retains the selected backup identity and reports while wallet connection is pending", async () => {
    const { vault, record, session } = await fixture();
    const expected = structuredClone(vault);
    let connect!: (value: object) => void;
    mocks.connect.mockReturnValueOnce(new Promise((resolve) => { connect = resolve; }));
    const joining = joinRoleVault(vault);
    Object.assign(vault, { network: "preview", programId: "ff".repeat(32), actorSecret: "ee".repeat(32), reports: [] });
    record.ciphertextDigest = new Uint8Array(32);
    connect({});
    await expect(joining).rejects.toThrow("ciphertext does not match");
    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(expected.network);
    expect(mocks.join.mock.calls[0]![2]).toEqual({ role: expected.role, programId: hexToBytes(expected.programId), actorSecret: hexToBytes(expected.actorSecret) });
    expect(session.readPublicState).toHaveBeenCalledOnce();
  });
});
