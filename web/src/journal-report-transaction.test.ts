// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { recoveryFixture } from "./test/recovery-fixture.js";
import { defaultProgramDraft } from "./program.js";
import { validateRecovery, uncertainCircuits, type RecoverySnapshot } from "./recovery.js";
import { journalReportTransaction } from "./journal-report-transaction.js";
import { submissionWait, SUBMISSION_PREPARATION_TIMEOUT_MS } from "./submission-wait.js";
import type { ReportStatusName } from "@vulnseal/shared";
import type { ReportAttempt } from "./report-journal.js";
const id = "00" + "ab".repeat(32);
afterEach(() => vi.restoreAllMocks());
async function setup(circuit: ReportAttempt["circuit"] = "beginTriage") {
  const { snapshot: source } = await recoveryFixture();
  const snapshot: RecoverySnapshot = { ...source, version: 5, mode: "midnight", network: "preprod", contractAddress: "cd".repeat(32), programDraft: defaultProgramDraft, attachmentDraft: null, pendingReport: null, uncertainTransition: circuit === "submitReport" ? null : circuit };
  const material = snapshot.report!;
  const intent: RecoverySnapshot = circuit === "submitReport" ? { ...snapshot, report: null, history: [], pendingReport: { report: material, submissionStarted: true } } : snapshot;
  const saves: RecoverySnapshot[] = [], sequence: string[] = [];
  const lease = { save: vi.fn(async (value: RecoverySnapshot) => { saves.push(structuredClone(value)); sequence.push("save"); return { id: "copy", label: "Copy", revision: saves.length, updatedAt: "now", encrypted: "synthetic" }; }), release: vi.fn(), stop: vi.fn() };
  let checkpoint!: (id: string) => Promise<void>;
  const options = { snapshot: intent, circuit, reportId: material.id, nextStatus: ({ submitReport: "COMMITTED", beginTriage: "TRIAGED", acceptReport: "ACCEPTED", rejectReport: "REJECTED", anchorPatch: "PATCH_READY", submitRetest: "RETEST_PASSED", authorizePayout: "PAYOUT_AUTHORIZED", closeReport: "CLOSED" } as Record<string, ReportStatusName>)[circuit]!, lease, wait: submissionWait(), prepare: vi.fn(async () => { sequence.push("prepare"); }), submit: vi.fn(async () => { await checkpoint(id); sequence.push("broadcast"); return { circuit, txId: id, blockHeight: "10" }; }), installCheckpoint: (value: typeof checkpoint) => { checkpoint = value; }, onAttempts: vi.fn(), onWarning: vi.fn(), assertCurrent: vi.fn() };
  return { options, saves, sequence, checkpoint: (value = id) => checkpoint(value) };
}
it.each(["submitReport", ...uncertainCircuits] as const)("journals %s intent, identifier and matching SDK result in order", async circuit => {
  const { options, saves, sequence } = await setup(circuit);
  await expect(journalReportTransaction(options)).resolves.toMatchObject({ txId: id });
  expect(sequence).toEqual(["save", "prepare", "save", "broadcast", "save"]);
  expect(saves.map(value => value.reportAttempts!.at(-1)!.outcome)).toEqual(["unknown", "unknown", "sdk-confirmed"]);
  expect(saves[0]!.reportAttempts![0]!.transactionId).toBeUndefined();
  expect(saves[1]!.reportAttempts![0]!.transactionId).toBe(id);
  for (const value of saves) expect((await validateRecovery(value)).snapshot).toEqual(value);
  expect(options.lease.release).toHaveBeenCalledOnce(); expect(options.lease.stop).not.toHaveBeenCalled();
});
it.each(["intent", "identifier"])("never broadcasts after an unconfirmed %s save", async stage => {
  const { options, sequence, checkpoint } = await setup();
  const realSave = options.lease.save.getMockImplementation()!;
  options.lease.save.mockImplementation(async value => { if ((stage === "identifier") === Boolean(value.reportAttempts![0]!.transactionId)) throw new Error("Synthetic quota failure"); return realSave(value); });
  await expect(journalReportTransaction(options)).rejects.toThrow("Synthetic quota failure");
  expect(sequence).not.toContain("broadcast"); expect(options.lease.stop).toHaveBeenCalledOnce();
  await expect(checkpoint()).rejects.toThrow("closed");
});
it.each(["timeout", "unmount"])("closes a delayed identifier save after %s", async reason => {
  const { options, sequence, checkpoint } = await setup();
  let finish!: () => void;
  const original = options.lease.save.getMockImplementation()!;
  options.lease.save.mockImplementation(async value => { if (value.reportAttempts![0]!.transactionId) await new Promise<void>(resolve => { finish = resolve; }); return original(value); });
  const timers = vi.spyOn(globalThis, "setTimeout");
  const result = journalReportTransaction(options); const rejection = expect(result).rejects.toThrow();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  if (reason === "unmount") options.wait.cancel();
  else (timers.mock.calls.find(([, duration]) => duration === SUBMISSION_PREPARATION_TIMEOUT_MS)![0] as () => void)();
  await rejection; finish(); await Promise.resolve(); await Promise.resolve();
  expect(sequence).not.toContain("broadcast"); await expect(checkpoint()).rejects.toThrow("closed");
});
it.each(["missing checkpoint", "wrong identifier", "wrong circuit", "duplicate checkpoint", "malformed identifier"])("keeps an uncertain journal for %s", async fault => {
  const { options, checkpoint } = await setup();
  options.submit.mockImplementation(async () => {
    if (fault !== "missing checkpoint") await checkpoint(fault === "malformed identifier" ? "bad" : id);
    if (fault === "duplicate checkpoint") await checkpoint();
    return { circuit: fault === "wrong circuit" ? "closeReport" : options.circuit, txId: fault === "wrong identifier" ? "ef".repeat(32) : id, blockHeight: "10" };
  });
  await expect(journalReportTransaction(options)).rejects.toThrow();
  expect(options.onAttempts.mock.calls.at(-1)![0].at(-1)!.outcome).toBe("unknown"); expect(options.lease.stop).toHaveBeenCalledOnce();
});
it("preserves matching SDK confirmation when the final recovery write fails", async () => {
  const { options } = await setup();
  const original = options.lease.save.getMockImplementation()!;
  options.lease.save.mockImplementation(async value => { if (value.reportAttempts![0]!.outcome === "sdk-confirmed") throw new Error("Final copy failed"); return original(value); });
  await expect(journalReportTransaction(options)).resolves.toMatchObject({ txId: id });
  expect(options.onWarning).toHaveBeenCalledWith(expect.stringContaining("Final copy failed"));
  expect(options.onAttempts.mock.calls.at(-1)![0][0]!.outcome).toBe("sdk-confirmed");
});
it("rejects altered journal bindings, identifiers, legacy fields and unresolved history", async () => {
  const { options, saves } = await setup(); await journalReportTransaction(options);
  const unknown = saves[1]!, confirmed = saves[2]!, attempt = unknown.reportAttempts![0]!;
  for (const reportAttempts of [[], [{ ...attempt, request: { ...attempt.request, nextStatus: "CLOSED" } }], [{ ...attempt, request: { ...attempt.request, severity: 5 } }], [{ ...attempt, reportId: "ef".repeat(32) }], [{ ...attempt, circuit: "closeReport" }], [{ ...attempt, transactionId: "a".repeat(65) }], [{ ...attempt, startedAt: "yesterday" }], [{ ...attempt, extra: true }], [attempt, attempt], [{ ...attempt, outcome: "sdk-confirmed", transactionId: undefined }]]) await expect(validateRecovery({ ...unknown, reportAttempts })).rejects.toThrow();
  await expect(validateRecovery({ ...unknown, version: 5 })).rejects.toThrow("version 8");
  await expect(validateRecovery({ ...confirmed, reportAttempts: [confirmed.reportAttempts![0], confirmed.reportAttempts![0]] })).rejects.toThrow("duplicate");
});


