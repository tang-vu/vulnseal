// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { fetchZkArtifact, ZK_ARTIFACT_TIMEOUT_MS } from "./fetch-zk-artifact.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("returns exact binary bytes with a bounded fetch and no remaining timer", async () => {
  vi.useFakeTimers();
  const fetcher = vi.spyOn(window, "fetch").mockResolvedValue(new Response(Uint8Array.of(0, 255, 128, 1)));
  const response = await fetchZkArtifact("https://example.test/keys/report.prover", { method: "GET" });
  expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0, 255, 128, 1]);
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", redirect: "error", signal: expect.any(AbortSignal) });
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds missing headers and discards a response arriving after the deadline", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const fetcher = vi.spyOn(window, "fetch").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const result = fetchZkArtifact("https://example.test/keys/report.prover").catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(ZK_ARTIFACT_TIMEOUT_MS);
  expect(await result).toMatchObject({ message: expect.stringContaining("download timed out") });
  expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  const cancel = vi.fn();
  finish(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the deadline active while a successful response body stalls", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  vi.spyOn(window, "fetch").mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(1)); }, cancel })));
  const result = fetchZkArtifact("https://example.test/zkir/report.bzkir").catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(ZK_ARTIFACT_TIMEOUT_MS);
  expect(await result).toMatchObject({ message: expect.stringContaining("download timed out") });
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects streamed overflow even when content-length claims a small response", async () => {
  const cancel = vi.fn();
  const chunk = new Uint8Array(1024 * 1024);
  vi.spyOn(window, "fetch").mockResolvedValue(new Response(new ReadableStream({
    pull(controller) { controller.enqueue(chunk); }, cancel,
  }), { headers: { "content-length": "1" } }));
  await expect(fetchZkArtifact("https://example.test/keys/report.prover")).rejects.toThrow("64 MiB");
  expect(cancel).toHaveBeenCalledOnce();
});

it.each([{ status: 503, headers: {} }, { status: 200, headers: { "content-type": "text/html" } }])("preserves SDK diagnostics and cancels error bodies: $status $headers", async (options) => {
  const cancel = vi.fn();
  vi.spyOn(window, "fetch").mockResolvedValue(new Response(new ReadableStream({ cancel }), options));
  const response = await fetchZkArtifact("https://example.test/keys/report.prover");
  expect(response.status).toBe(options.status);
  expect(response.headers.get("content-type")).toBe(options.headers["content-type"] ?? null);
  expect(cancel).toHaveBeenCalledOnce();
});
