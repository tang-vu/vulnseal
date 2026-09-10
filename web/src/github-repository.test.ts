// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { fetchPublicRepository, repositoryCoordinates, GITHUB_REFERENCE_TIMEOUT_MS } from "./github-repository.js";
const url = "https://github.com/octocat/Hello-World";
const metadata = { full_name: "octocat/Hello-World", html_url: url, private: false, visibility: "public", archived: false, disabled: false };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each(["http://github.com/a/b", "https://github.com.evil/a/b", "https://secret@github.com/a/b", "https://github.com/a/b?token=secret", "https://github.com/a/b#private", "https://github.com/a/b/issues", "https://github.com/a/%2e%2e", "https://github.com/a/.."])("rejects unsafe or non-repository URLs before fetch: %s", async input => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(fetchPublicRepository(input, new AbortController().signal)).rejects.toThrow("public repository URL");
  expect(fetcher).not.toHaveBeenCalled();
});
it("requests only public metadata and returns a validated reference", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata))); vi.stubGlobal("fetch", fetcher);
  expect(repositoryCoordinates(` ${url}/ `)).toBe("octocat/Hello-World");
  await expect(fetchPublicRepository(url, new AbortController().signal)).resolves.toEqual({ fullName: metadata.full_name, url, archived: false });
  expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/octocat/Hello-World", expect.objectContaining({ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }));
  expect(fetcher.mock.calls[0]![1]).not.toHaveProperty("body");
  expect(fetcher.mock.calls[0]![1].headers).not.toHaveProperty("Authorization");
});
it.each([{ private: true }, { visibility: "private" }, { disabled: true }, { full_name: "elsewhere/Hello-World" }, { html_url: "https://evil.test/" }])("rejects mismatched or non-public metadata: %j", async override => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...metadata, ...override }))));
  await expect(fetchPublicRepository(url, new AbortController().signal)).rejects.toThrow("did not confirm");
});
it.each([403, 404, 429])("rejects HTTP %i without using the error body", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("untrusted", { status })));
  await expect(fetchPublicRepository(url, new AbortController().signal)).rejects.toThrow(/lookup|limit/);
});
it("bounds received bytes and cancels an oversized body", async () => {
  const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array(256 * 1024 + 1)); }, cancel }))));
  await expect(fetchPublicRepository(url, new AbortController().signal)).rejects.toThrow("256 KiB"); expect(cancel).toHaveBeenCalledOnce();
});
it("bounds a stalled body and aborts its request", async () => {
  vi.useFakeTimers(); const cancel = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))); vi.stubGlobal("fetch", fetcher);
  const result = expect(fetchPublicRepository(url, new AbortController().signal)).rejects.toThrow("15 seconds");
  await vi.advanceTimersByTimeAsync(GITHUB_REFERENCE_TIMEOUT_MS); await result;
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("rejects pre-cancellation without issuing a request", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const controller = new AbortController(); controller.abort();
  await expect(fetchPublicRepository(url, controller.signal)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it.each([new Uint8Array([255]), new TextEncoder().encode("<html>Not metadata</html>")])("rejects invalid encoding or JSON", async body => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(fetchPublicRepository(url, new AbortController().signal)).rejects.toThrow("invalid repository metadata");
});
