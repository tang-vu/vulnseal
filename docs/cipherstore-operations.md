# Ciphertext service capacity and operation

Run one cipherstore writer process per data directory. Use a persistent local filesystem supporting exclusive creation and hard links; retain the directory across restarts. The HTTP service stores encrypted envelopes only and is not an authenticated multi-tenant object store.

| Setting | Default | Meaning |
| --- | --- | --- |
| `CIPHERSTORE_MAX_STORED_BYTES` | `1073741824` (1 GiB) | Maximum combined size of committed ciphertext files |
| `CIPHERSTORE_MAX_STORED_BLOBS` | `10000` | Maximum number of committed ciphertext files |
| `CIPHERSTORE_MAX_CONCURRENT_UPLOADS` | `16` | Active PUT handlers, including body reads and queued writes |
| `CIPHERSTORE_REQUEST_TIMEOUT_MS` | `30000` | Request-receipt and socket-inactivity timeout; integer 1–300000 ms |
| `CIPHERSTORE_MAX_CONNECTIONS` | `64` | Concurrent TCP connections; integer 1–10000 |

Set environment variables before starting `npm run start -w @vulnseal/cipherstore`; build first with `npm run build -w @vulnseal/cipherstore`. `.env.example` documents the settings but the Node entrypoint does not automatically load that file. Limits and port values reject malformed integers. Byte/count limits may be zero to stop new writes while retaining reads and idempotent duplicate uploads. Concurrency must be positive. The existing per-envelope limit remains 5 MiB.

For local development, `npm run dev -w @vulnseal/cipherstore` (also used by `npm run demo`) builds and runs a dedicated development launcher. It loads root `.env`, `.env.local`, `.env.development`, then `.env.development.local` through Vite's development env parser, with shell values taking precedence. Only `CIPHERSTORE_*` values are copied into the service environment. Relative `CIPHERSTORE_DATA_DIR` values resolve against the repository root; absence selects `cipherstore/data` there. This fixes the sample `./cipherstore/data` path when npm runs from the nested workspace. The launcher enters the existing server CLI in the same process, preserving its directory lease and shutdown handling. It does not affect the production `start` command, container or backup CLI: supply their environment explicitly, preferably with absolute data paths.

Quota checks and publication are serialized for each resolved directory within the process. Each new upload scans committed files, so existing data and process restarts cannot reset usage. Complete identical blobs are returned idempotently before the quota check. Conflicting content is never overwritten. Quota refusal returns HTTP `507` / `storage_capacity_exceeded`; actual `ENOSPC` and `EDQUOT` errors use the same response. Busy admission returns `503` / `upload_capacity_busy` with `Retry-After: 1`. The client explains these cases and does not automatically retry.

`CipherstoreClient` uses a 20-second request timeout by default, including the response-body read for GET. Applications can supply a timeout in milliseconds as the second constructor argument (1–300000). A timeout aborts the fetch and reports recovery guidance without automatically retrying. A timed-out PUT may already have been stored; client cancellation does not roll back server publication. Retain the draft and recovery material. An identical envelope remains idempotent, while sealing a draft again can produce different encrypted bytes. This client deadline does not replace server/proxy request limits or establish a service latency guarantee.

The client independently enforces the service's 5 MiB envelope limit. Oversized PUT bodies are rejected before hashing or fetching. GET bodies are read incrementally into a bounded byte buffer, counting the bytes exposed by Fetch after transport decompression rather than trusting `Content-Length`. Excess input cancels the reader; successful reads require valid UTF-8 and the expected digest. Byte-order marks and split multibyte characters are preserved for digest verification. PUT response bodies and unsuccessful GET response bodies are cancelled because their contents are not needed. This bounds application ciphertext accumulation, not the browser's total memory or internal network buffers.

## Capacity response

