// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";
import { FilesystemCiphertextStorage } from "./filesystem-storage.js";

let server: ReturnType<typeof createCipherstoreServer> | undefined;
afterEach(async () => {
  if (server) { await new Promise<void>((resolve) => server!.close(() => resolve())); await server.drain(); }
  server = undefined;
});
const body = JSON.stringify({ aad: "vulnseal:ciphertext:v1:adapter-test", algorithm: "AES-256-GCM", ciphertext: Buffer.alloc(32, 1).toString("base64url"), iv: "AAAAAAAAAAAAAAAA", keyDerivation: "none-random-256-bit-key", version: 1 });
const digest = createHash("sha256").update(body).digest("hex");

it("keeps envelope/digest validation and corruption rejection at the HTTP boundary", async () => {
  const storage = { prepare: vi.fn(async () => {}), read: vi.fn(async (_digest: string) => Buffer.from(body)), put: vi.fn(async (_digest: string, _body: Uint8Array) => true), checkReadiness: vi.fn(async () => {}) };
  server = createCipherstoreServer({ dataDirectory: "unused-by-injected-adapter", storage, metricsEnabled: true });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
  const base = `http://127.0.0.1:${address.port}`, url = `${base}/v1/blobs/sha256:${digest}`;
  const put = (value: string) => fetch(url, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body: value });
  expect((await put("{}")).status).toBe(400);
  expect((await put(body.replace("adapter-test", "changed"))).status).toBe(422);
  expect(storage.put).not.toHaveBeenCalled();
  expect((await put(body)).status).toBe(201);
  expect(storage.put).toHaveBeenCalledWith(digest, expect.any(Uint8Array));
  expect(Buffer.from(storage.put.mock.calls[0]![1]!).toString()).toBe(body);
  expect(await (await fetch(url)).text()).toBe(body);
  storage.read.mockResolvedValueOnce(Buffer.from("corrupt"));
  expect(await (await fetch(url)).json()).toEqual({ error: "stored_blob_corrupted" });
  storage.read.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
  expect((await fetch(url)).status).toBe(404);
  storage.put.mockRejectedValueOnce(new Error("IMMUTABLE_CONFLICT"));
  expect((await put(body)).status).toBe(409);
  storage.put.mockRejectedValueOnce(new Error("STORAGE_CAPACITY_EXCEEDED"));
  expect((await put(body)).status).toBe(507);
  storage.checkReadiness.mockRejectedValueOnce(new Error("private backend failure"));
  const ready = await fetch(`${base}/readyz`);
  expect(ready.status).toBe(503);
  expect(await ready.text()).not.toContain("private backend failure");
  storage.checkReadiness.mockRejectedValueOnce(new Error("private backend failure"));
  expect(await (await fetch(`${base}/metrics`)).text()).toContain("vulnseal_storage_ready 0\n");
});

it("rejects path-like adapter keys before reading or writing the filesystem", async () => {
  const storage = new FilesystemCiphertextStorage("unused-by-invalid-key", 1000, 10);
  for (const key of ["../outside", "AB".repeat(32), "", "sha256:" + digest]) {
    await expect(storage.read(key)).rejects.toThrow("INVALID_STORAGE_DIGEST");
    await expect(storage.put(key, Buffer.from(body))).rejects.toThrow("INVALID_STORAGE_DIGEST");
  }
});
