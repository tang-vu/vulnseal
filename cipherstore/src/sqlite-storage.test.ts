// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { SqliteCiphertextStorage } from "./sqlite-storage.js";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";

const stores: SqliteCiphertextStorage[] = [];
let server: ReturnType<typeof createCipherstoreServer> | undefined;
afterEach(async () => {
  if (server) { await new Promise<void>((resolve) => server!.close(() => resolve())); await server.drain(); server = undefined; }
  await Promise.all(stores.splice(0).map((store) => store.close()));
});
const make = (directory: string, maxBytes = 10000, maxBlobs = 10) => {
  const store = new SqliteCiphertextStorage(directory, maxBytes, maxBlobs); stores.push(store); return store;
};
const body = Buffer.from(JSON.stringify({ aad: "vulnseal:ciphertext:v1:sqlite", algorithm: "AES-256-GCM", ciphertext: Buffer.alloc(32, 1).toString("base64url"), iv: "AAAAAAAAAAAAAAAA", keyDerivation: "none-random-256-bit-key", version: 1 }));
const digest = createHash("sha256").update(body).digest("hex");

it("keeps one immutable copy under concurrent retries and retains it after reopening", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-"));
  const store = make(directory, body.length, 1);
  await store.checkReadiness();
  const results = await Promise.all(Array.from({ length: 12 }, () => store.put(digest, body)));
  expect(results.filter(Boolean)).toHaveLength(1);
  await expect(store.put(digest, Buffer.from("changed"))).rejects.toThrow("IMMUTABLE_CONFLICT");
  await expect(store.put("02".repeat(32), body)).rejects.toThrow("STORAGE_CAPACITY_EXCEEDED");
  await expect(store.checkReadiness()).rejects.toThrow("STORAGE_CAPACITY_EXCEEDED");
  expect(Buffer.from(await store.read(digest))).toEqual(body);
  await store.close();
  await expect(store.read(digest)).rejects.toThrow();
  const reopened = make(directory, body.length, 1);
  expect(Buffer.from(await reopened.read(digest))).toEqual(body);
  expect(await reopened.put(digest, body)).toBe(false);
  await expect(reopened.read("03".repeat(32))).rejects.toMatchObject({ code: "ENOENT" });
});

it("rolls back failed quota checks and serializes independent database connections", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-concurrent-"));
  const first = make(directory, body.length, 1); await first.prepare();
  const second = make(directory, body.length, 1); await second.prepare();
  const results = await Promise.allSettled([first.put(digest, body), second.put("04".repeat(32), body)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason.message).toBe("STORAGE_CAPACITY_EXCEEDED");
  await first.close(); await second.close();
  const larger = make(directory, body.length * 2, 2);
  await larger.checkReadiness();
  await larger.put(digest, body); await larger.put("04".repeat(32), body);
  await expect(larger.checkReadiness()).rejects.toThrow("STORAGE_CAPACITY_EXCEEDED");
});

it("serves SQLite ciphertext through the actual HTTP validation and readiness layer", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-http-"));
  const storage = make(directory, 10000, 1);
  server = createCipherstoreServer({ dataDirectory: directory, storage, metricsEnabled: true });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
  const base = `http://127.0.0.1:${address.port}`, url = `${base}/v1/blobs/sha256:${digest}`;
  expect((await fetch(`${base}/readyz`)).status).toBe(200);
  const put = () => fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body });
  expect((await put()).status).toBe(201); expect((await put()).status).toBe(200);
  expect(await (await fetch(url)).text()).toBe(body.toString());
  expect((await fetch(`${base}/readyz`)).status).toBe(503);
  expect(await (await fetch(`${base}/metrics`)).text()).toContain("vulnseal_storage_ready 0\n");
});

it("rejects foreign database files without replacing their bytes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-invalid-"));
  const filename = path.join(directory, "ciphertext.sqlite"), original = Buffer.from("operator data");
  await writeFile(filename, original);
  const store = make(directory);
  await expect(store.prepare()).rejects.toThrow();
  expect(await readFile(filename)).toEqual(original);
  await expect(store.read("../outside")).rejects.toThrow("INVALID_STORAGE_DIGEST");
});

it("reports an actual database lock as retryable HTTP unavailability without writing", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-busy-http-"));
  const storage = make(directory); await storage.prepare();
  server = createCipherstoreServer({ dataDirectory: directory, storage });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
  const base = `http://127.0.0.1:${address.port}`, url = `${base}/v1/blobs/sha256:${digest}`;
  const blocker = new DatabaseSync(path.join(directory, "ciphertext.sqlite"));
  blocker.exec("BEGIN IMMEDIATE");
  const put = () => fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body });
  try {
    const pending = put();
    // The worker's lock wait must not block the server's main HTTP event loop.
    expect((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(500) })).status).toBe(200);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(await response.json()).toEqual({ error: "storage_temporarily_busy" });
  } finally { blocker.exec("ROLLBACK"); blocker.close(); }
  expect((await fetch(url)).status).toBe(404);
  expect((await put()).status).toBe(201);
  expect(await (await fetch(url)).text()).toBe(body.toString());
});

it("preserves the original error when SQLite has already rolled back the transaction", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-auto-rollback-"));
  const storage = make(directory); await storage.prepare();
  const control = new DatabaseSync(path.join(directory, "ciphertext.sqlite"));
  try {
    control.exec("CREATE TRIGGER stop_write BEFORE INSERT ON blobs BEGIN SELECT RAISE(ROLLBACK, 'controlled rollback'); END");
    await expect(storage.put(digest, body)).rejects.toThrow("controlled rollback");
    await expect(storage.read(digest)).rejects.toMatchObject({ code: "ENOENT" });
    control.exec("DROP TRIGGER stop_write");
    expect(await storage.put(digest, body)).toBe(true);
    expect(Buffer.from(await storage.read(digest))).toEqual(body);
  } finally { control.close(); }
});
