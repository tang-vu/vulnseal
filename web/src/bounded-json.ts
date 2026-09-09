// SPDX-License-Identifier: Apache-2.0
/** Limit decoded response bytes before parsing untrusted public evidence. */
export async function readBoundedJson(response: Response, maxBytes: number, signal?: AbortSignal): Promise<any> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new Error("Invalid JSON response limit");
  if (!response.body) throw new Error("Evidence service returned no response body");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const chunks: Uint8Array[] = [];
  let length = 0;
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const part = await reader.read();
      signal?.throwIfAborted();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maxBytes) throw new Error("Evidence response is too large");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
