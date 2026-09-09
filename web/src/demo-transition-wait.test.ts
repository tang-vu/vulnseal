// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { demoTransitionWait, DEMO_TRANSITION_TIMEOUT_MS } from "./demo-transition-wait.js";

afterEach(() => vi.useRealTimers());

it("does not submit when timed-out preparation resolves later", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const submit = vi.fn().mockResolvedValue("receipt");
  const result = demoTransitionWait(() => new Promise<void>((resolve) => { finish = resolve; }), submit);
  const rejected = expect(result).rejects.toThrow("outcome is unknown");
  await vi.advanceTimersByTimeAsync(DEMO_TRANSITION_TIMEOUT_MS);
  await rejected;
  finish();
  await Promise.resolve();
  expect(submit).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores late confirmation without retrying or applying a receipt", async () => {
  vi.useFakeTimers();
  let finish!: (value: string) => void;
  const submit = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
  const receipt = vi.fn();
  const result = demoTransitionWait(async () => {}, submit).then(receipt);
  const rejected = expect(result).rejects.toThrow("do not resubmit");
  await vi.advanceTimersByTimeAsync(DEMO_TRANSITION_TIMEOUT_MS);
  await rejected;
  finish("late receipt");
  await Promise.resolve();
  expect(receipt).not.toHaveBeenCalled();
  expect(submit).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("returns timely confirmation and clears the timer on preparation failure", async () => {
  vi.useFakeTimers();
  await expect(demoTransitionWait(async () => {}, async () => "receipt")).resolves.toBe("receipt");
  const submit = vi.fn();
  await expect(demoTransitionWait(async () => { throw new Error("setup failed"); }, submit)).rejects.toThrow("setup failed");
  expect(submit).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
