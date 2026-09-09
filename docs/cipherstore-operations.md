# Ciphertext service capacity and operation

Run one cipherstore writer process per data directory. Use a persistent local filesystem supporting exclusive creation and hard links; retain the directory across restarts. The HTTP service stores encrypted envelopes only and is not an authenticated multi-tenant object store.

| Setting | Default | Meaning |
| --- | --- | --- |
| `CIPHERSTORE_MAX_STORED_BYTES` | `1073741824` (1 GiB) | Maximum combined size of committed ciphertext files |
| `CIPHERSTORE_MAX_STORED_BLOBS` | `10000` | Maximum number of committed ciphertext files |
| `CIPHERSTORE_MAX_CONCURRENT_UPLOADS` | `16` | Active PUT handlers, including body reads and queued writes |

Set environment variables before starting `npm run start -w @vulnseal/cipherstore`; build first with `npm run build -w @vulnseal/cipherstore`. `.env.example` documents the settings but the Node entrypoint does not automatically load that file. Limits and port values reject malformed integers. Byte/count limits may be zero to stop new writes while retaining reads and idempotent duplicate uploads. Concurrency must be positive. The existing per-envelope limit remains 5 MiB.

Quota checks and publication are serialized for each resolved directory within the process. Each new upload scans committed files, so existing data and process restarts cannot reset usage. Complete identical blobs are returned idempotently before the quota check. Conflicting content is never overwritten. Quota refusal returns HTTP `507` / `storage_capacity_exceeded`; actual `ENOSPC` and `EDQUOT` errors use the same response. Busy admission returns `503` / `upload_capacity_busy` with `Retry-After: 1`. The client explains these cases and does not automatically retry.

## Capacity response

Keep the report draft while resolving an upload error. An operator should inspect volume space and the two configured limits, increase capacity only if the volume can support it, and restart with the revised settings. Lowering a limit below existing usage does not delete files; reads and identical re-uploads continue, while new blobs are refused. Do not delete referenced ciphertext merely to make a new upload fit; existing disclosure and recovery workflows may depend on it.

The byte quota counts matching committed `.ciphertext.json` regular files, not filesystem metadata, temporary files, logs or unrelated directory contents. Reserve additional disk headroom for atomic publication and operations. A crash can leave `.tmp` files; inspect and archive/clean those only with the writer stopped, after confirming they are not committed blobs. No automatic eviction or retention deletion is implemented.

## Deployment limits

The write queue is process-local, not a cross-process lock. Do not share this data directory across independent writers, cluster workers, symlink aliases or replicas. Directory contents are operator-controlled. For multiple writers, use a storage backend or volume quota that enforces atomic reservations across them. Scanning each write trades throughput for simple restart-safe accounting and is not a high-throughput storage index.

`GET /healthz` is process liveness. `GET /readyz` separately checks quota headroom and performs a small write/flush/hard-link/read/delete probe under the same directory write queue as uploads. Concurrent readiness requests share an in-flight probe; successful results are not cached. The probe contains a fixed non-sensitive marker and returns no paths, digests or storage inventory. Readiness returns 200 with `status: ready`, or 503 with `storage_capacity_exceeded` / `storage_unavailable`. The browser test harness waits for this readiness check before starting journeys.

Readiness is a point-in-time check, not a reservation for an upload: it requires at least one byte and one blob slot of configured headroom and sufficient physical space for the small probe, not enough space for every possible 5 MiB envelope. It does not audit existing blob integrity or current upload-slot availability. At quota, liveness and stored-blob reads remain available. Configure write admission or alerts around readiness without unnecessarily removing all read traffic to a full store. Use a moderate polling interval; probes perform actual disk I/O. A process crash can leave `.readiness-*.tmp` files for stopped-writer maintenance.

Put public deployments behind infrastructure with request/time/rate limits and access controls appropriate to the program. These application quotas bound committed content and active upload buffering; they do not provide per-user fairness, disk replication, backup/restore assurance, or complete abuse protection. Hosting, monitoring integration, retention policy and a production-volume backup drill remain release requirements.

## Backup and restore

Stop the writer and prevent other changes to the data directory for the entire copy. Build the CLI, then run these commands from the repository root, substituting your paths:

```text
npm run build -w @vulnseal/cipherstore
node cipherstore/dist/backup.js create <stopped-store-directory> <new-backup-directory>
node cipherstore/dist/backup.js verify <backup-directory>
node cipherstore/dist/backup.js restore <backup-directory> <new-store-directory>
```

Destination parents must exist. The destination directory itself must not exist, even if empty, and must be outside the source tree. No operation merges, overwrites or deletes an existing store. Backup creation copies committed ciphertext files only, validates each envelope and content-address digest, flushes copied files and writes the manifest last. Interrupted temporary files are excluded; other unknown source entries cause failure. Verification checks the exact inventory, manifest structure, byte lengths, envelope format and every digest. Restore verifies first and checks each blob again while copying. A failed copy/restore may leave a partial new directory; do not start a service against it or treat it as a valid backup. Inspect it separately and retry into another fresh directory.

After successful restoration, point `CIPHERSTORE_DATA_DIR` at the new store, start one writer, check `/readyz`, fetch known ciphertext addresses and perform an authenticated decryption with separately retained report keys. Retain the old store until the drill succeeds. The repository tests exercise this sequence with synthetic encrypted content, including real HTTP retrieval and decryption; the compiled CLI drill is recorded in `docs/evidence/cipherstore-backup-drill.json`. Physical off-device recovery and production-volume drills remain operational work.

The manifest proves self-consistency, not provenance: someone who can replace both manifest and files can create a different consistent backup. Keep backups and their trusted inventory in controlled storage. No second encryption layer is added; existing ciphertext remains encrypted, while digests, sizes and counts remain visible to anyone with backup access. Role secrets and report keys are not included. The tool limits manifests to 16 MiB and 100,000 entries and blobs to the HTTP service's 5 MiB limit. It does not make a live distributed snapshot or guarantee survival of filesystem metadata across sudden power loss. Conventional `vulnseal-cipherstore-backup*` directories are Git-ignored; do not commit other backup paths.
