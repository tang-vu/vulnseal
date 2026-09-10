// SPDX-License-Identifier: Apache-2.0
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { mkdirSync, openSync, closeSync, lstatSync } from "node:fs";
import path from "node:path";

const port = parentPort!;
const { directory, maxBytes, maxBlobs } = workerData as { directory: string; maxBytes: number; maxBlobs: number };
let db: DatabaseSync | undefined;
function initialize(): DatabaseSync {
  if (db) return db;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "ciphertext.sqlite");
  let fresh = false;
  try { closeSync(openSync(filename, "wx", 0o600)); fresh = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if (!lstatSync(filename).isFile() || lstatSync(filename).isSymbolicLink()) throw new Error("INVALID_DATABASE_FILE");
  const connection = new DatabaseSync(filename, { timeout: 1000, allowExtension: false });
  try {
    if (fresh) {
      connection.exec(`BEGIN IMMEDIATE;
        CREATE TABLE blobs (digest TEXT PRIMARY KEY CHECK(length(digest)=64 AND digest NOT GLOB '*[^0-9a-f]*'), body BLOB NOT NULL CHECK(length(body)<=5242880)) STRICT;
        CREATE TABLE readiness_probe (id INTEGER PRIMARY KEY CHECK(id=1), body BLOB NOT NULL) STRICT;
        PRAGMA application_id=1448297292;
        PRAGMA user_version=1;
        COMMIT;`);
    }
    if (connection.prepare("PRAGMA application_id").get()?.application_id !== 1448297292 || connection.prepare("PRAGMA user_version").get()?.user_version !== 1) throw new Error("UNSUPPORTED_DATABASE_FORMAT");
    connection.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;");
    db = connection;
    return connection;
  } catch (error) { connection.close(); throw error; }
}
function capacity(connection: DatabaseSync, incoming: number): void {
  const totals = connection.prepare("SELECT count(*) AS count, coalesce(sum(length(body)),0) AS bytes FROM blobs").get()!;
  if (Number(totals.count) >= maxBlobs || Number(totals.bytes) > maxBytes - incoming) throw new Error("STORAGE_CAPACITY_EXCEEDED");
}
function transaction<T>(connection: DatabaseSync, action: () => T): T {
  connection.exec("BEGIN IMMEDIATE");
  try { const result = action(); connection.exec("COMMIT"); return result; }
  catch (error) { connection.exec("ROLLBACK"); throw error; }
}
port.on("message", ({ id, operation, digest, body }: { id: number; operation: string; digest?: string; body?: Uint8Array }) => {
  try {
    if (operation === "close") { db?.close(); db = undefined; port.postMessage({ id }); port.close(); return; }
    const connection = initialize();
    let result: unknown;
    if (operation === "prepare") { /* Initialization above is sufficient. */ }
    else if (operation === "list") {
      const rows = connection.prepare("SELECT digest FROM blobs ORDER BY digest LIMIT 100001").all();
      if (rows.length > 100000) throw new Error("Backup contains too many blobs");
      result = rows.map((row) => row.digest);
    }
    else if (operation === "ready") {
      transaction(connection, () => {
        capacity(connection, 1);
        const probe = Buffer.from("vulnseal-storage-probe");
        connection.prepare("INSERT INTO readiness_probe(id,body) VALUES(1,?)").run(probe);
        const stored = connection.prepare("SELECT body FROM readiness_probe WHERE id=1").get()!.body as Uint8Array;
        if (!Buffer.from(stored).equals(probe)) throw new Error("READINESS_PROBE_MISMATCH");
        connection.exec("DELETE FROM readiness_probe WHERE id=1");
      });
    } else {
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("INVALID_STORAGE_DIGEST");
      if (operation === "read") {
        const row = connection.prepare("SELECT body FROM blobs WHERE digest=?").get(digest);
        if (!row) throw Object.assign(new Error("Blob not found"), { code: "ENOENT" });
        result = row.body;
      } else if (operation === "put") {
        if (!(body instanceof Uint8Array) || body.byteLength > 5242880) throw new Error("PAYLOAD_TOO_LARGE");
        result = transaction(connection, () => {
          const existing = connection.prepare("SELECT body FROM blobs WHERE digest=?").get(digest);
          if (existing) {
            if (!Buffer.from(existing.body as Uint8Array).equals(Buffer.from(body))) throw new Error("IMMUTABLE_CONFLICT");
            return false;
          }
          capacity(connection, body.byteLength);
          connection.prepare("INSERT INTO blobs(digest,body) VALUES(?,?)").run(digest, body);
          return true;
        });
      } else throw new Error("UNSUPPORTED_STORAGE_OPERATION");
    }
    port.postMessage({ id, result });
  } catch (error) {
    const cause = error as Error & { code?: string };
    port.postMessage({ id, error: { message: cause.message, code: cause.code } });
  }
});
