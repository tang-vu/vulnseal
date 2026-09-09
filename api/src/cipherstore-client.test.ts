// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { CipherstoreClient, MAX_CIPHERSTORE_BYTES } from "./cipherstore-client.js";
import { createHash } from "node:crypto";

describe("CipherstoreClient", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([[507, "storage is full"], [503, "temporarily busy or unavailable"]] as const)("explains HTTP %i without automatically retrying", async (status, message) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status })); vi.stubGlobal("fetch", fetchMock);
    const body = "{}", digest = createHash("sha256").update(body).digest("hex");
    await expect(new CipherstoreClient("http://127.0.0.1:8787").put(`sha256:${digest}`, body)).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refuses to upload bytes that do not match the address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new CipherstoreClient("http://127.0.0.1:8787");
    await expect(client.put(`sha256:${"0".repeat(64)}`, "{}")).rejects.toThrow(
      "does not match",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aborts a stalled upload without retrying or claiming that the server discarded it", async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
      signal = options.signal;
      signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const body = "{}", digest = createHash("sha256").update(body).digest("hex");
    await expect(new CipherstoreClient("http://127.0.0.1:8787", 30).put(`sha256:${digest}`, body)).rejects.toThrow("may already be stored");
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps the download deadline active while reading the response body", async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Response(new ReadableStream({ start(controller) { signal!.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true }); } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(new CipherstoreClient("http://127.0.0.1:8787", 30).get(`sha256:${"ab".repeat(32)}`)).rejects.toThrow("download timed out");
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("clears a successful request's timer and rejects invalid deadlines", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => { signal = options.signal; return new Response("{}"); }));
    const body = "{}", digest = createHash("sha256").update(body).digest("hex");
    await new CipherstoreClient("http://127.0.0.1:8787", 30).put(`sha256:${digest}`, body);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(signal?.aborted).toBe(false);
    for (const value of [0, -1, NaN, Infinity, 300001]) expect(() => new CipherstoreClient("http://127.0.0.1:8787", value)).toThrow("timeout");
  });
  it("rejects oversized uploads before hashing or issuing any request, including multibyte text", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const client = new CipherstoreClient("http://127.0.0.1:8787");
    for (const body of ["x".repeat(MAX_CIPHERSTORE_BYTES + 1), "é".repeat(MAX_CIPHERSTORE_BYTES / 2 + 1)]) {
      await expect(client.put(`sha256:${"ab".repeat(32)}`, body)).rejects.toThrow("5 MiB upload limit");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels an oversized response stream even when Content-Length claims it is small", async () => {
    const cancel = vi.fn(); let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(chunks++ === 0 ? MAX_CIPHERSTORE_BYTES : 1)); }, cancel,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-length": "1" } })));
    await expect(new CipherstoreClient("http://127.0.0.1:8787").get(`sha256:${"ab".repeat(32)}`)).rejects.toThrow("5 MiB ciphertext limit");
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it("accepts the exact byte limit, validates its digest and rejects invalid UTF-8", async () => {
    const body = "x".repeat(MAX_CIPHERSTORE_BYTES), digest = createHash("sha256").update(body).digest("hex");
    const fetchMock = vi.fn(async () => new Response(body)); vi.stubGlobal("fetch", fetchMock);
    const client = new CipherstoreClient("http://127.0.0.1:8787");
    expect(await client.get(`sha256:${digest}`)).toBe(body);
    fetchMock.mockResolvedValueOnce(new Response(Uint8Array.from([0xff])));
    await expect(client.get(`sha256:${digest}`)).rejects.toThrow("invalid UTF-8");
    fetchMock.mockResolvedValueOnce(new Response("changed"));
    await expect(client.get(`sha256:${digest}`)).rejects.toThrow("invalid digest");
    const unicode = "\uFEFFé💡", encoded = new TextEncoder().encode(unicode);
    const split = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of encoded) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    fetchMock.mockResolvedValueOnce(new Response(split));
    expect(await client.get(`sha256:${createHash("sha256").update(encoded).digest("hex")}`)).toBe(unicode);
  });
});
