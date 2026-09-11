// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { submissionWait, SUBMISSION_CONFIRMATION_TIMEOUT_MS, SUBMISSION_PREPARATION_TIMEOUT_MS, SubmissionPreparationTimeout, SubmissionConfirmationTimeout } from "./submission-wait.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(["resolve", "reject"])("starts confirmation at the saved checkpoint and ignores late %s", async (outcome) => {
  vi.useFakeTimers();
  const wait = submissionWait();
  let finish!: (value: string) => void;
  let fail!: (error: Error) => void;
  const continuation = vi.fn();
  const result = wait.run(() => new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; })).then(continuation).catch((error: unknown) => error);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(SUBMISSION_PREPARATION_TIMEOUT_MS - 1);
  wait.checkpoint("saved-id");
  await vi.advanceTimersByTimeAsync(SUBMISSION_CONFIRMATION_TIMEOUT_MS - 1);
  let settled = false; void result.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBeInstanceOf(SubmissionConfirmationTimeout);
  expect(await result).toMatchObject({ transactionId: "saved-id" });
  if (outcome === "resolve") finish("late-finalization"); else fail(new Error("late error"));
  await vi.advanceTimersByTimeAsync(0);
  expect(continuation).not.toHaveBeenCalled();
  expect(() => wait.checkpoint("another-id")).toThrow("closed");
  expect(vi.getTimerCount()).toBe(0);
});

it("returns timely results, preserves failures and clears deadlines", async () => {
  vi.useFakeTimers();
  const success = submissionWait();
  await expect(success.run(async () => { success.checkpoint("id"); return "finalized"; })).resolves.toBe("finalized");
  const failure = submissionWait(), error = new Error("Wallet refused");
  await expect(failure.run(async () => { failure.checkpoint("id"); throw error; })).rejects.toBe(error);
  expect(failure.transactionId).toBe("id");
  const beforeCheckpoint = submissionWait();
  await expect(beforeCheckpoint.run(() => { throw error; })).rejects.toBe(error);
  expect(beforeCheckpoint.transactionId).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["timeout", "cancel"])("blocks a late durable checkpoint after preparation %s", async (reason) => {
  vi.useFakeTimers(); const wait = submissionWait();
  let finish!: () => void; const broadcast = vi.fn();
  const result = wait.run(async () => { await new Promise<void>(resolve => { finish = resolve; }); wait.checkpoint("late-id"); broadcast(); }).catch((error: unknown) => error);
  if (reason === "timeout") await vi.advanceTimersByTimeAsync(SUBMISSION_PREPARATION_TIMEOUT_MS);
  else wait.cancel();
  const error = await result;
  if (reason === "timeout") expect(error).toBeInstanceOf(SubmissionPreparationTimeout);
  expect(wait.transactionId).toBeUndefined();
  finish(); await vi.advanceTimersByTimeAsync(0);
  expect(broadcast).not.toHaveBeenCalled();
  expect(() => wait.assertActive()).toThrow("closed");
  expect(vi.getTimerCount()).toBe(0);
});

it("can cancel an unused wait without invoking an action", async () => {
  const wait = submissionWait(), action = vi.fn(); wait.cancel();
  await expect(wait.run(action)).rejects.toThrow("cannot be reused");
  expect(action).not.toHaveBeenCalled();
});


it.each((["wall", "monotonic"] as const).flatMap(clock => (["checkpoint", "preparation result", "confirmation result"] as const).map(boundary => ({ clock, boundary }))))("rejects $boundary when the $clock clock expires before the timer callback", async ({ clock, boundary }) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
    let monotonic = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    const wait = submissionWait(), accepted = vi.fn(), broadcast = vi.fn();
    let finish!: () => void;
    const result = wait.run(async () => {
      if (boundary === "confirmation result") wait.checkpoint("saved-id");
      await new Promise<void>(resolve => { finish = resolve; });
      if (boundary === "checkpoint") { wait.checkpoint("late-id"); broadcast(); }
      return "late SDK result";
    }).then(accepted).catch((error: unknown) => error);
    const duration = boundary === "confirmation result" ? SUBMISSION_CONFIRMATION_TIMEOUT_MS : SUBMISSION_PREPARATION_TIMEOUT_MS;
    if (clock === "wall") vi.setSystemTime(Date.now() + duration);
    else { monotonic = duration; vi.setSystemTime(Date.now() - 60_000); }
    // Do not execute scheduled timers: the SDK continuation wins scheduling order.
    finish();
    expect(await result).toBeInstanceOf(boundary === "confirmation result" ? SubmissionConfirmationTimeout : SubmissionPreparationTimeout);
    expect(accepted).not.toHaveBeenCalled(); expect(broadcast).not.toHaveBeenCalled();
    expect(wait.transactionId).toBe(boundary === "confirmation result" ? "saved-id" : undefined);
    expect(vi.getTimerCount()).toBe(0);
    now.mockRestore(); vi.useRealTimers();
});


it.each([false, true])("reports a deadline instead of a late SDK rejection (checkpoint=%s)", async checkpoint => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
  const wait = submissionWait(); let fail!: (cause: Error) => void;
  const result = wait.run(() => {
    if (checkpoint) wait.checkpoint("saved-id");
    return new Promise<void>((_resolve, reject) => { fail = reject; });
  }).catch((cause: unknown) => cause);
  vi.setSystemTime(Date.now() + (checkpoint ? SUBMISSION_CONFIRMATION_TIMEOUT_MS : SUBMISSION_PREPARATION_TIMEOUT_MS));
  fail(new Error("Late SDK rejection"));
  expect(await result).toBeInstanceOf(checkpoint ? SubmissionConfirmationTimeout : SubmissionPreparationTimeout);
  expect(wait.transactionId).toBe(checkpoint ? "saved-id" : undefined);
  expect(vi.getTimerCount()).toBe(0);
});
