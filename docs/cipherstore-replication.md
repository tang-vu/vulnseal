# Configure replicated ciphertext storage

The browser can upload each saved encrypted envelope to two or three explicitly configured ciphertext endpoints. With no replicas configured it retains the single-store behavior. The report/key/salt/commitment formats do not change. Endpoint configuration is public build configuration, not private report metadata.

Set the primary and up to two comma-separated additional URLs in repository-root `.env.production` (or shell variables) before building the web release:

```text
VITE_CIPHERSTORE_URL=https://primary.example
VITE_CIPHERSTORE_REPLICAS=https://replica.example
```

Replace these placeholders with services you operate and have verified. Each must support the existing `/v1/blobs/sha256:...` protocol, including matching CORS for the actual web origin. Credentials, query strings, fragments, duplicate normalized URLs and more than three total endpoints are rejected. Distinct URLs do not prove distinct storage, operators or failure domains. Use HTTPS on public deployments. The UI lists all configured destinations before authoring/upload, including the ciphertext size/address/timing metadata their operators can observe. Requests omit browser credentials/referrers and refuse redirects.

Validation also rejects empty `?` / `#` suffixes, which would otherwise swallow an appended blob path, and removes trailing path slashes before checking duplicates. Encoded path characters such as `%3F` remain valid. The direct single-store client enforces the same endpoint rules as the factory. Vite checks effective public configuration before serving/building; this is a syntax gate, not a reachability probe.

`createCipherstoreClient(urls)` selects the existing single client or `ReplicatedCipherstoreClient`. Replicated PUTs run once per destination in parallel. All must acknowledge before the operation resolves. A partial failure reports the acknowledged count, waits for the bounded remaining attempts, and leaves the local encrypted report available. Failure does not imply that a destination discarded its bytes: its response could be lost. An explicit retry sends the identical envelope to every destination; the existing service makes identical PUTs idempotent. There is no background retry, delete, overwrite or rollback of a successful copy.

Reads try destinations in configured order and accept only bytes matching the requested SHA-256. HTTP errors, timeout, oversized/invalid UTF-8 responses and digest mismatch move to the next destination. Each attempt keeps the existing 20-second deadline and 5 MiB cap; default worst-case read latency is approximately 60 seconds for three failed sources, plus local processing. Reads stop at the first verified copy and never repair storage implicitly. If all copies fail, the combined browser retains its existing authenticated local-backup fallback. Direct API callers receive an error.

The all-destinations write policy favors completing configured replication over write availability: one unavailable replica prevents a new report's upload gate from completing. It does not prevent reading a valid existing copy elsewhere. A successful HTTP response is an acknowledgment, not proof of lasting retention. The client cannot tell whether a malicious endpoint actually persisted bytes.

## Copy saved workspace reports

To copy existing reports after configuring a new destination, restore the encrypted role backup (offline restore is supported), open Reports and choose **Upload all saved ciphertext**. The current workspace must first be backed up or saved by encrypted browser autosave. The batch sends saved envelopes in order, preserves every key/report ID/content address, and performs no wallet connection or contract submission. Progress counts reports acknowledged by every configured destination, not individual endpoint responses.

The first unconfirmed report stops the batch and becomes the selected report. Earlier copies remain stored; later reports are skipped. Retry the selected report individually or repeat the complete batch with the same saved bytes. The batch keeps no durable upload journal or automatic resume cursor. **Stop remaining uploads** waits for the current report's bounded requests to settle before skipping later reports. Unmounting the workspace also prevents later requests; already-started requests may still store bytes. Keep the encrypted backup regardless of the reported result.

## Two local services

The existing [container configuration](../infra/cipherstore.yml) can run as two separately named Compose projects. Give each a public env file with a distinct `CIPHERSTORE_PUBLISHED_PORT` (for example 8787 and 8788) and the same intended `CIPHERSTORE_ALLOWED_ORIGIN`. Then run:

```text
docker compose --env-file path/to/primary.env -p vulnseal-primary -f infra/cipherstore.yml up --build --wait
docker compose --env-file path/to/replica.env -p vulnseal-replica -f infra/cipherstore.yml up --no-build --wait
```

The project names give the `ciphertext` named volumes distinct identities; do not bind both services to the same data directory. Configure the local web build's primary URL and replica URL to those ports. Env files work with the repository's Windows/WSL Docker wrapper; host shell variables may not pass through it. These are loopback services, not public TLS deployment. Apply the [operations and backup procedure](cipherstore-operations.md) independently to each store. Do not remove volumes merely to test a failure.

## Executed browser drill

`npm run test:e2e:replication` starts two real local filesystem-backed services on 8797/8798 with separate random data directories, builds the two-endpoint browser artifact, and runs desktop/mobile cases. It simulates an unavailable second upload endpoint, checks completion is blocked, explicitly retries identical bytes, GETs both real stored copies, injects corrupt reads from the primary, and then corrupt reads from both. The first case uses the other valid copy; the second falls back to the authenticated local envelope. No read adds a write. A restored offline role also PUTs its saved envelope to both real services without Lace.

The ordinary browser config explicitly clears replicas; the separate replication config sets its own endpoints. CI is configured to run both suites. Rebuild normal production configuration afterwards before packaging or comparing a release artifact.

This supplies replication across two HTTP service instances using the same filesystem adapter. It is not cross-region evidence, a second adapter implementation, automatic historical backfill, physical backup recovery, deletion/retention policy, high availability or completion of the Wave 2/3 roadmap. Existing blobs are not copied until explicitly reuploaded. Removing a destination from configuration does not delete its retained data. Corrupt immutable server files require the operator's restore procedure; read fallback does not rewrite them.
