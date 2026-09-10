// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { fetchPublicRepository, repositoryCoordinates, GITHUB_REFERENCE_TIMEOUT_MS } from "./github-repository.js";
const url = "https://github.com/octocat/Hello-World";
const metadata = { full_name: "octocat/Hello-World", html_url: url, private: false, visibility: "public", archived: false, disabled: false };
const sha = "ab".repeat(20);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("pins a public repository to its SHA-only HEAD response", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(metadata))).mockResolvedValueOnce(new Response(`${sha}\n`)); vi.stubGlobal("fetch", fetcher);
  await expect(fetchPublicRepository(url, new AbortController().signal, true)).resolves.toEqual({ fullName: metadata.full_name, url: `${url}/tree/${sha}`, archived: false, commitSha: sha });
  expect(fetcher).toHaveBeenNthCalledWith(2, "https://api.github.com/repos/octocat/Hello-World/commits/HEAD", expect.objectContaining({ headers: { Accept: "application/vnd.github.sha", "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit", redirect: "error" }));
});
it.each(["main", "ab123", "../evil", JSON.stringify({ sha }), "a".repeat(129)])("rejects unusable commit responses without returning an unpinned fallback: %s", async body => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(metadata))).mockResolvedValueOnce(new Response(body)));
  await expect(fetchPublicRepository(url, new AbortController().signal, true)).rejects.toThrow(/commit identifier|128 bytes/);
});
it("keeps one deadline across repository and HEAD reads", async () => {
  vi.useFakeTimers(); let first!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockResolvedValueOnce(new Response(new ReadableStream())); vi.stubGlobal("fetch", fetcher);
  const result = expect(fetchPublicRepository(url, new AbortController().signal, true)).rejects.toThrow("15 seconds");
  await vi.advanceTimersByTimeAsync(10_000); first(new Response(JSON.stringify(metadata)));
  await vi.advanceTimersByTimeAsync(5_000); await result;
  expect(fetcher).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
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
