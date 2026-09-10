// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { submissionWait, SUBMISSION_CONFIRMATION_TIMEOUT_MS, SubmissionConfirmationTimeout } from "./submission-wait.js";

afterEach(() => vi.useRealTimers());

it.each(["resolve", "reject"])("starts only at the saved checkpoint and ignores late %s", async (outcome) => {
  vi.useFakeTimers();
  const wait = submissionWait();
  let finish!: (value: string) => void;
  let fail!: (error: Error) => void;
  const continuation = vi.fn();
  const result = wait.run(() => new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; })).then(continuation).catch((error: unknown) => error);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(SUBMISSION_CONFIRMATION_TIMEOUT_MS * 2);
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
