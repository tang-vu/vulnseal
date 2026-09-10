# Ciphertext storage adapter boundary

`createCipherstoreServer` accepts an optional trusted `CiphertextStorage` instance. Without one, it constructs `FilesystemCiphertextStorage` from the existing data-directory and quota options. The CLI and Compose deployment default to filesystem; `CIPHERSTORE_BACKEND=sqlite` selects the SQLite adapter on the server. HTTP clients cannot choose or configure a backend.

The HTTP layer retains envelope validation, SHA-256 address verification before writes and after reads, request/upload limits, CORS, metrics and response error mapping. An adapter owns initialization, exact-byte reads, atomic immutable writes with quota checks, and a write/read readiness probe. Identical retries must succeed even when the store is full; conflicts must never overwrite existing bytes. Missing reads use `ENOENT`, conflicts use `IMMUTABLE_CONFLICT`, and quota failures use `STORAGE_CAPACITY_EXCEEDED`. Other failures remain generic HTTP errors.

For an injected adapter, configure its quotas when constructing it; the server's `maxStoredBytes` and `maxStoredBlobs` configure only its default filesystem adapter. Adapter lifecycle and cross-process exclusion belong to the embedding application. The standard CLI continues to acquire its directory lease before listening and release it only after HTTP operations drain.

The extracted filesystem adapter retains temporary-file flushing, atomic no-overwrite hard-link publication, the shared per-directory write queue, capacity accounting, identical-retry behavior and probe cleanup. Its public read/write methods validate the digest before deriving a path. Existing on-disk filenames and offline backup format are unchanged.

## SQLite backend

`SqliteCiphertextStorage` uses a dedicated worker and a `ciphertext.sqlite` database. Database operations run synchronously inside that worker, not on the HTTP event loop. The [installed Node API](https://github.com/nodejs/node/blob/v24.14.1/doc/api/sqlite.md) remains experimental/active development; keep that limitation in deployment decisions.

Writes use `BEGIN IMMEDIATE`, compare an existing blob before quota checks, and commit with `synchronous=FULL` and DELETE journaling. Quotas count ciphertext payload bytes and blob rows, not database/journal overhead or free disk space. A readiness transaction checks headroom and writes, reads and removes a probe. Reads retain the HTTP layer's digest verification. Pending worker calls are capped at 128; lock waits use a one-second SQLite busy timeout. These limits do not interrupt stalled filesystem I/O or bound OS failure recovery.

The CLI takes the existing directory lease before initializing SQLite. Shutdown drains HTTP operations, closes the database/worker, then releases the lease. A failed worker rejects pending calls and does not restart or retry writes automatically. The CLI rejects switching a filesystem directory to SQLite, or vice versa, without an explicit migration. The embedding API caller remains responsible for lifecycle and exclusion.

Use a new directory and set `CIPHERSTORE_BACKEND=sqlite` with the existing byte/blob quota environment variables. For Compose use a separate project/volume. Do not flip the backend on an existing volume. The database schema has an application ID/version; foreign/unsupported databases fail instead of being adopted. New database files use mode 0600 where supported; OS permissions and disk encryption remain operator responsibilities.

## Offline backup and migration

Stop the writer before using the existing backup command. `create` detects a SQLite source, acquires its directory lease, reads a bounded inventory through the worker, verifies each envelope/digest, and writes the same portable version-1 backup format used by filesystem storage. It closes the worker before releasing the lease. Backup creation fails if the source contains an unrecognized entry or corrupt ciphertext; a partially written destination is not a completed backup.

```sh
node cipherstore/dist/backup.js create /stopped-source /new-backup
node cipherstore/dist/backup.js verify /new-backup
node cipherstore/dist/backup.js restore-sqlite /new-backup /new-sqlite-store
node cipherstore/dist/backup.js restore /new-backup /new-filesystem-store
```

Both restore modes require a new destination and preserve the original backup. Restoring into SQLite imports the verified inventory; configure runtime quotas large enough for that inventory before starting service. A failed restore may leave a partial new directory; do not treat it as complete. No in-place migration, hot backup or automatic physical recovery is provided.

`npm run test:e2e:cross-adapter` starts one filesystem service and one SQLite service and runs the desktop/mobile replication, withholding, corrupt-response and backfill journeys. This proves local interoperability across implementations, not geographic independence or a production availability SLA. Offline backup tests also migrate filesystem to SQLite and back, retrieve the restored ciphertext over HTTP and decrypt the synthetic report.
