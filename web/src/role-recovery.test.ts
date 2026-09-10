// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { decryptRoleVault, encryptRoleVault, parseInvitation, validateRoleVault, withRoleDraft, withAttachmentDraft, withReportNotes, withSubmissionAttempt, withFinalizedSubmission, type RoleVault } from "./role-recovery.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
import { withSubmissionNotes, withRetestChoice } from "./role-recovery.js";
import { withDeploymentInputs, withProgramDraft } from "./role-recovery.js";
import { captureDeploymentInputs, defaultProgram, defaultProgramDraft, programConstructor } from "./program.js";
import { hexToBytes } from "@vulnseal/shared";

it("keeps exact deployment inputs immutable through draft edits, finalization and another attempt", async () => {
  const original = await roleFixture("vendor"), transactionId = "12".repeat(32);
  const constructor = await programConstructor(hexToBytes(original.programId), defaultProgram);
  const inputs = captureDeploymentInputs(constructor);
  const selected = inputs.scopeDigest;
  constructor.scopeDigest.fill(0);
  expect(inputs.scopeDigest).toBe(selected); // Captured bytes cannot alias the SDK's mutable buffers.
  let vault = await withDeploymentInputs(await withSubmissionAttempt(original, transactionId, { circuit: "constructor", reportId: null }), transactionId, inputs);
  vault = withProgramDraft(vault, { ...defaultProgramDraft, rewardPolicy: "Later edited policy" });
  vault = await withFinalizedSubmission(vault, { circuit: "constructor", txId: transactionId, blockHeight: "100" });
  vault = await withSubmissionAttempt(vault, "34".repeat(32), { circuit: "constructor", reportId: null });
  expect(vault.version).toBe(12);
  expect(vault.submissionAttempts![0]!.deployment).toEqual(inputs);
  expect(vault.submissionAttempts![1]!.deployment).toBeNull();
  expect(await decryptRoleVault(await encryptRoleVault(vault, "Deployment input recovery password"), "Deployment input recovery password")).toEqual(vault);
  await expect(withDeploymentInputs(vault, transactionId, { ...inputs, responseDays: "14" })).rejects.toThrow("cannot be replaced");
  await expect(withDeploymentInputs(vault, "34".repeat(32), { ...inputs, programId: "ff".repeat(32) })).rejects.toThrow("another program");
  await expect(withDeploymentInputs(vault, "34".repeat(32), { ...inputs, responseDays: "18446744073709551616" })).rejects.toThrow("window");
  await expect(withDeploymentInputs(vault, "34".repeat(32), { ...inputs, disclosureDelayDays: "01" })).rejects.toThrow("window");
  await expect(withDeploymentInputs(vault, "34".repeat(32), { ...inputs, scopeDigest: "invalid" })).rejects.toThrow("digest");
  await expect(validateRoleVault({ ...vault, version: 11 })).rejects.toThrow("Unsupported role document");
  const researcher = await roleFixture();
  await expect(withDeploymentInputs(researcher, transactionId, inputs)).rejects.toThrow("vendor constructor");
  const reportAttempt = await withSubmissionAttempt(original, "ab".repeat(32), { circuit: "beginTriage", reportId: original.reports[0]!.reportId });
  await expect(withDeploymentInputs(reportAttempt, "ab".repeat(32), inputs)).rejects.toThrow("vendor constructor");
});

it("round-trips incomplete vendor policy text and preserves it through journal updates", async () => {
  const original = await roleFixture("vendor");
  const draft = { ...defaultProgramDraft, name: "  Private program  ", primaryScope: "", rewardPolicy: "line one\n\nunfinished\n" };
  let vault = withProgramDraft(original, draft);
  vault = await withSubmissionAttempt(vault, "cd".repeat(32), { circuit: "beginTriage", reportId: original.reports[0]!.reportId });
  vault = await withSubmissionNotes(vault, "cd".repeat(32), { reportId: original.reports[0]!.reportId, text: "Private decision", tier: "3" });
  vault = await withFinalizedSubmission(vault, { circuit: "beginTriage", txId: "cd".repeat(32), blockHeight: "123" });
  const encrypted = await encryptRoleVault(vault, "Vendor program draft password");
  expect(encrypted).not.toContain(draft.name.trim());
  const restored = await decryptRoleVault(encrypted, "Vendor program draft password");
  expect(restored).toEqual(vault);
  expect(restored.version).toBe(11);
  expect(restored.programDraft).toEqual(draft);
  expect(original.programDraft).toBeUndefined();
  await expect(validateRoleVault({ ...vault, programDraft: undefined })).rejects.toThrow("Invalid vendor program draft");
  await expect(validateRoleVault({ ...vault, version: 10 })).rejects.toThrow("Unsupported role document");
  expect(() => withProgramDraft(vault, { ...draft, name: "x".repeat(65537) })).toThrow("64 KiB");
  expect(() => withProgramDraft(vault, { ...draft, responseDays: 7 } as never)).toThrow("must be text");
  const researcher = await roleFixture();
  expect(() => withProgramDraft(researcher, draft)).toThrow("Only vendor");
  await expect(validateRoleVault({ ...withProgramDraft(original, draft), role: "researcher" })).rejects.toThrow("Only vendor");
});

