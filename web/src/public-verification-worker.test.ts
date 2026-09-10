// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PUBLIC_LOOKUP_WORKER_TIMEOUT_MS, verifyPublicContractInWorker } from "./public-verification-worker.js";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}
const endpoints = { indexerUrl: "https://indexer.example.test", rpcUrl: "https://rpc.example.test" };
beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("posts only public lookup input and terminates after a successful response", async () => {
  const pending = verifyPublicContractInWorker("ab".repeat(32), endpoints);
  const worker = FakeWorker.instances[0]!;
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ address: "ab".repeat(32), endpoints });
  worker.onmessage!({ data: { result: { programId: "01".repeat(32) } } } as MessageEvent);
  await expect(pending).resolves.toEqual({ programId: "01".repeat(32) });
  expect(worker.terminate).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it("rejects and terminates an unresponsive worker and ignores its late result", async () => {
  const pending = verifyPublicContractInWorker("ab".repeat(32), endpoints);
  const rejected = expect(pending).rejects.toThrow("Public lookup timed out");
  const worker = FakeWorker.instances[0]!;
  await vi.advanceTimersByTimeAsync(PUBLIC_LOOKUP_WORKER_TIMEOUT_MS); await rejected;
  worker.onmessage!({ data: { result: {} } } as MessageEvent);
  expect(worker.terminate).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it.each([false, true])("handles cancellation before/after worker creation (%s)", async before => {
  const controller = new AbortController(); if (before) controller.abort();
  const pending = verifyPublicContractInWorker("ab".repeat(32), endpoints, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await rejected;
  expect(FakeWorker.instances).toHaveLength(before ? 0 : 1);
  if (!before) expect(FakeWorker.instances[0]!.terminate).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["error", "messageerror", "empty"])("cleans up a failed worker response: %s", async kind => {
  const pending = verifyPublicContractInWorker("ab".repeat(32), endpoints);
  const rejected = expect(pending).rejects.toThrow(); const worker = FakeWorker.instances[0]!;
  if (kind === "error") worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
  else if (kind === "messageerror") worker.onmessageerror!();
  else worker.onmessage!({ data: null } as MessageEvent);
  await rejected; expect(worker.terminate).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
