// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { CipherstoreClient, ReplicatedCipherstoreClient, verifyCipherstoreCopies, MAX_CIPHERSTORE_BYTES } from "./cipherstore-client.js";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";

describe("CipherstoreClient", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("checks every copy independently and reports corruption and missing copies without uploads", async () => {
    const body = "{}", address = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(new Response("corrupt")).mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const urls = ["https://a.test", "https://b.test", "https://c.test"];
    const result = await verifyCipherstoreCopies(urls, address);
    expect(result.copies.map((copy) => copy.verified)).toEqual([true, false, false]);
    expect(result.copies.map((copy) => copy.endpoint)).toEqual(urls);
    expect(result.copies[1]!.detail).toContain("invalid digest");
    expect(result.copies[2]!.detail).toContain("404");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls) { expect(options?.method).toBeUndefined(); expect(options?.cache).toBe("no-store"); }
    await expect(verifyCipherstoreCopies(urls, "invalid")).rejects.toThrow("content address");
    await expect(verifyCipherstoreCopies(urls, address, 0)).rejects.toThrow("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("validates direct client endpoints before requests and appends paths to a normalized base", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 })); vi.stubGlobal("fetch", fetchMock);
    for (const base of ["https://a.test?", "https://a.test#", "https://user:secret@a.test", "file:///tmp/store", "/store"]) expect(() => new CipherstoreClient(base)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    const body = "{}", address = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    await new CipherstoreClient("https://a.test/storage///").put(address, body);
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://a.test/storage/v1/blobs/${address}`);
  });
  it.each([[507, "storage is full"], [503, "temporarily busy or unavailable"], [410, "retired by the storage operator"]] as const)("explains HTTP %i without automatically retrying", async (status, message) => {
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
  it("explains a lost upload acknowledgment and permits explicit readback and identical retry", async () => {
    const body = "{}", address = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    let stored = "", uploads = 0;
    const server = createServer(async (request, response) => {
      if (request.method === "PUT") {
        uploads++;
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        stored = Buffer.concat(chunks).toString("utf8");
        if (uploads === 1) { response.destroy(); return; }
        response.writeHead(200); response.end(); return;
      }
      response.end(stored);
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const endpoint = server.address(); if (!endpoint || typeof endpoint === "string") throw new Error("Missing test port");
      const client = new CipherstoreClient(`http://127.0.0.1:${endpoint.port}`, 5000);
      await expect(client.put(address, body)).rejects.toThrow("may already be stored");
      expect(uploads).toBe(1);
      expect(await client.get(address)).toBe(body);
      expect(uploads).toBe(1);
      await client.put(address, body);
      expect(uploads).toBe(2);
      expect(stored).toBe(body);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

describe("replicated ciphertext", () => {
  it("reports a replica retirement refusal without telling the caller to retry an unavailable store", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = "{}", address = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    await expect(new ReplicatedCipherstoreClient(["https://a.test", "https://b.test"]).put(address, body)).rejects.toThrow("1 of 2 stores acknowledged this upload. At least one store reports this ciphertext as retired. Other stores may retain copies.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  afterEach(() => vi.unstubAllGlobals());
  const urls = ["http://127.0.0.1:8787", "http://127.0.0.1:8788"];
  const body = "{}", address = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  it("waits for every store and reports partial acknowledgement without automatic write retries", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 201 })).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ReplicatedCipherstoreClient(urls);
    let completed = false;
    const attempt = client.put(address, body).finally(() => { completed = true; });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(completed).toBe(false);
    finish(new Response("{}", { status: 503 }));
    await expect(attempt).rejects.toThrow("1 of 2 stores acknowledged");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await client.put(address, body);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, options] of fetchMock.mock.calls) expect(options).toMatchObject({ method: "PUT", body, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
  });
  it("falls back after corrupted bytes and stops at the first verified copy without repairing on read", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("corrupt")).mockResolvedValueOnce(new Response(body));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new ReplicatedCipherstoreClient([...urls, "http://127.0.0.1:8789"]).get(address)).toBe(body);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls.map((url) => `${url}/v1/blobs/${address}`));
    expect(fetchMock.mock.calls.every(([, options]) => options.method === undefined)).toBe(true);
  });
  it("moves to the next store after a bounded withheld response", async () => {
    const fetchMock = vi.fn().mockImplementationOnce((_url, { signal }) => new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("withheld response")), { once: true }))).mockResolvedValueOnce(new Response(body));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new ReplicatedCipherstoreClient(urls, 30).get(address)).toBe(body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
  });
  it("rejects all-bad reads and malformed addresses without disclosing to extra endpoints", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ReplicatedCipherstoreClient(urls);
    await expect(client.get(address)).rejects.toThrow("2 stores checked");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    await expect(client.get("../other-resource")).rejects.toThrow("Invalid ciphertext content address");
    await expect(client.put(address, "changed")).rejects.toThrow("0 of 2 stores acknowledged");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(() => new ReplicatedCipherstoreClient([urls[0]!])).toThrow("at least two");
    expect(() => new ReplicatedCipherstoreClient([urls[0]!, `${urls[0]}/`])).toThrow("distinct");
  });
});