it("preserves v11 when a researcher records retest evidence without a vendor draft", async () => {
  const original = await roleFixture(), reportId = original.reports[0]!.reportId;
  const legacy = await withRetestChoice(await withSubmissionAttempt(original, "ab".repeat(32), { circuit: "submitRetest", reportId }), "ab".repeat(32), true, "cd".repeat(32));
  let vault = await validateRoleVault({ ...legacy, version: 11, programDraft: null });
  vault = await withSubmissionAttempt(vault, "ef".repeat(32), { circuit: "submitRetest", reportId });
  vault = await withRetestChoice(vault, "ef".repeat(32), false);
  expect(vault.version).toBe(11);
  expect(vault.programDraft).toBeNull();
  expect(vault.submissionAttempts![0]!.retestPatchCommitment).toBe("cd".repeat(32));
  expect(vault.submissionAttempts![1]!.retestPatchCommitment).toBeNull();
});

it("allows the final journal slot and rejects the next attempt without changing history", async () => {
  const original = await roleFixture("vendor");
  const entries = Array.from({ length: 199 }, (_, i) => ({ transactionId: (i + 1).toString(16).padStart(64, "0"), recordedAt: "2026-09-09T00:00:00.000Z" }));
  const full = await withSubmissionAttempt({ ...original, version: 2, submissionAttempts: entries }, "cd".repeat(32), { circuit: "beginTriage", reportId: original.reports[0]!.reportId });
  expect(full.submissionAttempts).toHaveLength(200);
  expect(entries).toHaveLength(199);
  await expect(withSubmissionAttempt(full, "ef".repeat(32), { circuit: "beginTriage", reportId: original.reports[0]!.reportId })).rejects.toThrow("journal is full");
  expect(full.submissionAttempts).toHaveLength(200);
  expect((await validateRoleVault(full)).submissionAttempts).toEqual(full.submissionAttempts);
});

it("retains the selected retest patch in v10 without inventing legacy patches", async () => {
  const original = await roleFixture(), reportId = original.reports[0]!.reportId, txId = "12".repeat(32), patch = "cd".repeat(32);
  let vault = await withSubmissionAttempt(original, txId, { circuit: "submitRetest", reportId });
  vault = await withRetestChoice(vault, txId, false, patch);
  vault = await withSubmissionNotes(vault, txId, { reportId, text: "Saved evidence", tier: "3" });
  vault = withAttachmentDraft(vault, { filename: "pending", mediaType: "", size: "", digest: "" });
  vault = await withFinalizedSubmission(vault, { circuit: "submitRetest", txId, blockHeight: "901" });
  vault = await withSubmissionAttempt(vault, "34".repeat(32), { circuit: "submitRetest", reportId });
  vault = await withRetestChoice(vault, "34".repeat(32), true);
  expect(vault.version).toBe(10);
  expect(vault.submissionAttempts![0]!.retestPatchCommitment).toBe(patch);
  expect(vault.submissionAttempts![1]!.retestPatchCommitment).toBeNull();
  expect(await decryptRoleVault(await encryptRoleVault(vault, "Selected patch recovery password"), "Selected patch recovery password")).toEqual(vault);
  await expect(withRetestChoice(vault, txId, false, "ef".repeat(32))).rejects.toThrow("cannot be replaced");
  await expect(withRetestChoice(vault, txId, false, "invalid")).rejects.toThrow();
  await expect(validateRoleVault({ ...vault, version: 9 })).rejects.toThrow("Unsupported role document");
  await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...vault.submissionAttempts![0], retestPassed: null }] })).rejects.toThrow("explicit retest choice");
});

