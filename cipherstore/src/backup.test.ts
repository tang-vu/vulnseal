// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import * as files from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createCipherstoreBackup, restoreCipherstoreBackup, verifyCipherstoreBackup } from "./backup.js";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";
import { SqliteCiphertextStorage } from "./sqlite-storage.js";
import { acquireDirectoryLease } from "./directory-lease.js";
import { assertRestoreComplete, incompleteRestoreName } from "./restore-state.js";
import { RetirementPolicy } from "./retirement-policy.js";
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});
let server: Server | undefined;
afterEach(async () => { await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve()); server = undefined; });
const serve = async (directory: string) => {
  server = createCipherstoreServer({ dataDirectory: directory });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No TCP address");
  return `http://127.0.0.1:${address.port}`;
};
const setup = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-backup-drill-"));
  const store = path.join(root, "store"), backup = path.join(root, "backup"), restored = path.join(root, "restored");
  const key = randomBytes(32), iv = randomBytes(12), aad = "vulnseal:ciphertext:v1:backup-drill";
  const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from(aad));
  const plaintext = "Synthetic private report recovered from a separate ciphertext directory";
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const body = JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad, iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url") });
  const digest = createHash("sha256").update(body).digest("hex"), base = await serve(store);
  expect((await fetch(`${base}/v1/blobs/sha256:${digest}`, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body })).status).toBe(201);
  await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined;
  return { root, store, backup, restored, key, iv, aad, plaintext, body, digest };
};

it("backs up a stopped store, restores into a fresh directory, and decrypts HTTP-retrieved ciphertext", async () => {
  const fixture = await setup();
  await writeFile(path.join(fixture.store, "interrupted.tmp"), "incomplete temporary write");
  const manifest = await createCipherstoreBackup(fixture.store, fixture.backup);
  expect(manifest.blobs).toEqual([{ digest: fixture.digest, bytes: Buffer.byteLength(fixture.body) }]);
  expect(await verifyCipherstoreBackup(fixture.backup)).toEqual(manifest);
  expect(await restoreCipherstoreBackup(fixture.backup, fixture.restored)).toEqual(manifest);
  expect(await readdir(fixture.restored)).toEqual([`${fixture.digest}.ciphertext.json`]);
  const base = await serve(fixture.restored);
  expect((await fetch(`${base}/readyz`)).status).toBe(200);
  const response = await fetch(`${base}/v1/blobs/sha256:${fixture.digest}`);
  expect(response.status).toBe(200); const envelope = await response.json();
  const bytes = Buffer.from(envelope.ciphertext, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", fixture.key, fixture.iv);
  decipher.setAAD(Buffer.from(fixture.aad)); decipher.setAuthTag(bytes.subarray(-16));
  expect(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString()).toBe(fixture.plaintext);
  await expect(restoreCipherstoreBackup(fixture.backup, fixture.restored)).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readFile(path.join(fixture.restored, `${fixture.digest}.ciphertext.json`), "utf8")).toBe(fixture.body);
});