it.each(["full", "unresolved"])("rejects a %s journal without installing a checkpoint or changing attempts", async reason => {
  const { options } = await setup();
  const attempt: ReportAttempt = { circuit: "beginTriage", reportId: options.reportId, startedAt: "2026-09-11T00:00:00.000Z", outcome: reason === "full" ? "sdk-confirmed" : "unknown", transactionId: id, request: { nextStatus: "TRIAGED", severity: 3, rationale: "Old decision", patchReference: "", retestNotes: "" } };
  options.snapshot = { ...options.snapshot, reportAttempts: Array.from({ length: reason === "full" ? 1000 : 1 }, (_, index) => ({ ...attempt, transactionId: (index + 1).toString(16).padStart(64, "0") })) };
  const install = vi.fn(); options.installCheckpoint = install;
  await expect(journalReportTransaction(options)).rejects.toThrow(reason === "full" ? "1,000-entry limit" : "unresolved attempt");
  expect(options.lease.release).toHaveBeenCalledOnce(); expect(options.lease.stop).not.toHaveBeenCalled();
  expect(install).not.toHaveBeenCalled(); expect(options.onAttempts).not.toHaveBeenCalled();
  expect(options.lease.save).not.toHaveBeenCalled(); expect(options.prepare).not.toHaveBeenCalled(); expect(options.submit).not.toHaveBeenCalled();
});
it("records the last available attempt without losing the preceding 999 entries", async () => {
  const { options, saves } = await setup();
  const previous: ReportAttempt[] = Array.from({ length: 999 }, (_, index) => ({ circuit: "beginTriage", reportId: options.reportId, startedAt: "2026-09-11T00:00:00.000Z", outcome: "sdk-confirmed", transactionId: (index + 1).toString(16).padStart(64, "0"), request: { nextStatus: "TRIAGED", severity: 3, rationale: `Old decision ${index}`, patchReference: "", retestNotes: "" } }));
  options.snapshot = { ...options.snapshot, reportAttempts: previous };
  await journalReportTransaction(options);
  for (const snapshot of saves) {
    expect(snapshot.reportAttempts).toHaveLength(1000);
    expect(snapshot.reportAttempts!.slice(0, 999)).toEqual(previous);
    expect((await validateRecovery(snapshot)).snapshot).toEqual(snapshot);
  }
});
