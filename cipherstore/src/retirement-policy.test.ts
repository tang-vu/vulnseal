// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RetirementPolicy, readRetirementPolicy } from "./retirement-policy.js";
import { FilesystemCiphertextStorage } from "./filesystem-storage.js";
import { SqliteCiphertextStorage } from "./sqlite-storage.js";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";

it("loads an immutable bounded inventory and rejects invalid or missing configuration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-retirement-policy-"));
  const filename = path.join(directory, "policy.json"), digest = "ab".repeat(32);
  await expect(readRetirementPolicy(filename)).rejects.toMatchObject({ code: "ENOENT" });
  const value = { format: "vulnseal-retired-ciphertext", version: 1, digests: [digest] };
  await writeFile(filename, JSON.stringify(value));
  const policy = await readRetirementPolicy(filename);
  expect(policy.has(digest)).toBe(true);
  for (const invalid of [{ ...value, extra: true }, { ...value, version: 2 }, { ...value, digests: [digest, digest] }, { ...value, digests: ["../path"] }, { ...value, digests: [123] }]) {
    await writeFile(filename, JSON.stringify(invalid));
    await expect(readRetirementPolicy(filename)).rejects.toThrow();
  }
  await writeFile(filename, Buffer.from([0xff]));
  await expect(readRetirementPolicy(filename)).rejects.toThrow();
  await truncate(filename, 8 * 1024 * 1024 + 1);
  await expect(readRetirementPolicy(filename)).rejects.toThrow("bounded regular file");
  await expect(readRetirementPolicy(directory)).rejects.toThrow("bounded regular file");
  const selected = [digest], copied = new RetirementPolicy(selected);
  selected.length = 0;
  expect(copied.has(digest)).toBe(true);
  expect(policy.has(digest)).toBe(true); // Later file edits do not change the running snapshot.
  expect(() => new RetirementPolicy(Array(100001).fill(digest))).toThrow("inventory");
});

it.each(["filesystem", "sqlite"] as const)("blocks retired reads and repeated uploads without deleting %s data", async (backend) => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-retirement-http-"));
  const storage = backend === "sqlite" ? new SqliteCiphertextStorage(directory, 10000, 10) : new FilesystemCiphertextStorage(directory, 10000, 10);
  const makeBody = (marker: string) => JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad: `vulnseal:ciphertext:v1:${marker}`, iv: "AAAAAAAAAAAAAAAA", ciphertext: Buffer.alloc(32, 1).toString("base64url") });
  const body = makeBody("retired"), allowed = makeBody("allowed");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  await storage.put(hash(body), Buffer.from(body));
  const server = createCipherstoreServer({ dataDirectory: directory, storage, retirementPolicy: new RetirementPolicy([hash(body)]) });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
    const base = `http://127.0.0.1:${address.port}`;
    const url = (value: string) => `${base}/v1/blobs/sha256:${hash(value)}`;
    const put = (value: string) => fetch(url(value), { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body: value });
    expect((await fetch(url(body))).status).toBe(404);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await put(body);
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({ error: "blob_retired" });
    }
    expect((await put(allowed)).status).toBe(201);
    expect(await (await fetch(url(allowed))).text()).toBe(allowed);
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
    expect(Buffer.from(await storage.read(hash(body))).toString()).toBe(body);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve())); await server.drain();
    if (storage instanceof SqliteCiphertextStorage) await storage.close();
  }
});
