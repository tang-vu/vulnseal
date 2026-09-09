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
beforeEach(() => { vi.clearAllMocks(); mocks.connect.mockResolvedValue({}); });
const fixture = async () => {
  const { snapshot, sealed } = await recoveryFixture();
  const vault: RoleVault = { version: 1, role: "researcher", network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: snapshot.researcherSecret, reports: [{ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] };
  const record = { ciphertextDigest: sealed.ciphertextDigest, researcherKey: pureCircuits.deriveResearcherKey(hexToBytes(vault.programId), hexToBytes(vault.reports[0]!.reportId), hexToBytes(vault.actorSecret)) };
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
});