it("preserves explicit retest choices through v9 recovery and later edits without guessing older choices", async () => {
  const original = await roleFixture(), reportId = original.reports[0]!.reportId;
  const first = "12".repeat(32), second = "34".repeat(32);
  let vault = await withSubmissionAttempt(original, first, { circuit: "submitRetest", reportId });
  vault = await withSubmissionAttempt(vault, second, { circuit: "submitRetest", reportId });
  vault = await withRetestChoice(vault, second, false);
  expect(vault.version).toBe(9);
  expect(vault.submissionAttempts![0]!.retestPassed).toBeNull();
  expect(vault.submissionAttempts![1]!.retestPassed).toBe(false);
  vault = await withSubmissionNotes(vault, second, { reportId, text: "Retest failed", tier: "3" });
  vault = withAttachmentDraft(vault, { filename: "", mediaType: "", size: "", digest: "" });
  vault = await withSubmissionAttempt(vault, "56".repeat(32), { circuit: "submitReport", reportId });
  vault = await withFinalizedSubmission(vault, { circuit: "submitRetest", txId: second, blockHeight: "901" });
  expect(vault.version).toBe(9);
  expect(vault.submissionAttempts![1]!.retestPassed).toBe(false);
  expect(vault.submissionAttempts![2]!.retestPassed).toBeNull();
  const encrypted = await encryptRoleVault(vault, "Retest choice recovery password");
  expect(await decryptRoleVault(encrypted, "Retest choice recovery password")).toEqual(vault);
  await expect(withRetestChoice(vault, second, true)).rejects.toThrow("cannot be replaced");
  await expect(withRetestChoice(vault, "56".repeat(32), true)).rejects.toThrow("retest intent");
  for (const retestPassed of ["false", 0, undefined]) await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...vault.submissionAttempts![1], retestPassed }] })).rejects.toThrow();
  await expect(validateRoleVault({ ...vault, version: 8 })).rejects.toThrow("Unsupported role document");
});

