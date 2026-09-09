// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import type { ProofProvider } from "@midnight-ntwrk/midnight-js-types";
import { boundedProofProvider, PROOF_GENERATION_TIMEOUT_MS } from "./bounded-proof-provider.js";

afterEach(() => vi.useRealTimers());

it("passes transaction/config through, returns the proof and clears the deadline", async () => {
  vi.useFakeTimers();
  const transaction = {} as Parameters<ProofProvider["proveTx"]>[0];
  const proof = {} as Awaited<ReturnType<ProofProvider["proveTx"]>>;
  const config = { timeout: 1234 };
  const proveTx = vi.fn().mockResolvedValue(proof);
  expect(await boundedProofProvider({ proveTx }).proveTx(transaction, config)).toBe(proof);
  expect(proveTx).toHaveBeenCalledExactlyOnceWith(transaction, config);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["resolve", "reject"])("does not balance or submit when an expired proof later %ss", async (outcome) => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  let fail!: (error: Error) => void;
  const proveTx = vi.fn().mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; })).mockResolvedValue({});
  const provider = boundedProofProvider({ proveTx });
  const balance = vi.fn().mockResolvedValue({});
  const submit = vi.fn().mockResolvedValue("transaction-id");
  const result = provider.proveTx({} as never).then(balance).then(submit).catch((error: unknown) => error);
  let settled = false;
  void result.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(PROOF_GENERATION_TIMEOUT_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ message: expect.stringContaining("Proof generation timed out") });
  if (outcome === "resolve") finish({});
  else fail(new Error("Late proof failure"));
  await vi.advanceTimersByTimeAsync(0);
  expect(balance).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(proveTx).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  // A separate explicit call is possible; expiry does not schedule a retry.
  await expect(provider.proveTx({} as never)).resolves.toEqual({});
  expect(proveTx).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])("preserves a provider error and clears the timer (synchronous: %s)", async (synchronous) => {
  vi.useFakeTimers();
  const error = new Error("Proof server refused transaction");
  const proveTx = vi.fn(() => { if (synchronous) throw error; return Promise.reject(error); });
  await expect(boundedProofProvider({ proveTx }).proveTx({} as never)).rejects.toBe(error);
  expect(vi.getTimerCount()).toBe(0);
});
