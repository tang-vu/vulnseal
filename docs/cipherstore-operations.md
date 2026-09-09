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

`/healthz` is process liveness, not proof of writable storage or free capacity. Put public deployments behind infrastructure with request/time/rate limits and access controls appropriate to the program. These application quotas bound committed content and active upload buffering; they do not provide per-user fairness, disk replication, backup/restore assurance, or complete abuse protection. Hosting, monitoring, retention policy and a verified backup drill remain release requirements.
