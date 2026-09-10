// SPDX-License-Identifier: Apache-2.0
// Run inside a container with a 64 KiB /data tmpfs; writes at most 128 KiB.
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
const { SqliteCiphertextStorage } = await import(process.env.VULNSEAL_SQLITE_MODULE ?? "../cipherstore/dist/sqlite-storage.js");

const directory = await mkdtemp(path.join(process.argv[2] ?? "/data", "sqlite-full-"));
const storage = new SqliteCiphertextStorage(directory, 1024 * 1024, 10);
try {
  await storage.prepare();
  await assert.rejects(storage.put("ab".repeat(32), Buffer.alloc(128 * 1024)), { message: "STORAGE_CAPACITY_EXCEEDED" });
  await assert.rejects(storage.read("ab".repeat(32)), { code: "ENOENT" });
  const retained = Buffer.from("write after automatic full rollback");
  assert.equal(await storage.put("cd".repeat(32), retained), true);
  assert.deepEqual(Buffer.from(await storage.read("cd".repeat(32))), retained);
} finally { await storage.close(); }
process.stdout.write(JSON.stringify({ node: process.version, nativeCapacityErrorReported: true, failedWriteAbsent: true, laterSmallWriteRetained: true }) + "\n");