it("rejects corruption before creating a restoration directory and rejects manifest traversal", async () => {
  const fixture = await setup(); await createCipherstoreBackup(fixture.store, fixture.backup);
  const filename = path.join(fixture.backup, `${fixture.digest}.ciphertext.json`);
  await writeFile(filename, "damaged backup");
  await expect(restoreCipherstoreBackup(fixture.backup, fixture.restored)).rejects.toThrow("digest mismatch");
  expect(await readdir(fixture.root)).not.toContain("restored");
  await writeFile(filename, fixture.body);
  const manifestPath = path.join(fixture.backup, "vulnseal-cipherstore-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.blobs[0].digest = "../outside";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await expect(verifyCipherstoreBackup(fixture.backup)).rejects.toThrow("Invalid ciphertext backup entry");
});

it("migrates encrypted backups through SQLite and back to filesystem with decryptable bytes", async () => {
  const fixture = await setup();
  const sqliteDirectory = path.join(fixture.root, "sqlite"), sqliteBackup = path.join(fixture.root, "sqlite-backup");
  await createCipherstoreBackup(fixture.store, fixture.backup);
  await restoreCipherstoreBackup(fixture.backup, sqliteDirectory, "sqlite");
  expect(await readdir(sqliteDirectory)).toEqual(["ciphertext.sqlite"]);
  const release = await acquireDirectoryLease(sqliteDirectory);
  try { await expect(createCipherstoreBackup(sqliteDirectory, sqliteBackup)).rejects.toThrow(); }
  finally { await release(); }
  const copy = await createCipherstoreBackup(sqliteDirectory, sqliteBackup);
  expect(copy.blobs).toEqual([{ digest: fixture.digest, bytes: Buffer.byteLength(fixture.body) }]);
  expect(await verifyCipherstoreBackup(sqliteBackup)).toEqual(copy);
  await restoreCipherstoreBackup(sqliteBackup, fixture.restored);
  const base = await serve(fixture.restored);
  const response = await fetch(`${base}/v1/blobs/sha256:${fixture.digest}`);
  expect(response.status).toBe(200);
  const envelope = await response.json(), bytes = Buffer.from(envelope.ciphertext, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", fixture.key, fixture.iv);
  decipher.setAAD(Buffer.from(fixture.aad)); decipher.setAuthTag(bytes.subarray(-16));
  expect(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString()).toBe(fixture.plaintext);
  await expect(restoreCipherstoreBackup(sqliteBackup, sqliteDirectory, "sqlite")).rejects.toMatchObject({ code: "EEXIST" });
});

it("refuses a SQLite backup containing bytes that do not match their stored digest", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-bad-backup-"));
  const directory = path.join(root, "store"), destination = path.join(root, "backup");
  const storage = new SqliteCiphertextStorage(directory, 10000, 10);
  try { await storage.put("ab".repeat(32), Buffer.from("invalid ciphertext")); }
  finally { await storage.close(); }
  await expect(createCipherstoreBackup(directory, destination)).rejects.toThrow("digest mismatch");
  expect(await readdir(destination)).not.toContain("vulnseal-cipherstore-manifest.json");
});

it("refuses nested destinations and unlisted files without modifying the source", async () => {
  const fixture = await setup();
  await expect(createCipherstoreBackup(fixture.store, path.join(fixture.store, "nested"))).rejects.toThrow("outside its source");
  await createCipherstoreBackup(fixture.store, fixture.backup);
  await writeFile(path.join(fixture.backup, "unlisted.txt"), "unlisted");
  await expect(verifyCipherstoreBackup(fixture.backup)).rejects.toThrow("inventory");
  expect(await readFile(path.join(fixture.store, `${fixture.digest}.ciphertext.json`), "utf8")).toBe(fixture.body);
});

it.each(["filesystem", "sqlite"] as const)("rejects retired ciphertext before creating a %s restoration", async (backend) => {
  const fixture = await setup();
  const manifest = await createCipherstoreBackup(fixture.store, fixture.backup);
  await expect(restoreCipherstoreBackup(fixture.backup, fixture.restored, backend, new RetirementPolicy([fixture.digest]))).rejects.toThrow("STORAGE_RETIRED");
  expect(await readdir(fixture.root)).not.toContain("restored");
  expect(await verifyCipherstoreBackup(fixture.backup)).toEqual(manifest);
  await restoreCipherstoreBackup(fixture.backup, fixture.restored, backend, new RetirementPolicy(["ab".repeat(32)]));
  const roundTrip = await createCipherstoreBackup(fixture.restored, path.join(fixture.root, "round-trip"));
  expect(roundTrip.blobs).toEqual(manifest.blobs);
});

it.each(["filesystem", "sqlite"] as const)("keeps a failed %s restore unusable and permits a fresh explicit restoration", async (backend) => {
  const fixture = await setup();
  const manifest = await createCipherstoreBackup(fixture.store, fixture.backup);
  const failure = new Error("controlled restore write failure");
  const originalOpen = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).open;
  const originalPut = SqliteCiphertextStorage.prototype.put;
  const fault = backend === "filesystem"
    ? vi.spyOn(files, "open").mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]) === path.join(fixture.restored, `${fixture.digest}.ciphertext.json`)) {
        await handle.writeFile("partial ciphertext"); await handle.close(); throw failure;
      }
      return handle;
    })
    : vi.spyOn(SqliteCiphertextStorage.prototype, "put").mockImplementation(async function (digest, body) {
      await originalPut.call(this, digest, body); throw failure;
    });
  try { await expect(restoreCipherstoreBackup(fixture.backup, fixture.restored, backend)).rejects.toThrow(failure); }
  finally { fault.mockRestore(); }
  expect(await readdir(fixture.restored)).toContain(incompleteRestoreName);
  await expect(assertRestoreComplete(fixture.restored)).rejects.toThrow("restore is incomplete");
  const release = await acquireDirectoryLease(fixture.restored); await release();
  const rejectedBackup = path.join(fixture.root, "rejected-backup");
  await expect(createCipherstoreBackup(fixture.restored, rejectedBackup)).rejects.toThrow("restore is incomplete");
  expect(await readdir(fixture.root)).not.toContain("rejected-backup");
  await expect(restoreCipherstoreBackup(fixture.backup, fixture.restored, backend)).rejects.toMatchObject({ code: "EEXIST" });
  expect(await verifyCipherstoreBackup(fixture.backup)).toEqual(manifest);
  const retry = path.join(fixture.root, "fresh-retry");
  await restoreCipherstoreBackup(fixture.backup, retry, backend);
  await assertRestoreComplete(retry);
  const roundTrip = await createCipherstoreBackup(retry, path.join(fixture.root, "retry-backup"));
  expect(roundTrip.blobs).toEqual(manifest.blobs);
});
