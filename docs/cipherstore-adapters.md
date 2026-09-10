# Ciphertext storage adapter boundary

`createCipherstoreServer` accepts an optional trusted `CiphertextStorage` instance. Without one, it constructs `FilesystemCiphertextStorage` from the existing data-directory and quota options. The CLI and Compose deployment default to filesystem; `CIPHERSTORE_BACKEND=sqlite` selects the SQLite adapter on the server. HTTP clients cannot choose or configure a backend.

The HTTP layer retains envelope validation, SHA-256 address verification before writes and after reads, request/upload limits, CORS, metrics and response error mapping. An adapter owns initialization, exact-byte reads, atomic immutable writes with quota checks, and a write/read readiness probe. Identical retries must succeed even when the store is full; conflicts must never overwrite existing bytes. Missing reads use `ENOENT`, conflicts use `IMMUTABLE_CONFLICT`, and quota failures use `STORAGE_CAPACITY_EXCEEDED`. Other failures remain generic HTTP errors.

For an injected adapter, configure its quotas when constructing it; the server's `maxStoredBytes` and `maxStoredBlobs` configure only its default filesystem adapter. Adapter lifecycle and cross-process exclusion belong to the embedding application. The standard CLI continues to acquire its directory lease before listening and release it only after HTTP operations drain.

The extracted filesystem adapter retains temporary-file flushing, atomic no-overwrite hard-link publication, the shared per-directory write queue, capacity accounting, identical-retry behavior and probe cleanup. Its public read/write methods validate the digest before deriving a path. Existing on-disk filenames and offline backup format are unchanged.

## SQLite backend

The compiled `SqliteCiphertextStorage` adapter also works when imported by Node scripts invoked through `--eval` or stdin with the CLI option `--input-type=module` (including its separate-argument spelling). Its worker loads a file, so the adapter removes that input-only option from the worker's inherited execution arguments while preserving the others. Regression tests spawn real child processes, write/read a fixture, close the adapter, and reopen it to verify persistence and idempotence. Build the service before running these compiled-entrypoint tests: `npm run build -w @vulnseal/cipherstore`.

`SqliteCiphertextStorage` uses a dedicated worker and a `ciphertext.sqlite` database. Database operations run synchronously inside that worker, not on the HTTP event loop. The [installed Node API](https://github.com/nodejs/node/blob/v24.14.1/doc/api/sqlite.md) remains experimental/active development; keep that limitation in deployment decisions.

Writes use `BEGIN IMMEDIATE`, compare an existing blob before quota checks, and commit with `synchronous=FULL` and DELETE journaling. Quotas count ciphertext payload bytes and blob rows, not database/journal overhead or free disk space. A readiness transaction checks headroom and writes, reads and removes a probe. Reads retain the HTTP layer's digest verification. Pending worker calls are capped at 128; lock waits use a one-second SQLite busy timeout. These limits do not interrupt stalled filesystem I/O or bound OS failure recovery.

SQLite BUSY/LOCKED errors and a full worker queue return HTTP 503 with `Retry-After: 1`; native SQLITE_FULL maps to the existing HTTP 507 capacity response. Classification uses the primary byte of the [SQLite result code](https://www.sqlite.org/rescode.html), including extended codes. The server does not retry a write. Transaction cleanup checks whether SQLite has already rolled back before attempting its own rollback, preserving the original error. A constrained-tmpfs test exercises native capacity failure and a successful smaller write afterward; lock tests confirm that a rejected upload is absent until explicitly retried.

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

Both restore modes require a new destination and preserve the original backup. Restoring into SQLite imports the verified inventory; configure runtime quotas large enough for that inventory before starting service. Before copying, restore writes and flushes `.vulnseal-restore-incomplete`. It removes this marker only after all blobs are written and the SQLite worker, if used, has closed successfully. Failed restores retain the marker; service CLI startup and backup creation reject marked directories. Inspect the failed directory separately and restore the verified backup into another new directory; do not remove the marker to bypass the guard. Direct library users must call the exported `assertRestoreComplete(directory)` before serving a restored directory: adapters do not perform this CLI lifecycle check themselves. No in-place migration, hot backup or automatic physical recovery is provided.

`npm run test:e2e:cross-adapter` starts one filesystem service and one SQLite service and runs the desktop/mobile replication, withholding, corrupt-response and backfill journeys. This proves local interoperability across implementations, not geographic independence or a production availability SLA. Offline backup tests also migrate filesystem to SQLite and back, retrieve the restored ciphertext over HTTP and decrypt the synthetic report.

`node scripts/test-cipherstore-container.mjs --backend=sqlite` checks the packaged runtime with a fresh labeled volume, restricted container permissions, quota exhaustion and graceful restart. `--write-evidence` records the image-bound result. Process-exit tests separately cover a worker-acknowledged commit and recovery from a spilled uncommitted transaction. They do not emulate lost disk writes or bypass the CLI's stale directory lease after an abrupt process exit. Follow the operator lease-recovery procedure only after confirming the former writer is gone. The validation report preserves both successful checks and observed failures.
