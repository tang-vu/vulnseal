// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";

const envelope = JSON.stringify({
  aad: "vulnseal:ciphertext:v1:program",
  algorithm: "AES-256-GCM",
  ciphertext: Buffer.alloc(32, 1).toString("base64url"),
  iv: "AAAAAAAAAAAAAAAA",
  keyDerivation: "none-random-256-bit-key",
  version: 1,
});

describe("ciphertext-only content store", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  });

  it.each([
    { maxStoredBytes: Buffer.byteLength(envelope), maxStoredBlobs: 10 },
    { maxStoredBytes: 10_000, maxStoredBlobs: 1 },
  ])("enforces aggregate capacity across concurrent unique writes and restart: %j", async (limits) => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-quota-"));
    const start = async () => {
      server = createCipherstoreServer({ dataDirectory, ...limits });
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      const address = server!.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
      return `http://127.0.0.1:${address.port}`;
    };
    const bodies = [envelope, JSON.stringify({ ...JSON.parse(envelope), ciphertext: Buffer.alloc(32, 2).toString("base64url") })];
    const route = (body: string) => `/v1/blobs/sha256:${createHash("sha256").update(body).digest("hex")}`;
    let base = await start();
    const upload = (body: string) => fetch(base + route(body), { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body });
    const responses = await Promise.all(bodies.map(upload));
    expect(responses.map((value) => value.status).sort()).toEqual([201, 507]);
    const accepted = bodies[responses.findIndex((value) => value.status === 201)]!;
    const rejected = bodies[responses.findIndex((value) => value.status === 507)]!;
    expect(await responses.find((value) => value.status === 507)!.json()).toEqual({ error: "storage_capacity_exceeded" });
    expect((await upload(accepted)).status).toBe(200);
    expect(await (await fetch(base + route(accepted))).text()).toBe(accepted);
    expect(await readdir(dataDirectory)).toHaveLength(1);
    await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined;
    base = await start();
    expect((await upload(rejected)).status).toBe(507);
    expect((await upload(accepted)).status).toBe(200);
  });

  it("bounds active uploads and releases capacity after the in-flight body finishes", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-upload-limit-"));
    server = createCipherstoreServer({ dataDirectory, maxConcurrentUploads: 1 });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
    const url = `http://127.0.0.1:${address.port}/v1/blobs/sha256:${createHash("sha256").update(envelope).digest("hex")}`;
    const arrived = new Promise<void>((resolve) => server!.once("request", () => resolve()));
    const held = httpRequest(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE, "content-length": Buffer.byteLength(envelope) } });
    const completed = new Promise<number | undefined>((resolve, reject) => { held.on("response", (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); }); held.on("error", reject); });
    held.flushHeaders(); await arrived;
    const busy = await fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body: envelope });
    expect(busy.status).toBe(503); expect(busy.headers.get("retry-after")).toBe("1");
    expect(await busy.json()).toEqual({ error: "upload_capacity_busy" });
    held.end(envelope); expect(await completed).toBe(201);
    expect((await fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body: envelope })).status).toBe(200);
  });

  it("stores and retrieves an immutable digest-addressed ciphertext", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-cipherstore-"));
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No TCP address");
    const digest = createHash("sha256").update(envelope).digest("hex");
    const url = `http://127.0.0.1:${address.port}/v1/blobs/sha256:${digest}`;
    const stored = await fetch(url, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: envelope,
    });
    expect(stored.status).toBe(201);
    expect(await stored.json()).toEqual({ address: `sha256:${digest}`, stored: true });
    const fetched = await fetch(url);
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe(envelope);
    expect(await readFile(path.join(dataDirectory, `${digest}.ciphertext.json`), "utf8")).toBe(envelope);
  });

  it("rejects plaintext-shaped payloads and digest mismatches", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-cipherstore-"));
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No TCP address");
    const base = `http://127.0.0.1:${address.port}/v1/blobs/sha256:${"0".repeat(64)}`;
    const plaintext = await fetch(base, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: JSON.stringify({ title: "plaintext vulnerability" }),
    });
    expect(plaintext.status).toBe(400);
    const mismatch = await fetch(base, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: envelope,
    });
    expect(mismatch.status).toBe(422);
  });

  it("publishes complete blobs atomically under concurrent duplicate uploads", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-concurrent-"));
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No TCP address");
    const digest = createHash("sha256").update(envelope).digest("hex");
    const url = `http://127.0.0.1:${address.port}/v1/blobs/sha256:${digest}`;
    const responses = await Promise.all(Array.from({ length: 12 }, () => fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body: envelope })));
    expect(responses.map((response) => response.status).sort()).toEqual([...Array<number>(11).fill(200), 201]);
    expect(await (await fetch(url)).text()).toBe(envelope);
    expect(await readdir(dataDirectory)).toEqual([`${digest}.ciphertext.json`]);
    await writeFile(path.join(dataDirectory, `${digest}.ciphertext.json`), "corrupted storage");
    const corrupted = await fetch(url);
    expect(corrupted.status).toBe(500);
    expect(await corrupted.json()).toEqual({ error: "stored_blob_corrupted" });
    expect((await fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body: envelope })).status).toBe(409);
    expect(await readFile(path.join(dataDirectory, `${digest}.ciphertext.json`), "utf8")).toBe("corrupted storage");
  });

  it("rejects invalid encoding, IVs, missing authentication tags and media-type prefixes", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-invalid-"));
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No TCP address");
    const upload = (body: string, mediaType = MEDIA_TYPE) => {
      const digest = createHash("sha256").update(body).digest("hex");
      return fetch(`http://127.0.0.1:${address.port}/v1/blobs/sha256:${digest}`, { method: "PUT", headers: { "content-type": mediaType }, body });
    };
    for (const fields of [{ iv: "AA" }, { ciphertext: "not ciphertext!" }, { ciphertext: "AA" }, { aad: "private exploit content" }, { extra: "plaintext" }]) {
      expect((await upload(JSON.stringify({ ...JSON.parse(envelope), ...fields }))).status).toBe(400);
    }
    expect((await upload(envelope, `${MEDIA_TYPE}-invalid`)).status).toBe(415);
    expect(await readdir(dataDirectory)).toEqual([]);
  });

  it("reports storage failures without misclassifying them as missing blobs or exposing paths", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-unavailable-"));
    const dataDirectory = path.join(directory, "not-a-directory");
    await writeFile(dataDirectory, "occupied");
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No TCP address");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/blobs/sha256:${"0".repeat(64)}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "storage_unavailable" });
  });
});
