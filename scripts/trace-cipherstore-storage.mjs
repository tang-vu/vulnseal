// SPDX-License-Identifier: Apache-2.0
// Opt-in container-drill preload. Never log SQL, arguments, paths or ciphertext.
import { isMainThread } from "node:worker_threads";

let remaining = 200;
function record(operation, started, ok) {
  if (remaining-- <= 0) return;
  process.stderr.write(JSON.stringify({ storageTrace: true, pid: process.pid,
    thread: isMainThread ? "http" : "sqlite", operation, ok,
    completedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) }) + "\n");
}

if (!isMainThread && process.argv[1] === "/app/dist/sqlite-worker.js") {
  const { DatabaseSync } = await import("node:sqlite");
  const exec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    const operation = /^(BEGIN|COMMIT|ROLLBACK|PRAGMA)\b/.exec(sql.trim())?.[1] ?? "schema";
    const started = performance.now(); let ok = false;
    try { const result = exec.call(this, sql); ok = true; return result; }
    finally { record(operation, started, ok); }
  };
} else if (isMainThread && process.argv[1] === "/app/dist/index.js") {
  const { SqliteCiphertextStorage } = await import("/app/dist/sqlite-storage.js");
  const { FilesystemCiphertextStorage } = await import("/app/dist/filesystem-storage.js");
  for (const Storage of [SqliteCiphertextStorage, FilesystemCiphertextStorage]) {
    for (const operation of ["prepare", "put", "read", "checkReadiness", "close"]) {
      const original = Storage.prototype[operation];
      if (typeof original !== "function") continue;
      Storage.prototype[operation] = async function (...args) {
        const started = performance.now(); let ok = false;
        try { const result = await original.apply(this, args); ok = true; return result; }
        finally { record(operation, started, ok); }
      };
    }
  }
}
