// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { pureCircuits, type Ledger } from "@vulnseal/contract";
import { hexToBytes } from "@vulnseal/shared";
import { programConstructor } from "./program.js";
import { decryptRecovery, encryptRecovery, validateRecovery, verifyRecoveryLedger } from "./recovery.js";
import { submissionReceipt } from "./submission-receipt.js";
import { recoveryFixture, recoveryDraft as draft } from "./test/recovery-fixture.js";

const password = "test-only recovery password";

describe("encrypted browser recovery", () => {
  it("preserves v4 uncertainty and rejects missing, downgraded or unbound markers", async () => {
    const { snapshot } = await recoveryFixture();
    const uncertain = { ...snapshot, version: 4 as const, attachmentDraft: null, pendingReport: null, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32), uncertainTransition: "beginTriage" as const };
    expect((await decryptRecovery(await encryptRecovery(uncertain, password), password)).snapshot).toEqual(uncertain);
    for (const change of [{ uncertainTransition: undefined }, { uncertainTransition: "constructor" }, { uncertainTransition: true }, { mode: "guided-local", contractAddress: null }, { report: null, history: [] }]) {
      await expect(validateRecovery({ ...uncertain, ...change })).rejects.toThrow("Invalid uncertain recovery transition");
    }
    await expect(validateRecovery({ ...uncertain, version: 3 })).rejects.toThrow("require recovery version 4");
    expect((await validateRecovery({ ...uncertain, uncertainTransition: null })).snapshot.uncertainTransition).toBeNull();
  });

  it("preserves pending ciphertext without completed history and rejects inconsistent pending recovery", async () => {
    const { snapshot, sealed } = await recoveryFixture();
    const pending = { ...snapshot, version: 3 as const, attachmentDraft: null, report: null, history: [], pendingReport: { report: snapshot.report!, submissionStarted: false } };
    const restored = await decryptRecovery(await encryptRecovery(pending, password), password);
    expect(restored.snapshot).toEqual(pending);
    expect(restored.sealed).toBeUndefined();
    expect(restored.pendingSeal?.serializedEnvelope).toBe(sealed.serializedEnvelope);
    await expect(validateRecovery({ ...pending, pendingReport: { ...pending.pendingReport, submissionStarted: true } })).rejects.toThrow("Invalid pending");
    await expect(validateRecovery({ ...pending, report: snapshot.report, history: snapshot.history })).rejects.toThrow("completed report history");
    await expect(validateRecovery({ ...pending, pendingReport: { ...pending.pendingReport, report: { ...snapshot.report, salt: "ff".repeat(32) } } })).rejects.toThrow("commitment");
    await expect(validateRecovery({ ...pending, draft: { ...draft, title: "Other report" } })).rejects.toThrow("differs from its draft");
    await expect(validateRecovery({ ...pending, version: 2 })).rejects.toThrow("require recovery version 3");
    const uncertain = { ...pending, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32), pendingReport: { ...pending.pendingReport, submissionStarted: true } };
    expect((await decryptRecovery(await encryptRecovery(uncertain, password), password)).snapshot.pendingReport?.submissionStarted).toBe(true);
  });
  it("round-trips bounded unfinished attachment fields in v2 without interpreting them as sealed metadata", async () => {
    const { snapshot } = await recoveryFixture();
    const updated = { ...snapshot, version: 2 as const, attachmentDraft: { filename: "  draft.bin  ", mediaType: "", size: "not known", digest: "abc" } };
    const encrypted = await encryptRecovery(updated, password);
    expect(encrypted).not.toContain("draft.bin");
    expect((await decryptRecovery(encrypted, password)).snapshot).toEqual(updated);
    await expect(validateRecovery({ ...updated, attachmentDraft: { ...updated.attachmentDraft, size: 3 } })).rejects.toThrow("must be text");
    await expect(validateRecovery({ ...updated, attachmentDraft: { ...updated.attachmentDraft, digest: "x".repeat(4097) } })).rejects.toThrow("4 KiB");
  });
  it("round-trips ownership material without plaintext or identifiers in the outer file", async () => {
    const { snapshot } = await recoveryFixture();
    const encrypted = await encryptRecovery(snapshot, password);
    for (const secret of [password, snapshot.vendorSecret, snapshot.researcherSecret, snapshot.programId, snapshot.report!.key, snapshot.report!.salt, draft.title, draft.researcherContact, snapshot.rationale]) expect(encrypted).not.toContain(secret);
    const restored = await decryptRecovery(encrypted, password);
    expect(restored.snapshot).toEqual(snapshot);
    expect(restored.sealed?.key).toEqual(hexToBytes(snapshot.report!.key));
  });

  it("uses fresh salt and IV on each export", async () => {
    const { snapshot } = await recoveryFixture();
    const first = JSON.parse(await encryptRecovery(snapshot, password));
    const second = JSON.parse(await encryptRecovery(snapshot, password));
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects wrong passwords, tampering and unsupported KDF parameters", async () => {
    const { snapshot } = await recoveryFixture();
    const encrypted = await encryptRecovery(snapshot, password);
    await expect(decryptRecovery(encrypted, "wrong recovery password")).rejects.toThrow("Wrong backup password or damaged recovery file");
    const value = JSON.parse(encrypted);
    value.ciphertext = (value.ciphertext.startsWith("A") ? "B" : "A") + value.ciphertext.slice(1);
    await expect(decryptRecovery(JSON.stringify(value), password)).rejects.toThrow("damaged recovery file");
    value.iterations = 1;
    await expect(decryptRecovery(JSON.stringify(value), password)).rejects.toThrow("Unsupported recovery envelope");
    await expect(encryptRecovery(snapshot, "short")).rejects.toThrow("at least 12 characters");
  });

  it("validates ciphertext/program/report binding independently of file encryption", async () => {
    const { snapshot } = await recoveryFixture();
    await expect(validateRecovery({ ...snapshot, programId: "ff".repeat(32) })).rejects.toThrow("another program");
    await expect(validateRecovery({ ...snapshot, report: { ...snapshot.report, salt: "ee".repeat(32) } })).rejects.toThrow("does not match its commitment");
    await expect(validateRecovery({ ...snapshot, history: ["COMMITTED", "PAYOUT_AUTHORIZED"], status: "PAYOUT_AUTHORIZED" })).rejects.toThrow("invalid transition");
  });

  it("preserves incomplete drafts before a report exists", async () => {
    const { snapshot } = await recoveryFixture();
    const unfinished = { ...snapshot, report: null, history: [], draft: { ...draft, title: "", summary: "", reproductionSteps: [] } };
    const restored = await decryptRecovery(await encryptRecovery(unfinished, password), password);
    expect(restored.snapshot.draft.title).toBe("");
    expect(restored.snapshot.draft.reproductionSteps).toEqual([]);
    expect(restored.sealed).toBeUndefined();
  });

  it("checks both authorities and policy against the ledger and returns newer ledger state", async () => {
    const { snapshot, sealed } = await recoveryFixture();
    const programId = hexToBytes(snapshot.programId);
    const policy = await programConstructor(programId, snapshot.policy);
    const reportId = hexToBytes(snapshot.report!.id);
    const researcherKey = pureCircuits.deriveResearcherKey(programId, reportId, hexToBytes(snapshot.researcherSecret));
    const record = { commitment: reportId, ciphertextDigest: sealed.ciphertextDigest, researcherKey, submissionReceipt: submissionReceipt(reportId, sealed.ciphertextDigest, researcherKey), status: 7, severity: 3n,
      decisionDigest: new Uint8Array(32), patchCommitment: new Uint8Array(32), retestCommitment: new Uint8Array(32), retestPassed: false, payoutReceipt: new Uint8Array(32), rewardTier: 0n, createdSequence: 1n, updatedSequence: 2n };
    const ledger = { ...policy, ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member: () => true, lookup: () => record } } as unknown as Ledger;
    const current = await verifyRecoveryLedger(snapshot, sealed, ledger);
    expect(current?.status).toBe(7);
    await expect(verifyRecoveryLedger({ ...snapshot, vendorSecret: "ff".repeat(32) }, sealed, ledger)).rejects.toThrow("owner authority");
    await expect(verifyRecoveryLedger({ ...snapshot, researcherSecret: "ff".repeat(32) }, sealed, ledger)).rejects.toThrow("researcher authority");
    await expect(verifyRecoveryLedger({ ...snapshot, policy: { ...snapshot.policy, responseDays: 14 } }, sealed, ledger)).rejects.toThrow("responsePolicyDigest");
    await expect(verifyRecoveryLedger(snapshot, sealed, { ...ledger, reports: { ...ledger.reports, member: () => false } })).rejects.toThrow("absent");
    await expect(verifyRecoveryLedger(snapshot, undefined, ledger)).rejects.toThrow("decryption material is missing");
    await expect(verifyRecoveryLedger(snapshot, sealed, { ...ledger, reports: { ...ledger.reports, lookup: () => ({ ...record, submissionReceipt: new Uint8Array(32) }) } })).rejects.toThrow("submission receipt");
  });

  it.each([false, true])("refuses an already-present prepared report without treating submissionStarted=%s as retry authority", async (submissionStarted) => {
    const { snapshot } = await recoveryFixture();
    const programId = hexToBytes(snapshot.programId);
    const policy = await programConstructor(programId, snapshot.policy);
    const pending = { ...snapshot, version: 3 as const, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32), report: null, history: [], pendingReport: { report: snapshot.report!, submissionStarted } };
    const member = vi.fn(() => true);
    const ledger = { ...policy, ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member } } as unknown as Ledger;
    await expect(verifyRecoveryLedger(pending, undefined, ledger)).rejects.toThrow("prepared report already exists");
    expect(member).toHaveBeenCalledWith(hexToBytes(snapshot.report!.id));
    member.mockReturnValue(false);
    await expect(verifyRecoveryLedger(pending, undefined, ledger)).resolves.toBeUndefined();
    expect(pending.pendingReport.submissionStarted).toBe(submissionStarted);
  });
});
