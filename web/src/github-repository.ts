// SPDX-License-Identifier: Apache-2.0
export type PublicRepositoryReference = { fullName: string; url: string; archived: boolean; commitSha?: string };
export const GITHUB_REFERENCE_TIMEOUT_MS = 15_000;
export function repositoryCoordinates(input: string): string {
  const match = /^https:\/\/github\.com\/([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9_.-]{1,100})\/?$/i.exec(input.trim());
  if (!match || [".", ".."].includes(match[2]!)) throw new Error("Enter a public repository URL such as https://github.com/owner/repository, without query parameters or a fragment.");
  return `${match[1]}/${match[2]}`;
}

/** Public metadata only: no credentials, source downloads, or private workspace inputs. */
type GitHubRead = (suffix: string, accept: string, limit: number) => Promise<string>;
async function withPublicRepository<T>(input: string, signal: AbortSignal, operation: (repo: PublicRepositoryReference, read: GitHubRead) => Promise<T>): Promise<T> {
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
  const request = async (): Promise<T> => {
    const text = await read("", "application/vnd.github+json", 256 * 1024);
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("GitHub returned invalid repository metadata"); }
    const repo = value as Record<string, unknown> | null;
    if (!repo || repo.private !== false || repo.visibility !== "public" || repo.disabled !== false || typeof repo.archived !== "boolean" || typeof repo.full_name !== "string" || repo.full_name.toLowerCase() !== coordinates.toLowerCase() || repo.html_url !== `https://github.com/${repo.full_name}`) throw new Error("GitHub did not confirm the requested public repository");
    const reference = { fullName: repo.full_name, url: `https://github.com/${repo.full_name}`, archived: repo.archived };
    return operation(reference, read);
  };
  try { return await Promise.race([request(), stopped]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

const readCommit = async (read: GitHubRead, ref: string) => {
  const sha = (await read(`/commits/${encodeURIComponent(ref)}`, "application/vnd.github.sha", 128)).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("GitHub did not return a full SHA-1 commit identifier");
  return sha;
};
export function fetchPublicRepository(input: string, signal: AbortSignal, pinCommit = false): Promise<PublicRepositoryReference> {
  return withPublicRepository(input, signal, async (reference, read) => {
    if (!pinCommit) return reference;
    const commitSha = await readCommit(read, "HEAD");
    return { ...reference, url: `${reference.url}/tree/${commitSha}`, commitSha };
  });
}
export type PublicReleaseReference = { repository: string; releaseUrl: string; releaseId: number; tag: string; commitSha: string; publishedAt: string; prerelease: boolean };
export function releaseCoordinates(input: string) {
  const match = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\/tag\/([^?#]+)$/.exec(input.trim());
  if (!match) throw new Error("Enter a public GitHub release URL ending in /releases/tag/<tag>");
  const coordinates = repositoryCoordinates(match[1]!);
  let tag: string;
  try { tag = decodeURIComponent(match[2]!); } catch { throw new Error("Invalid release tag encoding"); }
  if (!tag || tag.length > 256 || /[\u0000-\u0020\u007f\\]/.test(tag) || tag.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid release tag");
  return { coordinates, tag };
}
export function fetchPublicRelease(input: string, signal: AbortSignal): Promise<PublicReleaseReference> {
  const { coordinates, tag } = releaseCoordinates(input);
  return withPublicRepository(`https://github.com/${coordinates}`, signal, async (repo, read) => {
    let value: Record<string, unknown>;
    try { value = JSON.parse(await read(`/releases/tags/${encodeURIComponent(tag)}`, "application/vnd.github+json", 256 * 1024)); }
    catch (cause) { if (cause instanceof SyntaxError) throw new Error("GitHub returned invalid release metadata"); throw cause; }
    if (!value || !Number.isSafeInteger(value.id) || (value.id as number) < 1 || value.draft !== false || typeof value.prerelease !== "boolean" || value.tag_name !== tag || typeof value.html_url !== "string" || typeof value.published_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.published_at) || !Number.isFinite(Date.parse(value.published_at))) throw new Error("GitHub did not confirm a published release for this tag");
    if (new Date(value.published_at).toISOString().replace(".000Z", "Z") !== value.published_at) throw new Error("GitHub returned an invalid release publication time");
    const observed = releaseCoordinates(value.html_url);
    if (observed.coordinates.toLowerCase() !== coordinates.toLowerCase() || observed.tag !== tag) throw new Error("GitHub release names another repository or tag");
    const commitSha = await readCommit(read, `tags/${tag}`);
    return { repository: repo.fullName, releaseUrl: `${repo.url}/releases/tag/${encodeURIComponent(tag)}`, releaseId: value.id as number, tag, commitSha, publishedAt: value.published_at, prerelease: value.prerelease };
  });
}
export const releaseReferenceText = (reference: PublicReleaseReference): string => [
  `GitHub release: ${reference.releaseUrl}`, `Release ID: ${reference.releaseId}`, `Tag: ${reference.tag}`,
  `Commit: ${reference.commitSha}`, `Published at: ${reference.publishedAt}`, `Prerelease: ${reference.prerelease ? "yes" : "no"}`,
].join("\n");