export const roleFixture = async (role: "researcher" | "vendor" = "researcher"): Promise<RoleVault> => {
  const { snapshot } = await recoveryFixture();
  return { version: 1, role, network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, actorSecret: role === "researcher" ? snapshot.researcherSecret : snapshot.vendorSecret, reports: [{ network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt }] };
};
describe("single-role encrypted recovery", () => {
  it("preserves incomplete attachment input with receipts and notes through v7 edits and encryption", async () => {
    const original = await roleFixture(), reportId = original.reports[0]!.reportId;
    const pending = { filename: "  proof.txt  ", mediaType: "", size: "unknown", digest: "abcd" };
    const attempted = await withSubmissionAttempt(original, "ab".repeat(32), { circuit: "submitReport", reportId });
    let vault = withAttachmentDraft(await withFinalizedSubmission(attempted, { circuit: "submitReport", txId: "ab".repeat(32), blockHeight: "900" }), pending);
    vault = withRoleDraft(withReportNotes(vault, { reportId, tier: "3", text: "Retained notes" }), null);
    vault = await withSubmissionAttempt(vault, "cd".repeat(32), { circuit: "submitRetest", reportId });
    vault = await withFinalizedSubmission(vault, { circuit: "submitRetest", txId: "cd".repeat(32), blockHeight: "901" });
    expect(vault.version).toBe(7);
    expect(vault.attachmentDraft).toEqual(pending);
    expect(vault.submissionAttempts!.map((item) => item.finalization?.blockHeight)).toEqual(["900", "901"]);
    const encrypted = await encryptRoleVault(vault, "Pending attachment recovery password");
    expect(encrypted).not.toContain(pending.filename);
    expect(await decryptRoleVault(encrypted, "Pending attachment recovery password")).toEqual(vault);
    await expect(validateRoleVault({ ...vault, attachmentDraft: { ...pending, filename: "x".repeat(4097) } })).rejects.toThrow("4 KiB");
    await expect(validateRoleVault({ ...vault, attachmentDraft: { ...pending, bytes: "forbidden" } })).rejects.toThrow("Invalid attachment draft");
    expect(() => withAttachmentDraft({ ...original, role: "vendor" }, pending)).toThrow("Only researcher");
  });
  it("retains SDK finalization through migration, edits and encrypted recovery without inventing legacy receipts", async () => {
    const original = await roleFixture("vendor"), txId = "cd".repeat(33);
    const legacy = { transactionId: "ab".repeat(32), recordedAt: "2026-09-09T04:00:00.000Z" };
    const intent = { circuit: "beginTriage" as const, reportId: original.reports[0]!.reportId };
    const pending = await withSubmissionAttempt({ ...original, version: 2, submissionAttempts: [legacy] }, txId, intent);
    const evidence = { txId, circuit: intent.circuit, blockHeight: "900" };
    const vault = await withFinalizedSubmission(pending, evidence, "2026-09-09T04:01:00.000Z");
    expect(vault.version).toBe(6);
    expect(vault.submissionAttempts![0]).toEqual({ ...legacy, intent: null, finalization: null });
    expect(vault.submissionAttempts![1]!.finalization).toEqual({ blockHeight: "900", recordedAt: "2026-09-09T04:01:00.000Z" });
    const edited = await withSubmissionAttempt(withRoleDraft(withReportNotes(vault, { reportId: intent.reportId, tier: "2", text: "Retained notes" }), null), "ef".repeat(32), intent);
    expect(edited.version).toBe(6);
    expect(edited.submissionAttempts![2]!.finalization).toBeNull();
    const encrypted = await encryptRoleVault(edited, "Finalized journal backup password");
    expect(encrypted).not.toContain(txId);
    expect(await decryptRoleVault(encrypted, "Finalized journal backup password")).toEqual(edited);
    expect(await withFinalizedSubmission(vault, evidence)).toEqual(vault);
    await expect(withFinalizedSubmission(vault, { ...evidence, blockHeight: "901" })).rejects.toThrow("conflicts");
    for (const bad of [{ ...evidence, txId: legacy.transactionId }, { ...evidence, circuit: "rejectReport" as const }]) await expect(withFinalizedSubmission(vault, bad)).rejects.toThrow("recorded submission intent");
    for (const blockHeight of ["-1", "1.5", "1e3", "0900", "9007199254740992"]) await expect(withFinalizedSubmission(pending, { ...evidence, blockHeight })).rejects.toThrow("block height");
    await expect(withFinalizedSubmission(pending, evidence, "2026-02-30T00:00:00.000Z")).rejects.toThrow("timestamp");
    await expect(validateRoleVault({ ...vault, version: 5 })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...vault.submissionAttempts![1], intent: null }] })).rejects.toThrow("recorded intent");
  });
  it("migrates legacy attempts without inventing intent and preserves new report context through encrypted edits", async () => {
    const original = await roleFixture("vendor");
    const old = { transactionId: "ab".repeat(32), recordedAt: "2026-09-09T04:00:00.000Z" };
    const intent = { circuit: "beginTriage" as const, reportId: original.reports[0]!.reportId };
    const vault = await withSubmissionAttempt({ ...original, version: 2, submissionAttempts: [old] }, "cd".repeat(33), intent);
    expect(vault.version).toBe(5);
    expect(vault.submissionAttempts![0]).toEqual({ ...old, intent: null });
    const edited = withRoleDraft(withReportNotes(vault, { reportId: intent.reportId, tier: "2", text: "Later private edits" }), null);
    expect(edited.version).toBe(5);
    expect(edited.submissionAttempts![1]!.intent).toEqual(intent);
    const encrypted = await encryptRoleVault(edited, "Contextual journal recovery password");
    expect(encrypted).not.toContain(intent.reportId);
    expect(await decryptRoleVault(encrypted, "Contextual journal recovery password")).toEqual(edited);
    await expect(validateRoleVault({ ...vault, version: 4 })).rejects.toThrow("Unsupported role document");
    await expect(withSubmissionAttempt(vault, "ef".repeat(32), { ...intent, reportId: "ff".repeat(32) })).rejects.toThrow("saved report");
    await expect(withSubmissionAttempt(vault, "ef".repeat(32), { ...intent, circuit: "submitRetest" })).rejects.toThrow("circuit for this role");
    await expect(withSubmissionAttempt(vault, old.transactionId, intent)).rejects.toThrow("Invalid submission journal entry");
    await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...old, intent: { ...intent, status: "SUCCESS" } }] })).rejects.toThrow("Unsupported role document");
  });
  it("records deployment intent only for a vendor and without a report identifier", async () => {
    const original = { ...await roleFixture("vendor"), contractAddress: null, reports: [] };
    const vault = await withSubmissionAttempt(original, "ab".repeat(32), { circuit: "constructor", reportId: null });
    expect(vault.submissionAttempts![0]!.intent).toEqual({ circuit: "constructor", reportId: null });
    await expect(withSubmissionAttempt(await roleFixture(), "ab".repeat(32), { circuit: "constructor", reportId: null })).rejects.toThrow("deployment intent");
    await expect(validateRoleVault({ ...vault, submissionAttempts: [{ ...vault.submissionAttempts![0], intent: { circuit: "constructor", reportId: "ab".repeat(32) } }] })).rejects.toThrow("deployment intent");
  });
  it("encrypts report-bound working notes without losing draft/journal fields or accepting foreign notes", async () => {
    const original = await roleFixture("vendor");
    const note = { reportId: original.reports[0]!.reportId, text: "Private decision\n\n  unfinished patch notes  ", tier: "4" };
    const vault = withReportNotes(original, note);
    const encrypted = await encryptRoleVault(vault, "Private report notes password");
    expect(encrypted).not.toContain(note.text);
    expect(await decryptRoleVault(encrypted, "Private report notes password")).toEqual(vault);
    expect((await validateRoleVault(withRoleDraft(vault, null))).reportNotes).toEqual([note]);
    expect(withReportNotes(vault, { ...note, text: "Updated" }).reportNotes).toHaveLength(1);
    await expect(validateRoleVault({ ...vault, version: 3 })).rejects.toThrow("Unsupported role document");
    await expect(validateRoleVault({ ...vault, reportNotes: [note, note] })).rejects.toThrow("unique saved report");
    await expect(validateRoleVault({ ...vault, reportNotes: [{ ...note, reportId: "ff".repeat(32) }] })).rejects.toThrow("unique saved report");
    await expect(validateRoleVault({ ...vault, reportNotes: [{ ...note, text: "x".repeat(65537) }] })).rejects.toThrow("64 KiB");
    await expect(validateRoleVault({ ...vault, reportNotes: [{ ...note, tier: "5" }] })).rejects.toThrow("tier");
    await expect(validateRoleVault({ ...vault, reportNotes: [{ ...note, status: "FINALIZED" }] })).rejects.toThrow("Unsupported role document");
  });
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

