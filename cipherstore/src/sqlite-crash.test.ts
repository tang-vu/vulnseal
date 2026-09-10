// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { SqliteCiphertextStorage } from "./sqlite-storage.js";

const execute = promisify(execFile);
const committed = "ab".repeat(32), interrupted = "cd".repeat(32);
const runCrash = async (code: string, directory: string) => {
  try {
    await execute(process.execPath, ["--input-type=module", "-e", code, directory], { windowsHide: true, timeout: 15000 });
    throw new Error("Child did not crash as intended");
  } catch (error) {
    expect(error).toMatchObject({ code: 17, stdout: "CRASH_POINT" });
  }
};

it("retains a worker-acknowledged commit after the hosting process exits without closing it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-committed-crash-"));
  const workerUrl = new URL("./sqlite-worker.ts", import.meta.url).href;
  await runCrash(`
    import { Worker } from 'node:worker_threads';
    import { writeSync } from 'node:fs';
    const worker = new Worker(new URL(${JSON.stringify(workerUrl)}), { execArgv: [], workerData: { directory: process.argv[1], maxBytes: 10000, maxBlobs: 10 } });
    worker.on('error', () => process.exit(2));
    worker.on('message', (message) => {
      if (message.error || message.result !== true) process.exit(3);
      writeSync(1, 'CRASH_POINT'); process.exit(17);
    });
    worker.postMessage({ id: 1, operation: 'put', digest: '${committed}', body: Buffer.from('committed test bytes') });
  `, directory);
  const reopened = new SqliteCiphertextStorage(directory, 10000, 10);
  try {
    expect(Buffer.from(await reopened.read(committed)).toString()).toBe("committed test bytes");
    expect(await reopened.put(committed, Buffer.from("committed test bytes"))).toBe(false);
    await reopened.checkReadiness();
  } finally { await reopened.close(); }
});

it("rolls back a spilled uncommitted transaction after process exit and preserves earlier data", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-transaction-crash-"));
  const store = new SqliteCiphertextStorage(directory, 10000, 10);
  try { await store.put(committed, Buffer.from("retained test bytes")); }
  finally { await store.close(); }
  await runCrash(`
    import { DatabaseSync } from 'node:sqlite';
    import { writeSync } from 'node:fs';
    import path from 'node:path';
    const db = new DatabaseSync(path.join(process.argv[1], 'ciphertext.sqlite'));
    db.exec('PRAGMA cache_size=10; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
    db.prepare('INSERT INTO blobs(digest,body) VALUES(?,zeroblob(4194304))').run('${interrupted}');
    writeSync(1, 'CRASH_POINT'); process.exit(17);
  `, directory);
  expect((await stat(path.join(directory, "ciphertext.sqlite-journal"))).size).toBeGreaterThan(0);
  expect((await stat(path.join(directory, "ciphertext.sqlite"))).size).toBeGreaterThan(1024 * 1024);
  const reopened = new SqliteCiphertextStorage(directory, 10000, 10);
  try {
    expect(Buffer.from(await reopened.read(committed)).toString()).toBe("retained test bytes");
    await expect(reopened.read(interrupted)).rejects.toMatchObject({ code: "ENOENT" });
    await reopened.checkReadiness();
    expect(await reopened.put(interrupted, Buffer.from("explicit later write"))).toBe(true);
  } finally { await reopened.close(); }
});
