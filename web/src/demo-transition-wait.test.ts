// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { demoTransitionWait, DEMO_TRANSITION_TIMEOUT_MS } from "./demo-transition-wait.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

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



const lateCases = (["wall", "monotonic"] as const).flatMap(clock => (["prepare", "submit"] as const).flatMap(phase => (["resolve", "reject"] as const).map(outcome => ({ clock, phase, outcome }))));
it.each(lateCases)("rejects late $phase $outcome using the $clock clock before timer dispatch", async ({ clock, phase, outcome }) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
  let monotonic = 0; vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  let finish!: () => void;
  const pending = new Promise<string>((resolve, reject) => { finish = () => outcome === "resolve" ? resolve("late result") : reject(new Error("Late SDK rejection")); });
  const submit = vi.fn(phase === "submit" ? () => pending : async () => "receipt"), accepted = vi.fn();
  const result = demoTransitionWait(phase === "prepare" ? () => pending : async () => {}, submit).then(accepted).catch((cause: unknown) => cause);
  await Promise.resolve();
  if (clock === "wall") vi.setSystemTime(Date.now() + DEMO_TRANSITION_TIMEOUT_MS);
  else { monotonic = DEMO_TRANSITION_TIMEOUT_MS; vi.setSystemTime(Date.now() - 60_000); }
  finish();
  const error = await result;
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("outcome is unknown");
  expect(submit).toHaveBeenCalledTimes(phase === "submit" ? 1 : 0);
  expect(accepted).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
