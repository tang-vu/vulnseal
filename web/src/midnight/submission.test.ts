// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import type { FinalizedTransaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { SubmissionOutcomeUnknown, submitIdentifiedTransaction, WALLET_SUBMISSION_TIMEOUT_MS } from "./submission.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const id = "12".repeat(32);
const transaction = (identifiers: string[] = [id]) => ({ identifiers: vi.fn(() => identifiers), serialize: vi.fn(() => Uint8Array.of(1, 2, 3)) });

it("rejects a missing identifier before serialization or wallet submission", async () => {
  const tx = transaction([]), submit = vi.fn();
  await expect(submitIdentifiedTransaction(tx as unknown as FinalizedTransaction, submit)).rejects.toThrow("it was not submitted");
  expect(tx.serialize).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
});

it("does not call the wallet if local transaction serialization fails", async () => {
  const tx = transaction(), submit = vi.fn();
  tx.serialize.mockImplementation(() => { throw new Error("Cannot serialize"); });
  await expect(submitIdentifiedTransaction(tx as unknown as FinalizedTransaction, submit)).rejects.toThrow("Cannot serialize");
  expect(submit).not.toHaveBeenCalled();
});

it("captures identity before broadcasting and preserves it when the connector response fails", async () => {
  const tx = transaction(), cause = new Error("Connection lost");
  const submit = vi.fn(async (serialized: string) => {
    expect(tx.identifiers).toHaveBeenCalledTimes(1); expect(serialized).toBe("010203");
    throw cause;
  });
  const result = await submitIdentifiedTransaction(tx as unknown as FinalizedTransaction, submit).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(SubmissionOutcomeUnknown);
  expect(result).toMatchObject({ transactionId: id, cause });
  expect((result as Error).message).toContain(id);
  expect((result as Error).message).toContain("before submitting again");
  expect(submit).toHaveBeenCalledTimes(1);
});

it("returns the original identifier after one successful connector submission", async () => {
  const tx = transaction(), submit = vi.fn().mockResolvedValue(undefined);
  expect(await submitIdentifiedTransaction(tx as unknown as FinalizedTransaction, submit)).toBe(id);
  expect(submit).toHaveBeenCalledExactlyOnceWith("010203", expect.any(AbortSignal), expect.any(Function));
});

it.each(["resolve", "reject"])("ends a stalled connector wait as unknown without retrying when it later %ss", async (completion) => {
  vi.useFakeTimers();
  let settle!: () => void;
  const submit = vi.fn((_serialized: string, _signal: AbortSignal) => new Promise<void>((resolve, reject) => { settle = completion === "resolve" ? resolve : () => reject(new Error("Late connector failure")); }));
  const checkpoint = vi.fn().mockResolvedValue(undefined);
  const pending = submitIdentifiedTransaction(transaction() as unknown as FinalizedTransaction, submit, checkpoint).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(WALLET_SUBMISSION_TIMEOUT_MS);
  const result = await pending;
  expect(result).toBeInstanceOf(SubmissionOutcomeUnknown);
  expect(result).toMatchObject({ transactionId: id, cause: { message: expect.stringContaining("deadline exceeded") } });
  expect(checkpoint).toHaveBeenCalledExactlyOnceWith(id);
  expect(submit.mock.calls[0]![1].aborted).toBe(true);
  settle(); await Promise.resolve();
  expect(await pending).toBe(result);
  expect(submit).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start the connector deadline while awaiting the durable checkpoint", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const checkpoint = () => new Promise<void>((resolve) => { release = resolve; });
  const submit = vi.fn().mockResolvedValue(undefined);
  const pending = submitIdentifiedTransaction(transaction() as unknown as FinalizedTransaction, submit, checkpoint);
  await vi.advanceTimersByTimeAsync(WALLET_SUBMISSION_TIMEOUT_MS * 2);
  expect(submit).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  release(); expect(await pending).toBe(id);
  expect(submit).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("awaits a durable checkpoint and never broadcasts if checkpoint persistence fails", async () => {
  const tx = transaction(), submit = vi.fn();
  const checkpoint = vi.fn(async () => { throw new Error("Storage quota exceeded"); });
  await expect(submitIdentifiedTransaction(tx as unknown as FinalizedTransaction, submit, checkpoint)).rejects.toThrow("Storage quota exceeded");
  expect(checkpoint).toHaveBeenCalledExactlyOnceWith(id); expect(submit).not.toHaveBeenCalled();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const saving = vi.fn(() => wait);
  const pending = submitIdentifiedTransaction(tx as unknown as FinalizedTransaction, submit, saving);
  expect(saving).toHaveBeenCalledOnce(); expect(submit).not.toHaveBeenCalled();
  release(); await pending; expect(submit).toHaveBeenCalledOnce();
});


for (const clock of ["wall", "monotonic"] as const) it.each(["resolve", "reject"])(`keeps a late connector %s unknown after ${clock} expiry without dispatching timers`, async outcome => {
  vi.useFakeTimers();
  let wall = 1_000_000, monotonic = 100;
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  let finish!: () => void;
  const submit = vi.fn((_serialized: string, _signal: AbortSignal) => new Promise<void>((resolve, reject) => { finish = outcome === "resolve" ? resolve : () => reject(new Error("Late connector error")); }));
  const result = submitIdentifiedTransaction(transaction() as never, submit).catch((cause: unknown) => cause);
  for (let n = 0; n < 8; n++) await Promise.resolve();
  if (clock === "wall") wall += WALLET_SUBMISSION_TIMEOUT_MS; else { monotonic += WALLET_SUBMISSION_TIMEOUT_MS; wall -= WALLET_SUBMISSION_TIMEOUT_MS; }
  finish();
  expect(await result).toMatchObject({ transactionId: id, cause: { message: expect.stringContaining("deadline exceeded") } });
  expect(submit).toHaveBeenCalledOnce(); expect(submit.mock.calls[0]![1].aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