it("preserves per-attempt private notes across edits, migrations and encrypted recovery", async () => {
  const original = await roleFixture();
  const reportId = original.reports[0]!.reportId, txId = "cd".repeat(32);
  const intent = { circuit: "submitReport" as const, reportId };
  const old = await withSubmissionAttempt(original, "ab".repeat(32), intent);
  const pending = await withSubmissionAttempt(old, txId, intent);
  const notes = { reportId, text: "Original private context\nwith spacing  ", tier: "2" };
  let vault = await withSubmissionNotes(pending, txId, notes);
  expect(vault.version).toBe(8);
  expect(vault.submissionAttempts![0]!.notes).toBeNull();
  expect(vault.submissionAttempts![1]!.notes).toEqual(notes);
  vault = withReportNotes(vault, { ...notes, text: "Later edit", tier: "4" });
  vault = withAttachmentDraft(withRoleDraft(vault, null), { filename: "pending.txt", mediaType: "", size: "", digest: "" });
  vault = await withFinalizedSubmission(vault, { txId, circuit: "submitReport", blockHeight: "900" });
  vault = await withSubmissionAttempt(vault, "ef".repeat(32), intent);
  expect(vault.version).toBe(8);
  expect(vault.submissionAttempts![1]!.notes).toEqual(notes);
  expect(vault.submissionAttempts![2]!.notes).toBeNull();
  const encrypted = await encryptRoleVault(vault, "Private submission note password");
  expect(encrypted).not.toContain(notes.text);
  expect(await decryptRoleVault(encrypted, "Private submission note password")).toEqual(vault);
  await expect(withSubmissionNotes(vault, txId, { ...notes, text: "Replacement" })).rejects.toThrow("cannot be replaced");
  await expect(withSubmissionNotes(vault, txId, { ...notes, reportId: "ff".repeat(32) })).rejects.toThrow("match");
  for (const invalid of [{ ...notes, text: "x".repeat(65537) }, { ...notes, tier: "5" }, { ...notes, extra: true }]) await expect(withSubmissionNotes(vault, txId, invalid)).rejects.toThrow();
  const mutated = { ...vault, submissionAttempts: vault.submissionAttempts!.map((entry) => ({ ...entry, notes: { ...notes, reportId: "ff".repeat(32) } })) };
  await expect(validateRoleVault(mutated)).rejects.toThrow("match");
});
