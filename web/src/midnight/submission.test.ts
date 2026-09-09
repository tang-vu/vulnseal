// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import type { FinalizedTransaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { SubmissionOutcomeUnknown, submitIdentifiedTransaction } from "./submission.js";

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
  expect(submit).toHaveBeenCalledExactlyOnceWith("010203");
});
