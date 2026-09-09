// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { decryptRoleVault, encryptRoleVault, parseInvitation, validateRoleVault, withRoleDraft, type RoleVault } from "./role-recovery.js";
import { recoveryFixture } from "./test/recovery-fixture.js";

export const roleFixture = async (role: "researcher" | "vendor" = "researcher"): Promise<RoleVault> => {
  const { snapshot } = await recoveryFixture();
  return { version: 1, role, network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: role === "researcher" ? snapshot.researcherSecret : snapshot.vendorSecret, reports: [{ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] };
};
describe("single-role encrypted recovery", () => {
  it("preserves incomplete private drafts and journals in v3 while rejecting malformed or misplaced drafts", async () => {
    const original = await roleFixture();
    const draft = { schemaVersion: 1 as const, title: "  Private unfinished title  ", summary: "", affectedAsset: "", weakness: "", impact: "", suggestedRemediation: "", researcherContact: "incomplete@", reproductionSteps: ["first line", "", "  unfinished  ", ""], attachments: [{ filename: "private.bin", mediaType: "application/octet-stream", size: 12, sha256: "ab".repeat(32) }] };
    const entry = { transactionId: "cd".repeat(32), recordedAt: "2026-09-09T04:00:00.000Z" };
    const vault = withRoleDraft({ ...original, version: 2, submissionAttempts: [entry] }, draft);
    const encrypted = await encryptRoleVault(vault, "Incomplete draft backup password");
    expect(encrypted).not.toContain(draft.title);
    expect(await decryptRoleVault(encrypted, "Incomplete draft backup password")).toEqual(vault);
    await expect(validateRoleVault({ ...vault, version: 2 })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, draft: { ...draft, extra: "unexpected" } })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, draft: { ...draft, title: 5 } })).rejects.toThrow("Invalid role draft text");
    await expect(validateRoleVault({ ...vault, draft: { ...draft, summary: "x".repeat(1024 * 1024 + 1) } })).rejects.toThrow("Invalid role draft text");
    await expect(validateRoleVault({ ...vault, draft: { ...draft, attachments: [{ ...draft.attachments[0], size: -1 }] } })).rejects.toThrow("attachment size");
    await expect(validateRoleVault({ ...vault, role: "vendor" })).rejects.toThrow("Only researcher");
    expect((await validateRoleVault(withRoleDraft(vault, null))).submissionAttempts).toEqual([entry]);
    expect((await validateRoleVault(original)).draft).toBeUndefined();
  });
  it("preserves a version 2 submission journal and rejects ambiguous or extra journal fields", async () => {
    const original = await roleFixture("vendor");
    const entry = { transactionId: "00315eaad1b87f436849790da0f0072be407dfdf9079b78f15e73c838b9ede2c19", recordedAt: "2026-09-09T04:00:00.000Z" };
    const vault = { ...original, version: 2 as const, submissionAttempts: [entry] };
    const encrypted = await encryptRoleVault(vault, "Journal backup password");
    expect(encrypted).not.toContain(entry.transactionId);
    expect(await decryptRoleVault(encrypted, "Journal backup password")).toEqual(vault);
    await expect(validateRoleVault({ ...vault, version: 1 })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, submissionAttempts: [entry, entry] })).rejects.toThrow("Invalid submission journal entry");
    await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...entry, status: "SUCCESS" }] })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...entry, transactionId: "bad" }] })).rejects.toThrow("Invalid role identifier");
  });
  it("round trips one role and its report material with fresh encryption", async () => {
    const vault = await roleFixture();
    const encrypted = await encryptRoleVault(vault, "Single role backup password");
    expect(encrypted).not.toContain(vault.actorSecret);
    expect(encrypted).not.toContain(vault.reports[0]!.key);
    expect(await encryptRoleVault(vault, "Single role backup password")).not.toBe(encrypted);
    expect(await decryptRoleVault(encrypted, "Single role backup password")).toEqual(vault);
    await expect(decryptRoleVault(encrypted, "Incorrect role backup password")).rejects.toThrow("Wrong role backup password");
  });
  it("rejects a second authority, duplicate reports and foreign-program entries", async () => {
    const vault = await roleFixture();
    await expect(validateRoleVault({ ...vault, vendorSecret: "34".repeat(32) })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, reports: [vault.reports[0], vault.reports[0]] })).rejects.toThrow("duplicate or foreign");
    await expect(validateRoleVault({ ...vault, reports: [{ ...vault.reports[0], contractAddress: "cd".repeat(32) }] })).rejects.toThrow("duplicate or foreign");
    await expect(validateRoleVault({ ...vault, contractAddress: null, reports: [] })).rejects.toThrow("researcher role backup");
    expect((await validateRoleVault({ ...vault, role: "vendor", contractAddress: null, reports: [] })).contractAddress).toBeNull();
  });
  it("accepts only the public invitation allowlist", () => {
    const invitation = { format: "vulnseal-program-invitation", version: 1, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
    expect(parseInvitation(JSON.stringify(invitation))).toEqual(invitation);
    expect(() => parseInvitation(JSON.stringify({ ...invitation, actorSecret: "45".repeat(32) }))).toThrow("Unsupported role document");
  });
});