The service bounds transport occupancy independently of upload admission. Complete request receipt has a 30-second default deadline, headers have the smaller of 10 seconds and the configured request deadline, and timeout checks run at most one second apart. Silent sockets and inactive responses also use the configured timeout. HTTP headers are limited to 16 KiB, the advertised keep-alive timeout to five seconds (with the additional Node socket timeout buffer), and each connection to 100 requests. These use [Node HTTP server controls](https://nodejs.org/docs/latest-v24.x/api/http.html#serverrequesttimeout); timer scheduling is not a hard real-time guarantee.

A slow request can receive HTTP 408 or lose its socket. Connections above the configured ceiling are closed before entering the HTTP handler, so clients must not assume every refusal has a JSON body. Interrupted body reads release upload slots and do not publish partial ciphertext. A socket closing after a complete upload has been received is still an uncertain outcome: disk work may finish and publish the blob. Do not infer rollback or automatically reseal from a transport error. These process-wide controls do not implement per-user fairness or replace reverse-proxy rate limits. At the connection ceiling even health probes can be refused.

Keep the report draft while resolving an upload error. An operator should inspect volume space and the two configured limits, increase capacity only if the volume can support it, and restart with the revised settings. Lowering a limit below existing usage does not delete files; reads and identical re-uploads continue, while new blobs are refused. Do not delete referenced ciphertext merely to make a new upload fit; existing disclosure and recovery workflows may depend on it.

The byte quota counts matching committed `.ciphertext.json` regular files, not filesystem metadata, temporary files, logs or unrelated directory contents. Reserve additional disk headroom for atomic publication and operations. A crash can leave `.tmp` files; inspect and archive/clean those only with the writer stopped, after confirming they are not committed blobs. No automatic eviction or retention deletion is implemented.

## Deployment limits

### Container deployment

The repository includes a multi-stage [Dockerfile](../infra/cipherstore.Dockerfile) and [Compose configuration](../infra/cipherstore.yml). The Node 24.14.1 Debian base is pinned by registry digest. Build inputs are allowlisted by the Dockerfile-specific ignore file; local secrets, data, Git history and generated contract artifacts are excluded. The runtime image contains the compiled service and backup CLI without workspace dependencies or build tools. It runs as the image's `node` user; Compose adds a read-only root filesystem, a named `/data` volume, dropped capabilities, no-new-privileges, process/memory limits and bounded container logs.

From the repository root:

```text
docker compose -p vulnseal-cipherstore -f infra/cipherstore.yml config --quiet
docker compose -p vulnseal-cipherstore -f infra/cipherstore.yml up --build -d --wait
docker compose -p vulnseal-cipherstore -f infra/cipherstore.yml ps
docker compose -p vulnseal-cipherstore -f infra/cipherstore.yml logs --tail 100 cipherstore
docker compose -p vulnseal-cipherstore -f infra/cipherstore.yml stop
```

The default published address is `127.0.0.1:8787`. Set `CIPHERSTORE_PUBLISHED_PORT` to change the host port and `CIPHERSTORE_ALLOWED_ORIGIN` to the exact browser origin; these can be supplied through your shell or Compose's `--env-file`. Capacity settings listed above are also forwarded. CORS is not authentication. This configuration supplies no public TLS endpoint, reverse proxy, user authentication or per-user rate limit; configure those at the hosting boundary before public exposure. Do not treat it as a complete hosted production release.

[The environment example](../infra/cipherstore.env.example) lists all forwarded settings. For a custom file, insert `--env-file <path>` after `docker compose` in the commands above. When invoking Linux Docker through a Windows/WSL wrapper, Windows shell environment variables may not be forwarded to WSL. Use an explicit Compose env file, or set variables inside the Linux invocation, and inspect the resulting published port with `docker compose ... port cipherstore 8787` before directing traffic to it.

The named volume persists across container recreation. Keep the Compose project name stable to reuse it; changing the project name ordinarily creates another volume. Do not use `down --volumes` for a store you need to retain. A fresh named volume inherits the image's `/data` ownership. Existing bind mounts require appropriate ownership and hard-link support; this configuration does not automatically chown an existing store. The six-minute stop grace period allows normal Node request draining; forced termination can still leave the directory lease, which requires the stopped-writer inspection described below.

The container healthcheck runs `/readyz` every 30 seconds with a five-second fetch deadline. A full volume becomes unhealthy while existing ciphertext remains readable; Docker does not restart a process merely because its healthcheck is unhealthy. `restart: unless-stopped` covers process exits only. Alert on unhealthy status and inspect capacity/storage rather than deleting data or automatically restarting a full store. The image and host still need vulnerability scans, base-image updates and external monitoring.

Run the isolated verification after building the image:

```text
docker build -f infra/cipherstore.Dockerfile -t vulnseal-cipherstore:local .
node scripts/test-cipherstore-container.mjs
```

On Windows, the drill uses `docker.exe` directly. If Docker is available only inside WSL, set `VULNSEAL_DOCKER_WSL_DISTRO` to that distribution's name before running the script (for example, `$env:VULNSEAL_DOCKER_WSL_DISTRO='Ubuntu'` in PowerShell). This invokes `wsl.exe --exec docker` with argument arrays; it does not execute a shell wrapper. Localhost forwarding from WSL to the host must work for the HTTP checks.

The drill uses a uniquely named, labelled test container and volume, a random localhost port and synthetic AES-GCM ciphertext. It checks non-root/read-only configuration, readiness, idempotent uploads, quota rejection, retained reads, the second-writer lease, graceful restart and authenticated decryption of the retained bytes. It removes only its own labelled resources when finished. CI is configured to run this drill; a locally successful run is not evidence that the remote CI job has executed. This is not a physical off-device backup or production-volume recovery test.

The write queue is process-local. The service CLI now also acquires an exclusive `.vulnseal-writer.lock` directory before listening, resolving the data directory through `realpath`. Backup creation takes the same lease on its source and restoration holds it on its new destination. A cooperating second CLI or backup operation fails while the lease exists. Library embedders using `createCipherstoreServer` directly must acquire `acquireDirectoryLease` themselves, then close the server, await `server.drain()` and release the lease when stopping. The CLI performs this ordering for SIGINT/SIGTERM and releases a lease if initial listen fails.

This is cooperative exclusion, not a database lock against arbitrary filesystem writers. Directory contents remain operator-controlled. Do not share a data directory with processes bypassing the lease or assume this supplies distributed replica coordination. For multiple writers, use a storage backend or volume quota that enforces atomic reservations across them. Scanning each write trades throughput for simple restart-safe accounting and is not a high-throughput storage index.

Abnormal termination, including forced Windows termination, can leave a lock. It is deliberately not reclaimed automatically: PID reuse or an unavailable process probe is not proof that the writer is gone. Inspect `owner.json`, stop/verify all owners and maintenance jobs, and only then remove that owner file and its empty lock directory. Never remove a lock from an active store. Shutdown can wait for in-flight requests and file operations; forced termination leaves recovery to the operator. Each browser-suite invocation now uses a fresh temporary data directory so forced test teardown does not lock a later run's store.

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
