// SPDX-License-Identifier: Apache-2.0
export type PublicRepositoryReference = { fullName: string; url: string; archived: boolean; commitSha?: string };
export const GITHUB_REFERENCE_TIMEOUT_MS = 15_000;
export function repositoryCoordinates(input: string): string {
  const match = /^https:\/\/github\.com\/([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9_.-]{1,100})\/?$/i.exec(input.trim());
  if (!match || [".", ".."].includes(match[2]!)) throw new Error("Enter a public repository URL such as https://github.com/owner/repository, without query parameters or a fragment.");
  return `${match[1]}/${match[2]}`;
}

/** Public metadata only: no credentials, source downloads, or private workspace inputs. */
export async function fetchPublicRepository(input: string, signal: AbortSignal, pinCommit = false): Promise<PublicRepositoryReference> {
  const coordinates = repositoryCoordinates(input);
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => {
    const fail = () => reject(controller.signal.reason ?? new Error("Repository lookup cancelled"));
    if (controller.signal.aborted) fail(); else controller.signal.addEventListener("abort", fail, { once: true });
    timer = setTimeout(() => controller.abort(new Error("GitHub repository lookup exceeded 15 seconds. Try again explicitly.")), GITHUB_REFERENCE_TIMEOUT_MS);
  });
  const read = async (suffix: string, accept: string, limit: number) => {
    controller.signal.throwIfAborted();
    const response = await fetch(`https://api.github.com/repos/${coordinates}${suffix}`, {
      method: "GET", headers: { Accept: accept, "X-GitHub-Api-Version": "2022-11-28" },
      signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
    });
    if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); controller.signal.throwIfAborted(); }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error(response.status === 403 || response.status === 429 ? "GitHub declined this lookup or its public request limit was reached. Try again later." : "Public repository lookup failed. Check the URL; renamed repositories must use their current URL.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("GitHub returned no repository metadata");
    const buffer = new Uint8Array(limit); let length = 0;
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    try {
      while (true) {
        controller.signal.throwIfAborted();
        const { done, value } = await reader.read();
        controller.signal.throwIfAborted();
        if (done) break;
        if (value.length > buffer.length - length) throw new Error(`GitHub metadata exceeds ${limit === 256 * 1024 ? "256 KiB" : `${limit} bytes`}`);
        buffer.set(value, length); length += value.length;
      }
      try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)); }
      catch { throw new Error("GitHub returned invalid repository metadata"); }
    } finally { controller.signal.removeEventListener("abort", cancel); cancel(); reader.releaseLock(); }
  };
  const request = async (): Promise<PublicRepositoryReference> => {
    const text = await read("", "application/vnd.github+json", 256 * 1024);
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("GitHub returned invalid repository metadata"); }
    const repo = value as Record<string, unknown> | null;
    if (!repo || repo.private !== false || repo.visibility !== "public" || repo.disabled !== false || typeof repo.archived !== "boolean" || typeof repo.full_name !== "string" || repo.full_name.toLowerCase() !== coordinates.toLowerCase() || repo.html_url !== `https://github.com/${repo.full_name}`) throw new Error("GitHub did not confirm the requested public repository");
    const reference = { fullName: repo.full_name, url: `https://github.com/${repo.full_name}`, archived: repo.archived };
    if (!pinCommit) return reference;
    // SHA-only media avoids downloading commit messages, authors or source diffs.
    const commitSha = (await read("/commits/HEAD", "application/vnd.github.sha", 128)).trim();
    if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new Error("GitHub did not return a full SHA-1 commit identifier");
    return { ...reference, url: `${reference.url}/tree/${commitSha}`, commitSha };
  };
  try { return await Promise.race([request(), stopped]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
