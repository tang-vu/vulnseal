// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { CipherstoreClient } from "./cipherstore-client.js";
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
      return { ok: true, text: () => new Promise<string>((_resolve, reject) => signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })) };
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
});
