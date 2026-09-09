// SPDX-License-Identifier: Apache-2.0
export const ZK_ARTIFACT_TIMEOUT_MS = 120_000;
export const MAX_ZK_ARTIFACT_BYTES = 64 * 1024 * 1024;

/** Buffer within a deadline so the SDK's later arrayBuffer() is also bounded. */
export const fetchZkArtifact: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const signal = init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("ZK artifact download timed out. Check the release host and connection before trying again.");
      controller.abort(error);
      void reader?.cancel(error).catch(() => {});
      reject(error);
    }, ZK_ARTIFACT_TIMEOUT_MS);
  });
  const download = async () => {
    const response = await window.fetch(input, { ...init, signal, redirect: "error" });
    if (signal.aborted) {
      void response.body?.cancel().catch(() => {});
      signal.throwIfAborted();
    }
    // Preserve the SDK's HTTP/HTML diagnostics without consuming error bodies.
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
      void response.body?.cancel().catch(() => {});
      return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    let buffer = new Uint8Array(64 * 1024), length = 0;
    reader = response.body?.getReader();
    try {
      while (reader) {
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        if (value.byteLength > MAX_ZK_ARTIFACT_BYTES - length) {
          void reader.cancel().catch(() => {});
          throw new Error("ZK artifact exceeds the 64 MiB download limit. Check the release host.");
        }
        const required = length + value.byteLength;
        if (required > buffer.byteLength) {
          const next = new Uint8Array(Math.min(MAX_ZK_ARTIFACT_BYTES, Math.max(required, buffer.byteLength * 2)));
          next.set(buffer.subarray(0, length)); buffer = next;
        }
        buffer.set(value, length); length = required;
      }
      return new Response(buffer.subarray(0, length), { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally { reader?.releaseLock(); reader = undefined; }
  };
  try { return await Promise.race([download(), timeout]); }
  finally { clearTimeout(timer); }
};
