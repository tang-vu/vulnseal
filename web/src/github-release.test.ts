// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { fetchPublicRelease, releaseCoordinates, releaseReferenceText } from "./github-repository.js";
const root = "https://github.com/example/project", url = `${root}/releases/tag/fix%2Fv1`, sha = "ab".repeat(20);
const repo = { full_name: "example/project", html_url: root, private: false, visibility: "public", archived: false, disabled: false };
const release = { id: 42, html_url: url, tag_name: "fix/v1", draft: false, prerelease: true, published_at: "2026-09-10T00:00:00Z", body: "Untrusted release prose", assets: [{ browser_download_url: "https://evil.test/asset" }] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const responses = (value: unknown = release) => { const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(repo))).mockResolvedValueOnce(new Response(JSON.stringify(value))).mockResolvedValueOnce(new Response(sha)); vi.stubGlobal("fetch", fetcher); return fetcher; };
it("resolves a published tag, retains only selected metadata, and never downloads assets", async () => {
  const fetcher = responses(); const result = await fetchPublicRelease(url, new AbortController().signal);
  expect(result).toEqual({ repository: repo.full_name, releaseUrl: url, releaseId: 42, tag: "fix/v1", commitSha: sha, publishedAt: release.published_at, prerelease: true });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://api.github.com/repos/example/project", "https://api.github.com/repos/example/project/releases/tags/fix%2Fv1", "https://api.github.com/repos/example/project/commits/tags%2Ffix%2Fv1"]);
  expect(releaseReferenceText(result)).toContain(`Commit: ${sha}`); expect(releaseReferenceText(result)).not.toContain("Untrusted");
});
it.each([{ draft: true }, { id: 0 }, { prerelease: null }, { tag_name: "other" }, { published_at: null }, { published_at: "2026-02-31T00:00:00Z" }, { html_url: "https://github.com/other/project/releases/tag/fix%2Fv1" }])("rejects inconsistent/unpublished release metadata: %j", async override => {
  const fetcher = responses({ ...release, ...override });
  await expect(fetchPublicRelease(url, new AbortController().signal)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([`${root}/releases/latest`, `${root}/releases/tag/..`, `${root}/releases/tag/%2e%2e`, `${root}/releases/tag/x?token=secret`, `${root}/releases/tag/%0aevil`, "https://github.com.evil/example/project/releases/tag/v1"])("rejects unsafe or ambiguous release URL %s", input => {
  expect(() => releaseCoordinates(input)).toThrow();
});
it("uses the same total deadline across all three reads", async () => {
  vi.useFakeTimers(); let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(repo))).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(new Response(new ReadableStream())); vi.stubGlobal("fetch", fetcher);
  const pending = expect(fetchPublicRelease(url, new AbortController().signal)).rejects.toThrow("15 seconds");
  await vi.advanceTimersByTimeAsync(12_000); resolve(new Response(JSON.stringify(release))); await vi.advanceTimersByTimeAsync(3_000); await pending;
  expect(fetcher).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
});
