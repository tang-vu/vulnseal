# Validation report

## Incomplete restoration startup guard -- 2026-09-10

Filesystem and SQLite restoration now leave a flushed `.vulnseal-restore-incomplete` marker until copying and SQLite closure succeed. Service CLI startup and backup creation refuse marked directories; backup refusal happens before creating a destination. Failure cleanup retains the marker and releases the cooperative lease when possible. Existing destinations remain protected against overwrite; recovery requires an explicit restore into a new directory. Library embedders must call the exported `assertRestoreComplete` themselves before serving restored data.

All **35 cipherstore tests across 7 files passed (15.96s)**. New controlled failures occurred after writing partial filesystem bytes and after a real SQLite insertion. Both cases retained the marker, released the lease, rejected a backup of the failed destination, preserved the verified source backup, and successfully restored into a fresh destination. Two initial test attempts failed because of the fault-injection mock setup (native ESM namespace and recursive mock); those attempts are not passes. The final suite used the real file opener behind the injected write failure.

A separate compiled CLI check on Node **24.14.1** exited **0**: both backend subprocesses exited **1** with the incomplete-restore error before listening, retained the marker, released the writer lease, and created no database. Build passed. These are controlled write-failure and startup checks, not a process-kill or power-loss restoration drill. No runtime image was rebuilt or rescanned, no web artifact changed, and no wallet transaction or public deployment occurred.

## SQLite lock and native capacity error recovery -- 2026-09-10

SQLite lock/queue pressure now produces **HTTP 503 with Retry-After: 1**, while native SQLITE_FULL produces the existing capacity error mapped to **HTTP 507**. Extended error codes are classified by their primary byte. The worker does not retry writes. Transaction cleanup now checks `isTransaction` before rollback: SQLite can already have rolled back, and the previous unconditional rollback could replace the original failure with a secondary error.

All **33 cipherstore tests across 7 files passed (12.11s)**; build/typecheck passed. A real second database connection held a write lock: HTTP upload returned 503, liveness remained available during the pending upload, the requested blob was absent after lock release, and an explicit retry then stored the exact bytes. A trigger-induced automatic rollback retained its original error, left no blob and allowed a later successful write after removing the test trigger. Existing crash, backup and adapter regressions also passed.

A separate Docker test limited `/data` tmpfs to **64 KiB** while the adapter's logical quota was **1 MiB**. A **128 KiB** write produced native capacity failure and left no row; a subsequent small write/read succeeded. The final probe exited **0** on Node **24.20.0** and used current compiled code mounted read-only into the prior runtime image. [Evidence](evidence/sqlite-native-full.json) identifies the harness image and mounted-code hashes. This is not a newly built or rescanned production image, nor a physical disk exhaustion/power-loss test. CI now runs the probe against its freshly built image; the edited workflow has not run remotely. No web artifact or wallet operation changed.

## SQLite container and process-crash recovery checks -- 2026-09-10

The current ciphertext image built with **exit 0**, including **29 tests across 6 files on Alpine (9.95s)**. Exact image: **sha256:111a0bc29720ae851f2c18c15b10517c23b39b964614d6cfcba6b4936f96c643**. Docker warned that Git revision metadata was not captured. Two additional process-crash tests were added after the build context was captured and passed separately on host Node **24.14.1**: **2 tests, 4.80s**. They are not included in the image-build test count.

One child process exited without closing its SQLite worker after the worker acknowledged a commit; reopening retained the exact bytes and an identical retry remained idempotent. Another child exited inside an uncommitted transaction after a 4 MiB insertion spilled to disk. The test confirmed a nonempty rollback journal and database growth before reopening, then verified the uncommitted row was absent, earlier data remained intact and subsequent writes succeeded. This is process-exit/database-recovery evidence, not physical power-loss testing or automatic stale CLI-lease recovery.

The container drill now accepts an explicit backend and binds its evidence to the image ID selected before startup. The filesystem run passed at **06:08:51.399 UTC**, exit **0** after cleanup. The first SQLite attempt, run alongside that drill and scanning, failed with `UND_ERR_SOCKET` before receiving an HTTP response. Its exact request was not captured, and no cause is established. The drill gained request-stage and bounded container-log diagnostics; an explicit subsequent SQLite run passed at **06:10:17.771 UTC**, exit **0** after cleanup. No runtime, request timeout or retry policy changed between those attempts. The initial failure remains part of the evidence and is not counted as successful.

Both successful runs verified non-root/read-only execution, metrics/readiness, continuous-upload deadlines, immutable retries at quota, rejection of a second writer, graceful restart and exact persisted ciphertext decryption. SQLite additionally checked the actual database file header. Both final stops exited **0**. [Filesystem](evidence/cipherstore-filesystem-container-drill.json) and [SQLite](evidence/cipherstore-sqlite-container-drill.json) records identify the image; an ownership-filtered check found no remaining drill containers or volumes. CI now includes the SQLite drill but has not run remotely.

The same image's strict Trivy scan exited **0**, reporting zero Alpine/node-pkg findings. It also warned that Alpine 3.24 was absent from its EOL list, so this does not prove OS-support coverage. [Scan evidence](evidence/cipherstore-sqlite-runtime-scan.json) records both output-stream hashes and this limit. No application runtime code or web artifact changed in this increment; no new wallet transaction or public deployment occurred.

## SQLite persistence and cross-adapter recovery -- 2026-09-10

The second persistent storage implementation now uses SQLite in a dedicated Node worker. Immutable writes and logical byte/blob quotas share an immediate transaction; identical retries succeed at capacity. The database uses FULL synchronization and DELETE journaling. Readiness probes write/read/remove their data transactionally. Worker failure rejects pending calls without retry, and the CLI drains HTTP operations before closing the worker and releasing its directory lease. Backend selection is explicit through `CIPHERSTORE_BACKEND`; a directory containing the other backend's data is rejected.

Offline backup detects SQLite, exports verified ciphertext into the existing portable manifest format, and closes the worker before releasing its lease. `restore-sqlite` imports that format into a new database; ordinary `restore` still creates a filesystem store. Tests migrated a real encrypted envelope filesystem -> SQLite -> filesystem, fetched the restored bytes over HTTP and decrypted the original synthetic report. A held directory lease blocked backup, an existing destination was retained, and a bad SQLite blob prevented publication of a completed backup manifest.

The final cipherstore run passed **29 tests in 6 files (9.61s)** and build/typecheck passed. SQLite cases include twelve concurrent identical writes, conflicts, full quota/readiness, reopening persisted data, two connections competing for quota, HTTP service behavior and rejection of a foreign database file without changing its bytes. The new cross-adapter browser command passed **4 desktop/Pixel 7 cases in 50.5s**, exit **0**, with one filesystem service and one SQLite service. It covers withheld writes, exact ciphertext copies, corrupt read responses and multi-report backfill. CI now includes that command; the edited workflow has not run remotely.

Compose configuration validation passed. The normal release build exited **0**, with source comparison at **06:01:16.023 UTC** and **8 circuits, 62 files, 62,649,560 bytes**; proving keys were retained. This local result does not establish power-loss recovery, geographic independence, container runtime compatibility, fresh runtime security clearance or production readiness. Node emits its SQLite experimental warning; quotas exclude database/journal overhead. See [operator limits](cipherstore-adapters.md). No new wallet transaction or public deployment occurred.

## Extract the ciphertext storage adapter boundary -- 2026-09-10

Filesystem publication, quota checks and readiness probes now live in `FilesystemCiphertextStorage`, behind the trusted `CiphertextStorage` interface. The HTTP layer keeps envelope/address validation, corruption detection, limits and error mapping. The default CLI/backup/deployment path continues to use the filesystem implementation and its directory lease. The new adapter methods reject malformed digest keys before deriving filesystem paths. This is preparation for another persistent backend, not completion of one; [adapter responsibilities](cipherstore-adapters.md) document quota ownership and lifecycle limits.

All **23 cipherstore tests across 5 files passed (5.89s)**, including the existing concurrency, capacity, readiness, transport, lease and backup cases plus injected-adapter HTTP validation/error handling and invalid-key tests. Cipherstore typecheck and build passed. The desktop/Pixel 7 two-store browser suite passed **4 cases in 50.7s**, exit **0**, with no automatic retries, verifying identical ciphertext, partial-write blocking, corrupt-replica rejection and backfill through the refactored default backend.

The normal release build then passed: source comparison **05:48:35.835 UTC**, six workspace builds, **8 circuits, 62 files, 62,649,560 bytes**, retained proving keys. No Docker rebuild/security rescan, external backend, public deployment or native-wallet test occurred. Cross-adapter replication and the second backend's transaction/backup/shutdown behavior remain open.

## Consolidated regression baseline -- 2026-09-10

At application revision **d744aba**, `npm run validate` exited **0**: all six workspace builds/typechecks and **294 tests across 53 files** passed, including **194 web tests across 39 files**. The separate release/environment/compiler checks passed **16 tests**. The full Chrome desktop/Pixel 7 suite passed **78 cases in 4.1 minutes**, and the separate two-store replication suite passed **4 cases in 48.6 seconds**. Both browser commands used two CI workers, no automatic retries, and exited **0**; no code or timeout changes were needed in this consolidated run.

After browser testing, the normal `release:build` passed with source comparison at **05:42:19.796 UTC** and a final inventory of **8 circuits, 62 files, 62,649,560 bytes**. This replaces the artifact configured for browser-test storage endpoints. Proving keys were retained. [Consolidated evidence](evidence/consolidated-d744aba.json) records the counts, commands and limits.

This is current local regression evidence, not native-wallet or public deployment validation. The runtime security findings remain unresolved and Docker images were not rebuilt or rescanned. The roadmap review still finds unimplemented escrow/disputes, a second storage-adapter implementation and external audit/pilot evidence; testing two instances of the same HTTP/filesystem service does not complete the two-adapter requirement. Those requirements remain open.

## Cancel public lookup and receipt import -- 2026-09-10

The public verifier now exposes cancellation for its existing abortable lookup. Receipt imports show a distinct reading state, disable lookup until the import finishes or is canceled, and clear the file input so the same receipt can be selected again after edits. Canceling ignores late file contents or errors; it does not interrupt the browser's underlying `File.text()` read. Receipt import still only fills the form and never starts a network lookup automatically.

The focused component/verifier run passed **10 tests in 2 files (46.00s)**, including abort signaling, an old result arriving while a replacement remains pending, canceled receipt contents not replacing edited fields, and reimport. Web typecheck passed. The production Chrome desktop/Pixel 7 suite passed **6 cases in 42.6s**, exit **0**, with two CI workers and no automatic retries. Its new case holds the first intercepted indexer request, cancels it through the UI, then explicitly restarts and verifies captured state. These are controlled responses, not live network or native-wallet evidence.

`npm run release:build` then exited **0**, restoring the normal endpoint configuration: source comparison at **05:33:47.063 UTC**, six workspace builds, **8 circuits, 62 files, 62,649,560 bytes**. Proving keys were retained. Previous Docker/security evidence remains scoped to its recorded images; no container rebuild, public deployment, full-suite rerun or remote CI execution occurred for this increment.

## Cancel attachment hashing and invalidate stale file comparisons -- 2026-09-09

Attachment authoring now offers **Cancel hashing**, releasing the pending restriction without adding metadata. Received-file review offers **Cancel file check**, leaving a neutral canceled result. Both invalidate the attempt so late success/failure cannot affect a replacement. Cancellation stops the application wait; the browser's already-started file read or WebCrypto operation may continue. Attachment review now resets whenever sealed metadata changes, including a changed size or filename with the same digest, preventing a stale match from describing a different entry.

The final focused run passed **8 tests in 2 files (3.18s)**, including cancellation followed by replacement, late rejection after cancellation, completed/pending comparison invalidation and actual hash/metadata validation. Web typecheck passed. The extended encrypted attachment journey passed on **Chrome desktop and Pixel 7: 2 cases, 40.1s overall, exit 0**, with two CI workers and no automatic retries. It deliberately holds one synthetic browser file read to exercise cancellation, then hashes real replacement bytes, exports/restores an encrypted draft, seals through the local ciphertext service, and checks received matching/mismatching files. This is controlled browser evidence, not a physical disk failure or native-wallet transaction.

After browser testing, `npm run release:build` exited **0**: fresh Compact source comparison at **16:32:01.178 UTC**, all six workspace builds and a valid normal release of **8 circuits, 62 files, 62,648,517 bytes**. No new proving keys were generated. The previous Docker hosting/rollout evidence remains scoped to its recorded earlier artifact; those images were not rebuilt for this UI change. Full application suites and remote CI were not repeated. File-byte storage/delivery and resuming an interrupted hash remain outside this increment; see [attachment recovery scope](adr/0019-pending-attachment-drafts.md).

## Additional Caddy dependency remediation and Go scan precision -- 2026-09-09

Pinned govulncheck **1.8.0** scans of the previous Caddy, Prometheus and promtool binaries exited **3**, reporting **6 / 3 / 3** advisory IDs. Separate extracts exited **0** and contained no package symbols. Inspection of the pinned scanner implementation confirmed its module-level fallback in that situation; the printed symbol heading does not establish a linked or reachable vulnerable function. [Diagnostic evidence](evidence/go-binary-diagnostic.json) records exact binary hashes and [the method](go-vulnerability-checks.md) explains this limitation. No scanner exclusion or release-gate change was made.

Caddy's dependency graph now selects **CEL 0.30.0, compress 1.18.7 and chi 5.3.0**. Module verification, the existing SHA-guarded compatibility patch, upstream CEL/expression tests (**0.491s**), compilation and configuration checks passed. Both Docker builds exited **0**; Git revision metadata capture still warned, so no embedded Git-provenance claim is made. The application release and Compact artifacts were unchanged.

The new web image is **sha256:6f20375885cd4438e506254ab901dab67d919824c4eaea3edfe89c399564d094** and ingress is **sha256:c0a8b7f326698cc17b8138e03d100d1eb469e55d87f7ab5a740d24b12f2a09ef**. The web binary's Go scan now reports **one** advisory, GO-2026-5932, with **exit 3**. Each image's strict Trivy scan reports the same **one UNKNOWN** finding, with **exit 1**. [Post-update evidence](evidence/caddy-additional-remediation.json) preserves log hashes and identities. The captured Trivy logs include a truncated informational line; their finding tables and actual exit codes are retained. These are failing security gates, not clearance.

The full web-container drill passed at **16:23:29.672 UTC** and exited **0** after cleanup: **62 files, 63 HTTP requests, 62,648,273 bytes**, headers/MIME/cache/404 checks, non-root/read-only execution, desktop/mobile captured-state lookup and graceful restart. The rollout drill passed at **16:27:04.597 UTC** and exited **0** after cleanup, including both retained lazy-chunk directions, complete inventories and fixed backend identities. Current [hosting](evidence/web-container-drill.json) and [rollout](evidence/web-rollout-drill.json) evidence refer to these rebuilt images. The historical A fixture remains unchanged. No new wallet transaction, public deployment, proving-key generation or remote CI run occurred; the earlier consolidated application suite was not repeated for this Go dependency-only change.

## Verify current hosting image and retention in both rollout directions -- 2026-09-09

The normal release from the consolidated baseline was rebuilt into `vulnseal-web:local`, exact image **sha256:c84079a90438bf739e0e07ad99283aad547bac06f77922202426aa5f0fa6b5b9**. The image's artifact gate and Caddy configuration validation passed. Docker reused the pinned Caddy compilation; build metadata warned that Git revision information could not be captured, so no signed or embedded Git-provenance claim is made.

The complete container drill passed at **15:59:57.011 UTC**, then exited **0** after cleanup: **62 files, 63 HTTP requests, 62,648,273 served bytes** including the extra root request; MIME/cache/security headers, missing-file 404s, non-root/read-only execution, desktop/mobile captured-state lookup and graceful restart all passed. [Current container evidence](evidence/web-container-drill.json) identifies the exact image. The same image's all-severity security scan returned **exit 1**, retaining one UNKNOWN **GO-2026-5932** module finding and no low/medium/high/critical findings. It was not suppressed; [scan evidence](evidence/web-current-runtime-scan.json) records the updated image and raw-log hash.

The rollout drill now also opens B's retained lazy role-workspace chunk from an existing B page after rollback to A. Previously it checked only A's lazy load after promotion to B. The expanded drill passed at **16:02:25.492 UTC**, then exited **0** after cleanup: both old and new pages loaded their respective retained workspaces, six script artifacts differed, both complete inventories were rechecked after rollback, and backend identities/serving origin stayed fixed. [Rollout evidence](evidence/web-rollout-drill.json) binds current B to historical A and the existing ingress image.

The operator guide now distinguishes the historical A fixture from current B; this is serving-continuity evidence, not cross-version schema migration or security clearance of A. No public deployment, live indexer/wallet call, new proving keys or remote CI execution occurred. Current host/rollout evidence does not resolve remaining security findings or the broader readiness requirements.

## Consolidated validation after bounded reads and recovery waits -- 2026-09-09

At application revision **55c7784**, `npm run validate` completed with **exit 0**: all six workspace builds/typechecks and **288 tests across 52 files** passed. Counts are shared 13, contract 25, API 32, cipherstore 21, integration 9 and web 188. The separate compiler/release/environment commands passed **16 tool tests** (5/8/3). The ordinary Chrome desktop/Pixel 7 suite passed **76 cases in 4.3 minutes** with two CI workers and no automatic retries.

The first two-store replication run passed two cases but failed both backfill cases at a five-second alert assertion. Retained trace inspection showed the first report's actual PUTs taking about 3.6-3.9 seconds before the next report began; the UI was still working. Each store request permits twenty seconds and batch reports run sequentially. The test now allows 45 seconds for two-report partial completion, 65 seconds for three-report success and 150 seconds total. No product behavior, payload/count assertions, request deadline or automatic retry was changed. After that test-only correction, all **four replication cases passed in 59.0 seconds**. The failed run is not counted as successful.

After browser testing, the normal release was rebuilt to replace the artifact configured for test storage endpoints. Fresh source comparison at **15:55:39.609 UTC** and the final release build/check passed: **8 circuits, 62 files, 62,646,994 bytes**. [Consolidated evidence](evidence/consolidated-55c7784.json) records the commands, counts, failure and correction. Full workspace tests were not repeated after the replication-test timeout-only edit.

This establishes the current local deterministic/browser baseline. It does not resolve collector/web UNKNOWN findings, native Lace execution, fresh full-key generation, remote CI, current hosting-image/rollout verification, public deployment, independent audit or the remaining roadmap. Source-map compiler warnings and terminal color warnings remain; neither caused a failed application test.

## Bound public-state reads without changing transaction outcomes -- 2026-09-09

`VulnSealApi.readPublicState` now stops waiting after **20 seconds**, returns a read-timeout error and clears its timer on all completion paths. It does not retry, submit a transaction or change finality. A late provider response is never decoded or returned to the timed-out caller. An explicit later call can obtain fresh state. This applies to API consumers including post-finality demo refresh, restoration's ledger read and role-session authority checks; connection/join and SDK-internal operations outside this method remain separate.

The API suite passed **32 tests across four files in 3.48 seconds**, with typechecking successful. New tests call the actual API method with a mocked provider/ledger decoder and advance fake timers: timeout triggers once, late state is not decoded, an explicit fresh read succeeds, provider errors/null results retain their existing errors and timers are cleaned up. The existing mocked network UI case covering finalized receipt retention, blocked follow-up actions and successful explicit refresh passed separately (**1 case in 8.07 seconds**, nine unrelated cases skipped). That UI case exercises read-error handling, not a real indexer timeout.

The normal release build passed after fresh source comparison at **15:42:44.559 UTC**: **8 circuits, 62 files, 62,646,994 bytes**. No contract or proving-key changes occurred. This is an application wait limit, not cancellation of the underlying network request, a limit on synchronous ledger decoding or native Lace verification. Full browser suites, current hosting-image rebuild and public deployment were not performed in this increment.

## Verify initial-submit timeout recovery through the UI -- 2026-09-09

The initial-report recovery regression now covers API rejection, a never-resolving private-state preparation and a never-resolving submit call. The timeout cases advance the application timer, deliver the late result, and verify that no completed report or late transaction receipt appears. Preparation timeout makes zero submit calls, including after late preparation resolves; submission timeout makes exactly one.

Each case downloads and decrypts the actual encrypted backup, compares its pending ciphertext envelope with the upload body, validates the retained key/salt and commitment through the recovery decoder, and checks `submissionStarted=true`, no completed report and no fabricated history. A fresh App mount restores that file against a mocked authority-checked ledger and keeps replacement/retry unavailable. The completed chain performs exactly one ciphertext PUT, including after restore.

The full network component file passed **10 tests in 35.00 seconds** and web typechecking passed. After adding the final one-PUT assertion, the three affected cases passed again in **17.11 seconds** (seven unrelated cases skipped in that focused run). These tests use mocked wallet/API/HTTP and fake timer advancement, with actual local encryption/decryption. They do not establish native Lace behavior, network finality, crash persistence or safe retry reconciliation. No production implementation, release bytes, contract or proving keys changed in this verification increment.

## Preserve demo backup access after a stalled report transaction -- 2026-09-09

The combined demo now bounds private-state preparation plus its API call to ten minutes for initial report submission and all seven existing-report transitions. Expiration releases the working UI while retaining the existing pending-submission/uncertain-transition marker. It never retries. A preparation result arriving after expiry cannot start the transition API call; an already started call's late result cannot clear the marker or apply a receipt through the finished action. Patch/closure error labels now say interrupted rather than implying a definitive transaction failure.

Three focused helper tests cover late preparation, late confirmation, timely success and preparation failure with timer cleanup. The final App/network/helper run passed **18 tests across three files in 26.62 seconds**, and web typechecking passed. The timeout UI case advances a fake timer, supplies a late mocked confirmation, exports and decrypts the actual encrypted recovery file, remounts and restores against a mocked verified ledger, and confirms transaction/reset blocking persists. The first run failed because an error-text selector matched two UI locations; correcting the selector produced the successful run. The SDK and wallet are mocked; no real ten-minute chain wait or native Lace call was performed.

The normal release build passed after fresh source comparison at **15:35:38.288 UTC**. After the final two error-label edits, the web typecheck/build and artifact manifest check passed again: **8 circuits, 62 files, 62,646,045 bytes**. Contract source and proving keys are unchanged. This release has not been rebuilt into the hosting image or deployed, and full browser suites were not repeated for this increment.

This closes indefinite asynchronous waiting for demo report calls, not SDK cancellation or durable journaling. Background SDK work may still finalize, timer execution can be delayed by synchronous/browser scheduling, and tab loss before export remains unsafe. Deployment, wallet connection/restore, post-finality reads, durable identifiers and semantic reconciliation are separate work. See [the recovery design](adr/0006-encrypted-browser-recovery.md#bounded-waits-in-the-combined-demo).

## Alert on unavailable storage while metrics remain reachable -- 2026-09-09

Each enabled `/metrics` scrape now invokes the same coalesced quota and write/read probe as `/readyz`. The new fixed-name gauge `vulnseal_storage_ready` is 1 on success and 0 on failure; the scrape remains HTTP 200 on a completed failed probe. This closes the gap where `up=1` hid a full or unavailable store until another request generated an error. Filesystem details are not exposed. Scrapes now perform probe I/O; slow storage can cause scrape timeouts, and quota readiness checks only one byte of headroom, not every possible upload size.

The new `CipherstoreStorageNotReady` alert requires two minutes of readiness 0 while `up=1`. Synthetic promtool tests cover pending/firing, readiness recovery and suppression while the scrape itself is unavailable. Existing scrape-unavailable and server-error rules remain, giving three rules in total. All **21 ciphertext tests across four files passed in 6.10 seconds** locally and **6.24 seconds** inside the image build; typechecking passed. New HTTP tests cover concurrent successful probes and cleanup, quota exhaustion with retained reads, and an unusable storage path without disclosure or modification of that path's contents.

The complete real monitoring drill passed at **15:29:45.684 UTC**, terminated with **exit 0**, and cleaned its own project. A one-blob fixture became full after a synthetic upload: Prometheus observed readiness 0 with `up=1`, and the retained envelope remained readable. UI assets, three loaded rules, outage/recovery and TSDB restart retention also passed. [Current drill evidence](evidence/cipherstore-monitoring-drill.json) records the new ciphertext image `sha256:2012dd05ebe56a0026a141afb5d68d69b531fe9c6955e5e091139a0cb55a7ca5`. The two-minute alert timing is synthetic-test evidence, not a real-time firing/notification drill.

The exact ciphertext runtime passed `scan-container.sh` with **exit 0**, zero Alpine and node-package findings; [scan evidence](evidence/cipherstore-readiness-scan.json) retains the log hash and scope. The separate collector still has its two unresolved UNKNOWN findings. No client release, contract, proving keys, operator data, external notifications or public deployment changed.

## Remove inherited OS layers from the collector -- 2026-09-09

The collector now uses a `scratch` final image instead of overlaying its rebuilt binaries on the upstream BusyBox image. It includes only the two static executables, CA trust bundle, Go timezone archive, sample configuration, license/notice and numeric-user records. The data directory is created with UID/GID **65534:65534** before fresh named-volume initialization. Entry point, default arguments, exposed port and work directory are explicit. Docker reused the earlier successful binary compilation; no dependency or UI source changed.

A real exported container filesystem was inspected: both ELF executables have no dynamic interpreter, exactly nine regular payload files are present, and the data directory has the required ownership. Docker-generated resolver/hostname files, `.dockerenv`, its empty `dev/console` placeholder and `etc/mtab` link to `/proc/mounts` are recorded separately; no other special files or links were found. The inventory checks initially rejected those Docker additions and were corrected to verify their expected form. The old image was no longer locally addressable after retagging, so no direct before/after binary-hash equality or size-reduction claim is made. [Runtime evidence](evidence/prometheus-scratch-runtime.json) records current file hashes and exact image `sha256:9716ce24565dad60ce6e2e3660e21c1268f457ee2aebddf0bc40ea4b19a04296`.

The complete monitoring drill passed at **15:21:31.287 UTC**, terminated with **exit 0**, and removed its test resources. It covers rule/config checks, UI asset serving, real scraping, outage/recovery, non-root/read-only execution and historical TSDB data retained across restart. The exact new image scan returned **exit 1**, retaining two UNKNOWN `GO-2026-5932` findings with zero low/medium/high/critical findings. No exclusions were added. Earlier dependency-remediation and BusyBox-image records remain historical evidence.

Removing runtime OS packages does not establish host security, a clean Go advisory gate, remote TLS scrape compatibility, an independently audited UI, native-wallet success or production readiness. Existing operator volumes are not modified; they still require the documented numeric ownership.

## Rebuild collector dependencies and verify restart retention -- 2026-09-09

The monitoring overlay now builds **Prometheus 3.14.0-vulnseal.1** from upstream revision `d7598b7141418fa35be2b5ec5d0fefb634199610`, with SHA-256-pinned source/UI archives and digest-pinned Go/runtime images. Both binaries use **Go 1.27.1**, **x/crypto 0.56.0**, **gRPC 1.83.2**, and their required x/net 0.58.0 / x/text 0.41.0 updates. Module verification and both readonly-module binary builds passed. The upstream versioned UI is embedded, and OCI/binary version metadata identifies this modified build. [Build notes](../infra/monitoring/README.md) describe provenance and limits. CI builds this collector before the functional drill; the independent manual security job builds and scans it too. Workflow image selection was verified locally, but neither modified workflow has run on GitHub.

The exact final runtime is `sha256:f801adf9b95daa93a886a1b94bebef62f1446f68c2f1edeb901be6787d4f9143`. Its all-severity scan returned **exit 1** with **two UNKNOWN occurrences of GO-2026-5932**, one per binary, and zero low/medium/high/critical occurrences. This reduces the previous 14 occurrences by twelve without suppressing any advisory. The combined dependency graph lists **1,502 packages**, excluding `golang.org/x/crypto/openpgp` and its subpackages. [Remediation evidence](evidence/prometheus-remediation.json) records the graph and resolved module-file hashes; this supports a build-specific package assessment, not a passed raw gate or OS clearance. The BusyBox base and prebuilt UI were not independently security-audited.

The extended monitoring drill passed at **15:14:13.143 UTC** and terminated with **exit 0** after cleanup. It passed promtool rule/config checks, served the UI HTML and executable JavaScript assets, collected real metrics, detected a stopped cipherstore and its recovery, and retained a historical pre-restart sample after restarting Prometheus. This last assertion queries the exact earlier sample time, so newly scraped data alone cannot satisfy it. The first extended run failed with a refused connection after restart; the drill now rediscovers its randomly assigned published port after restart and emits bounded collector logs on failure. That run had terminated and cleaned up before the successful rerun. [Current drill evidence](evidence/cipherstore-monitoring-drill.json) retains the earlier upstream-image verification separately.

No full upstream integration suite, browser rendering test of Prometheus, off-device metric durability, production deployment, native-wallet operation or proving-key regeneration is claimed. The two UNKNOWN findings and broader release requirements remain open.

## Enforce runtime security in manual release verification -- 2026-09-09

The optional Prometheus image was scanned after the functional drill. The exact pinned `scan-container.sh` invocation terminated with **exit 1**. It reports seven distinct advisories in both `bin/prometheus` and `bin/promtool`: **14 occurrences, comprising 2 critical, 4 high, 2 medium and 6 unknown**. Findings concern `golang.org/x/crypto v0.54.0` and `google.golang.org/grpc v1.82.1`; scanner-reported fixed versions are recorded per advisory in [machine-readable evidence](evidence/prometheus-runtime-scan.json), together with the image config ID and hashes of the raw JSON and gate log. No OS result was emitted for this BusyBox image; absence of that result is not OS clearance. No reachability analysis or dependency remediation is claimed.

The operator guide and Compose comments now mark this collector for local evaluation pending remediation. The manual release-verification workflow adds an independent collector-security job that pulls and scans the image selected by Compose, and scans the exact built web image after its hosting drill. Neither step ignores vulnerabilities or permits failed scans. The current collector findings and the previously recorded web UNKNOWN finding therefore prevent a clean release-security result. Ordinary functional CI remains a separate check.

The exact collector scan completed locally; workflow YAML and the Compose image selection were checked locally. The modified workflow has not run on GitHub. No running service, application code, release bytes or proving keys changed. This increment exposes and gates unresolved security work; it does not remediate the collector or claim production readiness.

## Collect ciphertext metrics and validate local alerts -- 2026-09-09

An optional Compose overlay now runs digest-pinned **Prometheus 3.14.0**, enables cipherstore metrics, and scrapes the internal service every fifteen seconds. It publishes the collector only on loopback, runs non-root/read-only with resource/log bounds, and uses a named TSDB volume with 24-hour/256 MB retention targets. The default ciphertext-only Compose file still leaves metrics disabled. No Alertmanager, remote-write target or external notification destination is configured.

Two alert rules cover unavailable scrapes and a positive recent HTTP 5xx rate, each with a two-minute pending period. Pinned `promtool` accepted the configuration and rule files. Synthetic rule tests verify pending/firing behavior for both alerts and resolution of the unavailable-scrape alert. The first integrated run exposed `promtool` trying to create test storage under read-only `/tmp`; its test-only `TMPDIR` now points into the disposable metrics volume. The failed invocation terminated and cleaned up before the corrected run.

The complete corrected monitoring drill passed at **14:44:32.646 UTC**, then exited successfully after removing its own Compose project/volumes. It validated rules, verified real collection of a 404 counter, loaded both rules through the API, checked non-root/read-only runtime settings, stopped cipherstore and observed `up=0`, then restarted it and observed `up=1`. A follow-up listing found no retained monitoring-test containers. [Evidence](evidence/cipherstore-monitoring-drill.json) records the exact collector and ciphertext image identifiers. CI is configured to run the same drill but has not executed remotely.

The live outage was shorter than the rule's pending period; synthetic `promtool` tests, not that outage, establish the two-minute firing behavior. No external alert delivery, custom dashboard, public deployment, collector image vulnerability clearance, measured SLO or off-device metric durability is claimed. Application and contract source, release bytes and proving keys are unchanged. See [internal monitoring instructions](cipherstore-operations.md#internal-collector-and-local-alerts).

## Add opt-in aggregate ciphertext metrics -- 2026-09-09

`CIPHERSTORE_METRICS_ENABLED=1` now exposes `GET /metrics` in Prometheus text 0.0.4 format; the default 0 returns 404. CLI and Compose wiring are included. Metrics track completed responses across five fixed status classes, aborted responses, active requests and active upload handlers. Scrapes exclude themselves. No request path, blob digest, IP, origin, program identifier or report content becomes a label. The endpoint is on the same listener, without authentication or browser CORS access headers; the operator guide requires a controlled listener/proxy boundary before enabling it.

All **19 ciphertext tests across four files passed in 5.77 seconds** locally and **6.10 seconds** inside the Node/Alpine image. The new HTTP regression checks default-off behavior, stable repeated scrapes, success/not-found/quota response counts, no user-supplied identifiers in output, active upload/request gauges and exactly one aborted response when a client disconnects. CLI values `2`, `true` and `-1` were rejected before startup. The TypeScript build and Compose configuration validation passed.

Final image **`sha256:95aaedbc2c46a992e4858bbbc97a8446a67c83bb9f891067cbb0222dc5ab623b`** passed the updated container drill at **14:36:42.695 UTC** with metrics explicitly enabled, including the existing non-root/read-only, quota, slow-upload, writer-lock, graceful-restart and authenticated-decryption checks. The process exited successfully after cleanup; no labelled drill container remained. The strict runtime vulnerability scan exited **0**; [scan evidence](evidence/cipherstore-metrics-scan.json) records its pin/image/log hash, and [container evidence](evidence/cipherstore-container-drill.json) records the drill. The scanner's missing Alpine 3.24 EOL entry still prevents this result from establishing an OS support horizon.

Counters reset with each server instance and omit connections rejected before the HTTP request callback. Response completion is not peer acknowledgement or a durability assertion; upload work may continue after a socket closes. No stored-capacity gauge, collector deployment, dashboard, external alert delivery or production SLO is claimed. Browser/contract source and proving keys are unchanged; full browser suites were not repeated for this optional service endpoint. See [operator metrics](cipherstore-operations.md#operator-metrics).

## Verify the current demo recovery release in its hosting image -- 2026-09-09

The web artifact from code revision **`13eeba4`** passed read-only verification and was rebuilt into image **`sha256:fdc958efa3bee5ab237103a1fbbdb2a38608d541478b9a6e8b54e18310b8c518`**. The Docker packaging gate checked **8 circuits, 62 files, 62,643,770 bytes** and Caddy configuration validation passed. The previously tested pinned Go runtime build was reused from cache.

The full container drill passed at **14:29:42.487 UTC**, then exited successfully after cleanup. It compared **63 HTTP requests and 62,645,049 bytes**, including the extra root-page request; checked MIME/cache/security headers and missing-file 404s; verified non-root/read-only execution, desktop/mobile captured-state lookup and graceful restart. A follow-up Docker listing found no retained web-test containers. [Container evidence](evidence/web-container-drill.json) now identifies this current artifact.

The exact `scan-container.sh vulnseal-web:local` command returned **exit 1**, retaining one UNKNOWN module finding, **GO-2026-5932** against `golang.org/x/crypto v0.56.0`; no low/medium/high/critical finding was reported. The advisory concerns the unmaintained OpenPGP package. It was not suppressed. [Scan evidence](evidence/web-current-runtime-scan.json) records the image, scanner pin, raw-log hash and failed gate. Earlier package-absence analysis remains in `caddy-go-remediation.json`; the current all-severity gate is not reported as passed.

No application source, release bytes or proving keys changed in this verification increment. This refreshes local hosting evidence only; native Lace, public hosting/TLS, remote CI, rollout of this exact new release and external audit remain separate work.

## Reflect demo transaction blocks in its controls -- 2026-09-09

Triage, accept/reject, patch, retest, authorization and closure buttons now use native disabled controls whenever the combined demo retains an uncertain transition or requires a post-finality public refresh. The existing handler guards remain in place. Navigation, report reading and backup access remain available after operations finish. Successful public refresh re-enables the relevant controls; restoring an uncertainty marker keeps them disabled.

Both App component files passed **14 tests in 20.51 seconds** with added assertions for immediate and restored triage blocking and both retest choices during a failed public refresh. A subsequent focused run passed the extended successful-refresh case in **3.22 seconds** of test time, confirming both retest choices become enabled after refresh. Web typechecking and the normal release build passed following source comparison at **14:26:43.840 UTC**: **8 circuits, 62 files, 62,643,770 bytes**. No contract/key or recovery-schema changes occurred. Full browser suites and native-wallet execution were not repeated for this control-state change.

## Stage source-map preparation before artifact installation -- 2026-09-09

Review found that the previous map-embedding step ran after replacing `dist/managed`. It now runs synchronously inside the artifact copier's staging directory, before the retained target is moved. The staged tree is inspected again before installation. Parsing, source binding or map-write failures therefore leave the previous managed artifact directory in place. The pure map transformation preserves input mapping fields and does not mutate the compiler map.

All **eight release-tool tests passed in 0.45 seconds** after the final change. The failure regression now covers partial staged preparation as well as copy and installation errors, verifying the retained output and staging cleanup. The actual contract build passed. Read-only release verification passed with **8 circuits, 62 files, 62,642,750 bytes**; runtime code, proving material and browser release bytes are unchanged.

The guarantee covers the managed artifact directory on reported preparation/install errors. It does not make the entire TypeScript build transactional, prevent concurrent external file mutation or provide crash-atomic multi-directory replacement. Full application/browser suites were not repeated for this packaging-order correction.

## Make distributed contract source maps self-contained for project source -- 2026-09-09

Investigation of the repeated compiler-map warning confirmed that `src/vulnseal.compact` resolves correctly in the checkout, while `compiler/standard-library.compact` is referenced but not emitted by the installed compiler. The original map has no embedded sources. The artifact-copy build now embeds the exact public project contract source in the distributed map's `sourcesContent`, retaining every original mapping field and leaving unavailable standard-library content null. The installed compiler output remains unchanged, preserving the independent source-freshness comparison.

All **eight release-tool tests passed in 0.39 seconds**, including a new isolated-directory test for exact Unicode source content, unchanged mappings/original map and rejection of an unrelated source. Direct inspection of the actual distributed map verified its embedded contract text against the current source and all original mapping fields against the retained compiler map. The normal release build passed following fresh source comparison at **14:22:06.723 UTC**: **8 circuits, 62 files, 62,642,750 bytes**. Browser release bytes, contract logic and keys are unchanged; only the intermediate distributed contract map gains source content.

This improves debugging from a copied build without the original checkout. It does not supply the compiler's unavailable standard-library source or claim to eliminate every missing-source warning. Full application/browser suites were not repeated for this map-only packaging change; the preceding consolidated results remain scoped to `a4ee100`.

## Consolidated validation after demo recovery v4 -- 2026-09-09

At code revision **`a4ee100`**, `npm run validate` passed all six workspace builds/typechecks and **276 tests across 50 files**: shared 13, contract 25, API 29, ciphertext storage 18, integration 9 and web 182. The contract suite completed in 68.47 seconds and web's 37 files in 79.11 seconds. This run includes the newer role deployment timeout/address-selection cases, combined-demo leave guard and v4 uncertain-transition recovery. No test was retried.

All **15 tool tests** passed through `test:compiler-check` (five), `test:release` (seven) and `test:web-environment` (three), covering compiler staging/retained keys, release and served-file rejection, artifact copying and environment configuration. The complete ordinary browser suite passed **76 desktop/mobile Chrome cases in 3.9 minutes**, with CI's two workers and no retries. The separate two-service replication suite passed **four cases in 48.7 seconds**, including partial writes, corrupt replica rejection and exact-envelope backfill retry.

After those test-specific browser builds, the normal `release:build` completed successfully following fresh compiler comparison at **14:18:43.594 UTC**: **8 circuits, 62 files, 62,642,750 bytes**. Contract sources and proving keys were unchanged. The readiness table now references this consolidated baseline rather than the earlier 260-test/74-browser-case run. No production implementation changed in this verification increment.

This is local generated-circuit, application and loopback-browser/service evidence. It does not execute the GitHub workflows, regenerate proving keys, exercise native Lace, deploy publicly, authenticate external chain state or establish off-device durability. Existing hosting image/scan evidence remains scoped to its recorded artifacts. Remaining roadmap and pending-transaction durability requirements are unchanged.

## Preserve uncertain demo transitions through recovery -- 2026-09-09

Combined-demo report transitions now record uncertainty before private-state setup and clear it only after a successful API result. The marker covers triage, accept/reject, patch, retest, payout authorization and closure. Any setup/API error leaves subsequent transaction actions blocked; reset is guarded and its receipt button disabled. Private recovery stays usable after the call returns. A successful transaction followed by a failed public read uses the existing refresh-required path, without retaining false transaction uncertainty. Error labels now say interrupted rather than asserting rejection.

Recovery payload v4 requires a null or supported circuit-name `uncertainTransition`; a non-null marker requires a validated network report. Export/import preserves it even after joining and checking the ledger. Legacy payloads remain readable but cannot carry the new field. Tests reject missing/invalid markers, guided-local/unbound markers and downgrade attempts. The existing pending-initial-submission marker is preserved independently; encrypted envelope and KDF parameters are unchanged.

All **23 tests across App, App.network and recovery passed in 20.17 seconds**. The new UI regression restores a network report, injects a failed triage call, checks repeat-call blocking, downloads/decrypts the actual encrypted backup, restores it with a ledger check, and confirms the marker and reset/transaction block survive. Its initial selector contained a Windows-encoding replacement character; correcting the selector resolved that test failure. The final run also covers successful network transitions and post-finality public-read recovery. Web typechecking passed.

All **four desktop/mobile ciphertext browser cases passed in 1.0 minute** with CI workers and no retries, including a real client timeout, v4 export/decryption, exact-envelope restore and upload retry, plus oversized-response fallback. The normal release build then passed after fresh compiler-source comparison at **14:08:54.014 UTC**: **8 circuits, 62 files, 62,642,750 bytes**. Contract sources and proving keys are unchanged. Full expanded application/browser suites and hosting containers were not rerun.

This is explicit-snapshot preservation, not automatic pre-wallet durability. A tab crash before export, a never-returning SDK call, an old backup, deployment recovery, transaction-identifier journaling and safe reconciliation remain unimplemented for the combined demo. No native Lace or fresh network transaction was used for this verification. See [the recovery design](adr/0006-encrypted-browser-recovery.md#uncertain-network-transitions).

## Warn before leaving active combined-demo operations ? 2026-09-09

The combined demo now registers its before-unload guard during every working operation, including deployment before a pending report exists. Previously the guard only covered retained pending report preparation. Once work ends, the guard is removed unless pending preparation still requires it; component unmount also removes the listener. This is a browser leave-warning request, not persistence, transaction cancellation or a finality deadline.

The new injected-deployment regression verifies no idle warning, a warning during an unresolved deployment, and guard removal after failure/unmount. Its initial assertion failed because the same error appears in two UI locations; correcting the selector produced **13 passing tests across both App test files in 15.59 seconds**, including existing upload-retry warning preservation/removal. Web typechecking passed. The normal release build passed after fresh source comparison at **14:01:49.689 UTC**: **8 circuits, 62 files, 62,637,586 bytes**. Contract sources and proving keys are unchanged. No native browser close-dialog or Lace transaction was exercised in this increment.

Review confirmed that the combined demo still lacks the role workspace's durable per-attempt transaction journal. Its unknown-outcome handling, deployment recovery and bounded finality wait require further implementation; this warning does not close those gaps. Existing hosting evidence remains scoped to its previous image/release bytes.

## Add full-artifact release verification workflow ? 2026-09-09

The separate manual `Release verification` workflow now starts from checkout and performs full Compact 0.31.1 compilation, including fresh proving keys/binary ZKIR, before six-workspace validation, release packaging/comparison, web image construction and the existing desktop/mobile HTTP/container drill. Actions are pinned to the same exact commits as ordinary CI; permissions are limited to repository reads. Full compilation has a thirty-minute limit and the job ninety minutes. There is no skip-ZK or missing-key fallback, publication, image push or wallet operation. Ordinary PR CI remains unchanged.

Local YAML parsing confirmed the manual trigger, minimal permissions and pinned action references. Compose configuration validation and the existing release's read-only check passed: **8 circuits, 62 files, 62,637,482 bytes**. This increment did not regenerate local keys, alter release bytes or rerun existing application suites. The new workflow has **not run remotely**, so fresh-key generation and the entire sequence on a clean GitHub runner remain unverified. The hosting/release guides explain that distinction. The older-CPU ADR's obsolete warning that the current skip-ZK wrapper deletes retained keys was corrected to match its staged/preserving implementation.

## Enforce ciphertext runtime scanning in CI ? 2026-09-09

The ciphertext container job now runs `scripts/scan-container.sh` after its persistence drill and has a twenty-minute job deadline. The script resolves the selected local image before export, scans only that image's temporary archive with digest-pinned Trivy 0.74.0, passes all five severities to the nonzero vulnerability exit policy, and propagates Docker/scanner failures. It supplies no ignore-unfixed flag or ignore list. The archive mount is read-only, the scanner gets no Docker socket or source tree, and normal exit cleans up only the temporary archive/directory. Shell files now explicitly use LF line endings for Windows checkouts.

The exact script passed against patched image `sha256:f56e9ea927305fc6a4fea44bf9e78013b263f24d54fa4231345b0ff4f79b90ab` at **13:55:33 UTC**, reporting zero Alpine/Node-package findings and exit 0. A real negative run against the pinned unpatched Node 24.20.0 Alpine base reported **29 findings** and exit 1; its log contains the expected OpenSSL advisory. A missing local image also returned nonzero. The negative-run Python console formatter initially failed to print Unicode table borders under Windows cp1252 after saving the complete log and exit code; inspection of the saved UTF-8 log confirmed the findings without rerunning the scanner. Shell syntax and Git whitespace checks passed.

Trivy warned that Alpine 3.24 is absent from its EOL list. The EOL exit option is enabled, but recognized-EOL rejection was not exercised and current OS support status is not proven by this gate. These are local script results; the changed GitHub workflow has not run remotely. No application code, runtime image or browser release bytes changed during this increment.

## Patch and verify the ciphertext runtime ? 2026-09-09

Both cipherstore Docker stages now use digest-pinned Node **24.20.0 on Alpine**. The runtime patches libcrypto3/libssl3 to **3.5.8-r0** and removes npm, Corepack and Yarn; the compiled service and backup CLI need only Node built-ins. Test sources enter the build stage but remain excluded from runtime output. The first build failed because the previous context allowlist excluded tests. After correcting that exclusion, all **18 tests across four files passed in 6.28 seconds** inside Alpine, including backup/restore, directory leases, quotas and transport deadlines. The final runtime rebuild reused that passing build stage.

Trivy **0.74.0**, pinned by image digest and using the database updated at **07:06:00 UTC**, scanned exported runtime filesystems without suppression or ignore-unfixed filtering. The old image reported **283 package/advisory occurrences** (259 Debian, 24 Node-package findings). The initial Node/Alpine replacement left **29** (20 OpenSSL and nine bundled tooling findings). After the explicit patches and tooling removal, the final scan at **13:52:26.797 UTC** reported **zero findings** in both Alpine and Node-package results. [Machine-readable evidence](evidence/cipherstore-image-vulnerabilities.json) distinguishes Docker image identifiers from scanned config identifiers and records each report hash. This does not clear intermediate builder layers or establish exploitability/absence of all vulnerabilities.

Final image **`sha256:f56e9ea927305fc6a4fea44bf9e78013b263f24d54fa4231345b0ff4f79b90ab`** passed the disposable container drill at **13:52:31.665 UTC**: non-root/read-only execution, initial readiness, trickled-upload termination, quota refusal with retained reads, writer exclusion, graceful restart and successful authenticated decryption of persisted ciphertext. The command exited successfully after cleanup, and a follow-up listing found no retained drill containers. [Drill evidence](evidence/cipherstore-container-drill.json) preserves the earlier Compose verification under its original image and timestamp.

No application/contract source or client release bytes changed. Full browser suites were not rerun for this runtime change. Public hosting, native Lace execution, external audit and physical off-device recovery remain unverified.

## Rebuild Caddy with patched Go dependencies — 2026-09-09

Both hosting Dockerfiles now build a replacement Caddy 2.11.4 binary with digest-pinned Go **1.27.1**, the standard module set and a checked-in `infra/caddy/go.mod`/`go.sum`. The graph includes cel-go 0.29.0, x/crypto 0.56.0, x/net 0.58.0, x/text 0.41.0 and gRPC 1.83.2. Modules are verified before compilation, automatic toolchain switching is disabled and builds use `-mod=readonly`. The first compile exposed two cel-go API incompatibilities; a SHA-256-guarded backport changes the two `NewCall` argument types to `InterpretableV2`, matching upstream Caddy. The upstream `TestMatchExpressionMatch` and `TestMatchExpressionProvision` tests passed before binary compilation. This is a locally modified Caddy build, not the untouched upstream release binary; see [build details](../infra/caddy/README.md).

Trivy 0.74.0 independently scanned the final web and ingress archives at **13:31:53.327 UTC** and **13:33:23.585 UTC**. Each has **zero critical/high/medium/low findings and one unknown finding**, GO-2026-5932. The 24 previous Go findings dropped to one; no scanner suppressions were applied. The official [Go advisory](https://pkg.go.dev/vuln/GO-2026-5932) concerns the unmaintained OpenPGP packages, not every package in x/crypto. `CGO_ENABLED=0 GOTOOLCHAIN=local go list -mod=readonly -deps .` using the pinned toolchain enumerated **993 build packages with no OpenPGP package or subpackage**. The complete [package list](evidence/caddy-packages.txt), input/report hashes and both scans are retained in [remediation evidence](evidence/caddy-go-remediation.json). This supports excluding that affected package from this build; it does not make the raw scanner count zero or establish general security.

The final web image `sha256:2d1c667338370e102513493d8c0ebed7953ea484a619cbcc86781f7cf4a29d3a` passed the disposable container drill at **13:32:12.577 UTC**: matching HTTP inventory, headers/404s, non-root/read-only execution, desktop/mobile captured-state lookup and graceful restart. The ingress image `sha256:4f2aae8330960fcc7213ce4e3ed06c84852cc3ed15c5e2bb6c0b1f33130dc6b9` passed the full two-release promotion/rollback drill at **13:36:13.493 UTC**, including old-tab chunk loading and preserved backend containers. Both commands exited successfully after owned-resource cleanup. The retained old image was used only as a disposable rollback fixture, not updated or cleared by these scans.

Client release bytes remain **8 circuits, 62 files, 62,637,482 bytes**; Compact sources and proving keys are unchanged. Functional application suites were not rerun because this change replaces only the hosting runtime. No public deployment, native wallet execution, external audit or broad production-readiness claim is made.

## Scan the web image and patch Alpine dependencies — 2026-09-09

Both `npm audit --omit=dev --json` and the full `npm audit --json` returned zero known dependency vulnerabilities. The final web runtime image was separately exported and scanned with Trivy **0.74.0**, pinned scanner digest `sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`, and vulnerability database updated September 9 at 07:06 UTC. The first scan reported **117 package findings**: 93 Alpine and 24 Go-binary findings. These are package/advisory occurrences, not 117 unique vulnerabilities or proof of exploitability.

The official current Caddy image resolved to the existing pinned digest. Alpine's repository supplied fixes, so both web and rollout Dockerfiles now explicitly install c-ares 1.34.8-r0, curl/libcurl 8.22.0-r0 and libcrypto3/libssl3 3.5.8-r0. The rebuilt web image's second scan at **13:09:08.639 UTC** reports **zero Alpine findings**, leaving **24 unresolved Go-binary findings: one critical, 16 high, four medium and three unknown**. No suppressions or ignore-unfixed filtering were used. Remediation/reachability analysis of the remaining Go dependencies is still required. [Machine-readable evidence](evidence/web-image-vulnerabilities.json) records both counts, remaining findings, report hashes, scanner/database provenance and lockfile hash.

Both images built and validated Caddy configuration successfully. The updated web image `sha256:d3951a4cb92093907a18fc2d3200b5be3e9f137981ffa44959bcb930ec2aae4b` passed the full disposable hosting drill at **13:08:54.792 UTC**, including matching release bytes, headers, 404s, desktop/mobile captured-state lookup and graceful restart. The rollout image was built/configuration-validated, not separately scanned or exercised through a promotion drill. Web release bytes remain unchanged. No public deployment occurred.

The scan uses Trivy's documented [container archive input](https://trivy.dev/docs/latest/target/container_image/#tar-files). The [Caddy release page](https://github.com/caddyserver/caddy/releases/tag/v2.11.4) identifies the current upstream release checked here. Scanner results are dependency evidence, not a penetration test, code audit or production clearance.

## Current release in the static hosting container — 2026-09-09

The release from code revision **`48d41e6`** was rebuilt into `vulnseal-web:local` using the pinned Node/Caddy Dockerfile. Its in-image packaging gate passed for **8 circuits, 62 files, 62,637,482 bytes**. The disposable container drill then passed at **13:01:26.672 UTC** with image ID `sha256:b845cf4d52abd147431c1c724fd3c0949b7cf761771d9da32e94b639c71b6ad2`; the machine-readable result is [web-container-drill.json](evidence/web-container-drill.json).

All release files and the root homepage matched over HTTP: **63 requests, 62,638,761 bytes** (the homepage is fetched separately from the 62-file inventory). Checks passed for MIME/cache/security headers, missing keys/chunks and sensitive paths returning 404, non-root execution, read-only root, desktop/mobile captured-state public lookup without page errors, graceful stop and matching homepage after restart. The command exited successfully after removing its own labelled container; a follow-up Docker listing found no retained web-test containers. The local image remains available.

This refreshes hosting evidence for the current artifact rather than relying on the older image drill. It does not publish a service, provision TLS/DNS, scan the image for vulnerabilities, authenticate live chain state or exercise a native wallet. Existing two-release rollout evidence remains scoped to its own recorded images. No application source or release bytes changed during this hosting check.

## Recover an observed deployment address into the reconnect form — 2026-09-09

An unbound, inactive role workspace can now explicitly select a candidate address from its recorded constructor attempt. The shortcut requires a finalized SUCCESS with exactly one reported action, which must be a deployment. It only fills the existing reconnect form and opens the reports tab; it does not save the address or connect the wallet. The existing join path must still check program and vendor authority before updating the vault. Expired sessions and the wallet-free inspector do not receive this shortcut. Indexer/RPC observations remain source-trusting.

All **11 component cases passed in 3.16 seconds**, covering explicit lookup/selection, pending/failure/partial-success results, missing/empty/ambiguous actions, a call masquerading as a constructor, absent/non-constructor intent and already bound workspaces. Web typechecking passed. Both new desktop/mobile browser cases passed in **36.8 seconds** with no retries: restore an encrypted unbound vendor journal, query injected public evidence, select the address, fail the connection because Lace is absent, download/decrypt the backup, and verify that its address remains null and original transaction identifier survives. Only the four expected public-observation requests are sent. The ordinary suite now contains 76 cases; no full expanded-suite run is claimed.

The final normal release build passed after fresh compiler comparison at **12:58:12.014 UTC**: **8 circuits, 62 files, 62,637,482 bytes**. No backup schema, contract source or proving keys changed. These tests establish candidate selection and preservation on failed connection, not successful native-wallet authority verification or authenticated deployment recovery.

## Deployment-specific confirmation timeout recovery — 2026-09-09

Two new component cases exercise the actual vendor-identity/autosave/deployment UI with injected provider initialization and a delayed deployment result. Both decrypt the browser checkpoint and verify a retained constructor intent and transaction identifier while the contract address remains unknown. After expiring the application confirmation wait, backup and locking stay available, deployment is disabled, and reconnect controls are absent. Late success must not persist the returned address/receipt or attach a role session; late failure must not replace recovery guidance. Programmatically submitting the disabled deployment form is also rejected before another provider initialization or deployment call.

The two new cases initially passed in 10.83 seconds. Final diff review caught that their file had replaced the existing deployment regression file; the original file was restored unchanged and the timeout cases moved to a separate file. The final combined run passed **all four deployment cases across two files in 18.24 seconds**, followed by web typechecking. Read-only release verification passed: **8 circuits, 62 files, 62,635,122 bytes**. No production code or release bytes changed. This closes the missing deployment-specific component regression, while native Lace deployment, live finality expiry and recovering an observed address from external evidence remain unverified. Full suites were not rerun for these two tests; the preceding consolidated baseline remains scoped to `bfea932`.

## Consolidated validation after journal and timeout changes — 2026-09-09

At code revision **`bfea932`**, one complete `npm run validate` passed all six workspace builds/typechecks and **260 tests across 48 files**: shared 13, contract 25, API 29, ciphertext storage 18, integration 9 and web 166. The contract suite completed in 70.67 seconds and web's 35 files in 81.41 seconds. This includes the expanded transition/actor matrix, tier bounds, v10 recovery, journal pagination/capacity and proof/confirmation deadlines. No test was retried.

All **15 compiler/release/HTTP/artifact-copy/environment tool tests** passed in a single Node test run in 1.26 seconds. The full ordinary browser suite passed **74 desktop/mobile cases in 3.9 minutes** with CI's two workers and no retries. The separate real two-store browser suite passed **four cases in 49.2 seconds**, covering identical stored ciphertext, partial upload, corrupt replica rejection and offline backfill recovery.

After the browser suites' test-specific builds, the normal `release:build` completed successfully with a fresh compiler comparison at **12:50:38.254 UTC**: **8 circuits, 62 files, 62,635,122 bytes**. No production code, contract source or proving keys changed in this validation increment. The readiness table now references this consolidated baseline; earlier report sections retain their historical counts and scoped results.

This is local workspace, generated-circuit, browser and loopback-service evidence. Injected connector/captured-chain tests do not establish native Lace compatibility, fresh chain execution, production hosting, off-device durability or completion of the Wave 2/3 roadmap. The application confirmation timeout still leaves SDK background observation running; deployment-specific timeout recovery and native multi-profile operation remain separate verification work.

## Return recovery access after an SDK confirmation wait expires — 2026-09-09

Role deployment and report actions now have an application wait that starts only after their encrypted transaction-identifier checkpoint completes. After ten minutes without an SDK result, the caller reports an unknown outcome and detaches its role session/public snapshot. The journal, backup and lock controls become available; further transactions are blocked in that workspace session, including redeployment, and reconnect guidance is hidden. The SDK's documented indefinite watch methods are unchanged. Its late result or error cannot trigger the expired caller's receipt/address persistence or follow-up ledger read. Background SDK polling/private-state completion can continue until the tab closes; reconciliation and a fresh session are required before considering further transactions.

The initial two-file run passed all **16 existing workspace tests and three new wait-helper tests**. Two new workspace cases initially failed on an incorrect backup-button label in the test. After correcting that selector and suppressing offline/reconnect guidance for expired sessions, both passed in **14.15 seconds**, with the 16 existing cases excluded by the focused filter. They decrypt the actual saved checkpoint, expire the wait, verify backup/locking access, then release or reject the delayed SDK result and assert no receipt write, ledger read or repeat transaction. Helper tests cover checkpoint-relative timing, late success/failure, timely success and synchronous/asynchronous failures with timer cleanup. No full expanded-suite pass is claimed.

Web typechecking and the final normal release build passed: **8 circuits, 62 files, 62,635,122 bytes**, after fresh compiler comparison at **12:40:23.795 UTC**. Contract source and keys were unchanged. No native wallet, real indexer timeout, deployment-specific timeout ceremony or combined-demo finality limit was verified in this increment. Expiry does not prove failure, cancel a broadcast or establish safe retry.

## Bound the complete browser proof step — 2026-09-09

Browser provider wiring now wraps the SDK proof provider with a ten-minute deadline covering its entire `proveTx` promise, including key-material fallback and individual HTTP retries. Only a timely result can advance the SDK's proof/balance/submit sequence. Expiry returns an explicit error, does not retry, and handles late resolution or rejection without advancing the caller. Timely provider failures retain their original error. Arguments and per-call configuration are forwarded unchanged.

The focused run passed **23 tests across two files in 4.29 seconds**, including five new proof-provider cases: timely success/config forwarding, late success and late failure after expiry with no balancing/submission, and synchronous/asynchronous provider errors. Timers are cleared on every tested exit; a separate explicit invocation remains possible. Web typechecking passed. This is provider/pipeline test evidence, not a native-wallet or real proof-server timeout drill. SDK cancellation is unavailable; server work can continue, synchronous execution and browser suspension can delay timers, and subsequent finality polling remains unbounded by this change.

The normal release build completed successfully after fresh compiler comparison at **12:34:09.894 UTC**: **8 circuits, 62 files, 62,630,087 bytes**. Contract source, generated bindings and proving keys were unchanged. Full workspace/browser suites were not rerun for this increment.

## Severity and reward tier boundaries — 2026-09-09

Two generated-contract tests cover 14 fresh-fixture scenarios across severity and reward tiers: -1, 0, 1, 4, 5, 255 and 256. Valid endpoints must update the intended record/status and sequence, with a receipt for reward authorization. Rejected values must preserve the public ledger projection, and every scenario preserves a second researcher's report. This exercises semantic bounds and generated Uint<8> representation bounds in the simulator; it does not establish network rollback semantics.

Two API tests cover 28 malformed-input cases, including out-of-range bigint, number, fractional/non-finite number, string, boolean, null and undefined. Every case must fail before entering private-state handling, writing private state, reading public ledger state or invoking a transaction. Existing production guards already enforce these boundaries; no production code changed.

The focused contract run passed **2 tests in 3.21 seconds** (10 matrix tests excluded); the focused API run passed **2 tests in 2.60 seconds** (9 other session tests excluded). Both workspace typechecks passed. Read-only release verification passed: **8 circuits, 62 files, 62,628,271 bytes**. Full contract/API/web/browser suites were not rerun for this test-only increment.

## Contract transition and actor matrix — 2026-09-09

The generated-contract simulator now exposes `closeReport`, and a workflow-model suite exercises **270 fresh-fixture scenarios**: ten reachable stages (including separate rejected/paid closure histories), nine operations and owner/researcher/stranger actors. A separate allowed-edge table determines whether each action must succeed. Duplicate submission is attempted at every stage. Each fixture also contains another researcher's report to test isolation.

Rejected actions must leave the public ledger projection unchanged: policy/scalar fields, every report record, receipt count and report-receipt membership. Accepted actions must reach the expected status, increment sequence once, preserve immutable report identifiers/ciphertext/owner binding/creation sequence, and leave the other report unchanged. Patch anchoring clears stale retest evidence; payout authorization adds a receipt. This includes all outgoing attempts from both closed histories and patch replacement after failed retest. These are generated-circuit simulator checks, not proof verification, live ledger execution, exhaustive argument fuzzing or a proof of network-level rollback semantics.

The full contract suite passed **23 tests across two files in 66.74 seconds**, including the ten matrix tests, without reruns. Contract typechecking and read-only release verification passed. No production contract source, generated bindings or proving keys changed; the artifact remains **8 circuits, 62 files, 62,628,271 bytes**. Full web/browser suites were not rerun for this test-only change.

## Page and search long recovery journals — 2026-09-09

The unlocked workspace and wallet-free inspector now share a ten-entry journal view, newest saved entries first, with local transaction/report/circuit search. Private notes are not search inputs. All attempts remain in encrypted storage; this is not pruning or archival. Page/filter changes unmount hidden entries and therefore invoke existing transaction/replay cancellation cleanup. Replaced journal data resets paging, and closing the journal discards query state.

The focused component run passed **3 cases in 10.03 seconds**, with 15 unrelated workspace cases excluded by the filter. It verifies 23 entries across three pages, final-page boundaries, case-insensitive identifier/circuit searches, no private-note search, query reset on close, and the full 200-entry workspace retaining export access while rendering only its first page. Web typechecking passed.

All six existing desktop/mobile journal-recovery cases passed in the initial browser run. Two new cases initially used a partial label selector matching both the input and navigation; after making it exact, both passed in **39.2 seconds**. They restore 23 attempts offline, navigate to the oldest page, find a specific old identifier, handle no matches, and assert no POST or external HTTPS requests. The ordinary suite now has 74 cases; no full expanded-suite run is claimed here.

The final normal release build exited successfully: **8 circuits, 62 files, 62,628,271 bytes**, after the fresh compiler comparison at 12:20:35.345 UTC. No backup schema, contract source or proving keys changed.

## Reject journal capacity before transaction preparation — 2026-09-09

The existing 200-attempt schema limit is now checked by workspace transaction preflight, before constructing the command or entering the SDK, and again when appending an attempt. Previously a full journal could reach proof/wallet preparation before its checkpoint failed. The journal displays usage and retains all history at capacity; read-only inspection and backup export remain available. No archival/pruning or automatic deletion was added, and no backup format changed.

Both new boundary/workspace cases passed in **12.31 seconds** (28 other cases excluded by the explicit filter). They verify acceptance of slot 200, rejection of slot 201 without mutation, no contract call or ledger read from a blocked action, retention of 200 old entries and available backup export. The first workspace run found duplicate live alerts; the persistent capacity explanation is now ordinary text while action failure retains its alert. The final normal release build, including web typechecking, exited successfully: **8 circuits, 62 files, 62,623,152 bytes**, after a fresh compiler comparison at 12:14:51.875 UTC. Full suites and native wallet execution were not rerun in this increment.

## Inspect native wallet extension availability — 2026-09-09

A read-only recheck of the three currently reachable Chrome/Edge debugging contexts opened an owned `chrome://extensions/` tab in each. The browser extension API was available in all three; its inventory, including disabled and terminated entries, contained no extension whose name matched Lace or Midnight. Only matching extension metadata was projected; unrelated tabs and extension contents were not inspected. Owned tabs were closed and CDP connections disconnected. No installation, authorization, address request, wallet unlocking, signing or broadcast was performed. This narrows the earlier empty-connector finding for those specific profiles; it does not prove that another profile has no wallet.

The missing-connector error now gives concrete recovery steps: install/enable Midnight Lace in the current profile, allow site access, update an already enabled extension and reload. The web app still cannot inspect installed extensions; its error reports only failure to discover a compatible connector.

All **8 desktop/mobile role cases passed in 45.3 seconds**, including updated missing-wallet guidance for researcher join and vendor recovery. The final normal release build exited successfully: **8 circuits, 62 files, 62,621,212 bytes**, after the fresh compiler comparison at 12:11:48.759 UTC. The three original browser debugging endpoints remained running after inspection. Native-wallet verification still requires a profile exposing the connector.

## Retain and compare the selected retest patch — 2026-09-09

Role-vault v10 adds a nullable selected patch commitment per attempt. New retest commands snapshot the actual command's patch before the encrypted pre-broadcast checkpoint; it cannot replace an already saved patch. Older entries migrate to null. The schema requires an explicit retest choice for non-null patches, and notes, attachment drafts, later attempts and receipts preserve the field. Versions 1–9 remain readable, but older releases cannot open v10. The wallet-free journal projection omits selected patch context along with notes and choice.

Reconciliation now separately compares the saved patch with the observed patch and derives the expected retest commitment using the saved patch. Thus an internally consistent observed retest on a different patch is still rejected as a mismatch. V9 entries retain the prior partial comparison with an explicit missing-intended-patch notice; no historical patch is invented. Backup authenticity, complete arguments and safe retry remain outside this comparison.

All **34 focused recovery/workspace/comparison/worker-boundary tests passed in 68.95 seconds**, followed by web typechecking. Tests cover encrypted round-trip, migration/edit/receipt preservation, conflicting patch rejection, a wrong observed patch with its own valid commitment, and the actual workspace's pending encrypted checkpoint containing the command patch. All **6 desktop/mobile role-note cases passed in 47.7 seconds**, covering both v9 and v10 offline restoration and existing private-note recovery. The ordinary browser suite now has 72 cases; the full expanded suite was not rerun in this increment. No native wallet operation was performed.

The final normal release build exited successfully: **8 circuits, 62 files, 62,620,866 bytes**, with a fresh compiler comparison at 12:08:11.806 UTC. Contract source and retained proving keys were unchanged.

## Consolidated validation of recovery and wallet changes — 2026-09-09

At code revision `87071f8`, `npm run validate` exited successfully without reruns: all six workspace builds and typechecks passed, followed by **230 tests across 44 files** (shared 13, contract 13, API 27, ciphertext service 18, integration 9, web 150). The web portion took 69.80 seconds and includes all three retest checkpoint-ordering cases in one green full run. Generated source-map warnings remain; they did not fail compilation or tests.

The eight compiler/release/HTTP/copy/environment test files also passed together under `node --test`: **15 tests, zero failures or skips**, in 1.35 seconds. These verify local tooling behavior, not remote CI or deployed service configuration.

The full ordinary browser suite passed **70 desktop/mobile cases in 3.8 minutes**, using two workers with `CI=1`, no retries and no test exclusions. It includes v9 retest-choice recovery and production-worker patch/retest comparison in the expanded suite. Wallet responses remain injected where applicable; historical chain replay uses captured evidence rather than a new native-wallet ceremony.

The separate replication suite passed **4 desktop/mobile cases in 46.4 seconds**, also without retries. Two actual local ciphertext services retained identical envelopes, partial writes blocked completion, corrupt replicas were rejected and offline backfill reused saved ciphertext. This does not establish independently operated or geographically separate storage.

After both browser configurations, the final normal `release:build` exited successfully and restored the default artifact: **8 circuits, 62 files, 62,616,549 bytes**. Its fresh source comparison at 12:03:40.100 UTC matched retained compiler output; proving keys were not regenerated. Public hosting, remote CI, native Lace, physical-device recovery and the unimplemented roadmap remain separate completion requirements.

## Verify retest checkpoint ordering from workspace controls — 2026-09-09

Three component regressions now drive the real workspace Pass/Fail controls while holding the mocked storage write unresolved. They decrypt the pending write and require v9, the matching report/operation, exact note whitespace, the explicit choice and no finalization. Submission continuation must remain untouched until storage resolves, and stay untouched when storage rejects. A later callback outside the operation must fail; no follow-up ledger read or automatic retry occurs. Storage and role session are mocked, so these establish application ordering, not native-wallet or physical-disk durability.

The first run passed the 12 existing workspace cases; all three new cases reached the checkpoint assertions but initially checked a detached button, which the UI removes when its ledger snapshot is cleared. The tests now assert the live disabled form and absent action. The storage-failure case also correctly expects autosave to be disabled before a later callback. The final focused run passed **3 new cases in 20.35 seconds**, with 12 existing cases excluded by the explicit filter; this is not a claim of one green 15-case run. Web typechecking and read-only `release:check` passed. No production code changed: the existing artifact remains **8 circuits, 62 files, 62,616,549 bytes**.

## Compare saved retest notes and explicit choice — 2026-09-09

Report replay returns public retest commitment and Pass/Fail alongside the patch commitment. The unlocked role journal compares the explicit v9 choice and a Compact persistent hash of report ID, replayed patch, exact saved note text and saved choice against those fields. Missing older choices are never inferred, and malformed/foreign evidence cannot produce a match. Private notes and choice remain outside worker messages. The patch input is replayed public evidence, not a separately retained intended patch; complete intended-argument reconciliation and safe retry remain open.

All **7 focused tests passed in 4.39 seconds**, including generated-circuit simulator executions for both Pass and Fail, changed text/choice/patch, invalid inputs, component discrepancies and worker-message privacy. All **4 desktop/mobile replay cases passed in 45.8 seconds**, confirming the production worker's historical commitment matches the original runner's synthetic `retest:preprod-request-now-rejected` text and Pass choice. Web typechecking passed. The full web suite then passed **147 tests across 32 files in 56.52 seconds**. No native wallet call, new on-chain transaction or full 70-case browser run was performed.

The final normal release build exited successfully: **8 circuits, 62 files, 62,616,549 bytes**, with a fresh compiler comparison at 11:50:34.627 UTC. Contract source and retained proving keys were unchanged.

## Preserve explicit retest choice in encrypted recovery — 2026-09-09

Role-vault v9 adds nullable `retestPassed` per submission attempt. New retest commands capture the boolean from the actual command, attach it with immutable attempt notes, and persist the encrypted journal before wallet broadcast. Migration keeps older choices null, rejects non-boolean values or choices attached to other circuits, and prevents replacing an existing choice. Notes, attachment drafts, subsequent attempts and finalized receipts preserve v9. The unlocked journal distinguishes saved intent from verified outcome; the wallet-free projection omits it. Versions 1–8 remain accepted; old releases do not support v9. Retest commitment comparison remains open.

The 12 role-workspace tests passed in the first focused run. Its new recovery test initially used the wrong attachment-fixture field (`sha256` instead of `digest`); after correcting that fixture, all **12 recovery tests passed in 11.46 seconds**. The new case checks legacy unknown choice, saved false, edit/migration preservation, encrypted round-trip, replacement rejection, invalid values and downgrade rejection. Web typechecking passed. No native wallet call was performed.

After adding an explicit finalized-receipt preservation assertion, the final **12 recovery tests passed in 11.11 seconds**. All **4 desktop/mobile role-note cases passed in 1.0 minute**, including two new v9 offline-restoration cases; the ordinary browser suite now contains 70 cases, not all rerun here. The final normal release build exited successfully: **8 circuits, 62 files, 62,608,059 bytes**, with a fresh compiler comparison at 11:45:57.869 UTC and no regenerated proving keys.

## Compare saved patch context after report replay — 2026-09-09

Report replay now returns the public patch commitment. The local saved-context comparison supports `anchorPatch` by hashing the attempt's exact note text and applying the retained Compact contract's domain-separated persistent-hash layout with the report ID. No private notes enter the worker payload. Missing or malformed commitments fail comparison; existing snapshots, journal states and retry controls are unchanged. Retest intent and full transaction argument reconstruction remain open.

All **8 focused comparison/worker-boundary tests passed in 4.13 seconds**, and web typechecking passed. A new simulator test creates, triages and accepts a report, executes the generated `anchorPatch` circuit, then checks local computation against that circuit result. It also verifies whitespace/report changes alter the commitment and invalid IDs are rejected. A component case verifies success, changed notes and missing evidence. No proving keys or contract source changed.

All **4 desktop/mobile report-replay cases passed in 44.3 seconds**. The production worker's historical payout record retains the patch commitment matching the synthetic `release:preprod-wave-1-demo` reference used by the original lifecycle runner. This verifies the added public field against captured evidence; it is not a new on-chain call. The final normal release build exited successfully: **8 circuits, 62 files, 62,602,912 bytes**, with a fresh compiler comparison at 11:40:10.648 UTC. Full web/browser suites were not rerun in this increment.

## Bound browser ZK artifact downloads — 2026-09-09

Inspection of the installed SDK found a five-minute HTTP timeout for proof-server calls, but no deadline or size limit in `FetchZkConfigProvider`. Browser provider wiring now supplies a fetch adapter that buffers each artifact under a two-minute header/body deadline and a 64 MiB decompressed-byte cap, rejects redirects, cancels error/oversized/timed-out bodies and discards late responses. HTTP and HTML diagnostics remain handled by the SDK. The largest current retained key is 9,979,674 bytes, below the cap. This is a per-artifact transport bound, not release authentication or an overall proof deadline; the installed proof provider catches artifact errors and can use server-side keys instead.

The focused run passed **24 artifact/provider tests in 4.16 seconds**, including six new transport cases and the existing release-subdirectory URL test. It covers exact binary bytes, missing headers, stalled body, streamed overflow despite false Content-Length, and HTTP/HTML body cancellation. The initial overflow fixture closed its stream before cancellation and was corrected to keep producing data; production overflow rejection already passed. Web typechecking passed. These use mocked fetch/connector responses; no native wallet operation was performed.

The final normal release build exited successfully, including final web typechecking: **8 circuits, 62 files, 62,600,549 bytes**. The fresh compiler comparison at 11:35:38.060 UTC matched retained output without regenerating proving keys. The full browser and web suites were not rerun in this increment.

## Bound wallet balancing — 2026-09-09

Wallet balancing now has a five-minute response deadline after its authorization check. The installed connector API returns a transaction ready for submission and exposes no cancellation parameter for this operation. The installed SDK awaits `balanceTx` before calling `submitTx`; returning a timeout rejection therefore stops that continuation. Late balance responses are not decoded or forwarded. The extension may still finish or display its own request; the error instructs the user to review it before another attempt. No automatic retry was added, and proving/finality remain outside this deadline.

The final focused provider/submission run passed **26 tests in 4.23 seconds**. Four new cases cover timely return, immediate rejection, timeout followed by late success and timeout followed by late rejection. The timeout cases model the SDK's balance-then-submit chain and assert no late response reads, no submission checkpoint, no broadcast, no retry and no retained timer. Timely decoding is mocked and checks the returned bytes/modes; it is not cryptographic or native Lace validation. Its initial assertion incorrectly required `Uint8Array` equality while the runtime returns a `Buffer`; comparing byte contents corrected the test without changing production code. Web typechecking passed before that assertion-only correction; the release build below rechecks the final source.

The full 130-test web and 68-case browser runs from the preceding increment predate these four new unit cases; they were not rerun for this increment. The final normal release build, including web typechecking, exited successfully: **8 circuits, 62 files, 62,595,134 bytes**. Its fresh compiler comparison at 11:32:10.252 UTC matched retained output without regenerating proving keys.

## Bound transaction authorization checks — 2026-09-09

The authorization reads before wallet balancing and before submission preparation now each have a two-minute deadline. Previously either could leave a role action pending indefinitely, outside the setup/submission deadlines. A late successful response cannot resume the timed-out caller: neither transaction serialization, identifier checkpoint, balancing nor broadcast is started by that continuation. The post-checkpoint authorization read remains inside `submitIdentifiedTransaction` and retains its existing unknown-outcome handling. Already-started wallet operations, proof generation and finality are outside this change.

The focused provider/submission run passed **22 tests in 4.24 seconds**, including two stalled preflight checks with late resolution and a subsequent explicit authorization check. Web typechecking passed. The full web suite then passed **130 tests across 28 files in 54.45 seconds**. Connector deadline tests use mocks and do not establish native Lace compatibility.

The complete ordinary Playwright suite passed **68 desktop/mobile cases in 3.6 minutes**, with two workers and no retries or test exclusions. This includes the newly added setup-timeout cases and the existing disclosure, recovery, storage, role and public replay journeys. The separate replication suite was not rerun in this increment.

The final normal release build after browser testing exited successfully after a fresh compiler comparison at 11:28:45.768 UTC: **8 circuits, 62 files, 62,593,775 bytes**. Retained proving keys were not regenerated.

## Bound initial wallet setup — 2026-09-09

Initial provider setup now has one two-minute deadline across discovery, connector authorization, status, configuration and shielded-address reads. Each await is followed by a cancellation check before another connector method can run. SDK network selection occurs only after the bounded setup resolves successfully. Timeout clears the caller's pending state, does not submit or retry, and warns that the extension may still own an outstanding connection prompt. It cannot cancel that prompt or cover later proving/balancing/finality.

All **24 wallet-provider/role-workspace tests passed in 55.54 seconds**. Four deadline cases separately stall connection, status, configuration and addresses, then release a late response and assert no additional connector calls, no SDK network change, no submission and no remaining timer. A new explicit setup can subsequently succeed. Web typechecking passed. These are mocked connector responses, not native Lace evidence.

The new desktop/mobile browser cases passed in **37.7 seconds** using a deliberately stalled injected connector and Playwright's virtual clock. They verify that the role form is disabled while setup is pending, becomes available after the deadline, and does not read authorization status or enter a researcher workspace when the old connector resolves afterwards. These two cases expand the ordinary suite from 66 to 68; the entire expanded suite was not rerun in this increment.

The final artifact passed the read-only `release:check`: **8 circuits, 62 files, 62,592,677 bytes**. The release build's fresh source check at 11:17:14.722 UTC matched the retained compiler output; proving keys were not regenerated. The build process's terminal output was unavailable after session recovery, so this records the subsequent artifact check rather than an independently captured build exit status.

## Native connector availability and robust discovery — 2026-09-09

The current environment was rechecked for a usable native browser session. Three running Chrome/Edge debug endpoints were reachable. In each existing browser context, an owned temporary tab loaded the local VulnSeal role page and checked `window.midnight` after two seconds: all returned an empty connector list. The probe did not call `connect`, request addresses, inspect unrelated tabs, unlock a wallet, sign or submit. Owned tabs and the temporary local preview were closed; the three existing browser endpoints remained running. This establishes no exposed connector in those sampled pages, not proof that an extension is uninstalled or that another browser/profile cannot expose one. Native Lace verification remains open.

Discovery previously dereferenced null injected entries and accepted malformed major-version prefixes or entries without a callable `connect`. It now skips these entries and selects a callable version-4 connector with a version-shaped string. The regression presents null/primitive, malformed/unsupported versions and missing/non-callable methods before a valid connector, and asserts only the valid connector is used without submission. This test uses mocks and is not substituted for native-wallet evidence.

The wallet-provider suite passed **eight tests**, and web typechecking passed. The final normal-configuration release build passed fresh source/compiler comparison, six workspace builds and packaging: **eight circuits, 62 files, 62,590,646 bytes**. No signing, wallet transaction, key regeneration or public deployment occurred. Broader previous unit/browser suites were not rerun for this discovery-only fix.

## Receiving-key work after closing a workspace — 2026-09-09

The disclosure panel's existing generation guard prevents late asynchronous results from downloading files or setting keys after unmount. New deterministic lifecycle tests pause actual component operations at key generation and backup encryption boundaries, close the component, then release success/failure. They verify no late download/key callback and no error leaking into a freshly opened panel; the fresh panel can still create its own key normally.

Key generation now checks whether the panel is still current before starting backup derivation. This avoids beginning PBKDF/encryption work for an already closed workspace. An in-flight WebCrypto operation itself remains uncancellable, and this is not a forensic memory-erasure guarantee. The existing real-crypto handoff tests remain separate from these deliberately controlled async-boundary tests.

Web typechecking and **eight focused tests** passed. The four desktop/mobile handoff and role-switching journeys passed in **58.8 seconds**, without retries or exclusions, preserving normal key restoration and disclosure decryption. Broader previous suites were not rerun for this lifecycle-only change.

The final normal-configuration release build passed source/compiler comparison, six workspace builds and packaging: **eight circuits, 62 files, 62,590,305 bytes**. No key material, contract source, backup schema or external state was changed.

## Find saved reports by authenticated title — 2026-09-09

Role report selection now decrypts titles/assets locally and offers case-insensitive filtering by those fields or full report ID. Report IDs remain visible so duplicate titles are distinguishable. Filtering does not select another report: the current selection remains available with an explicit outside-search label. Titles from failed authentication are never displayed; search state and title metadata are not added to backups. Sequential title reads stop starting more work when the component unmounts.

The selector and role-workspace suites passed **14 tests in 54.67 seconds**, and web typechecking passed. Tests use real encrypted disclosures and cover private title/asset search without fetch, exact selected-ID preservation, explicit selection callbacks, no matches, unauthenticated metadata and remount clearing. Desktop/mobile browser cases cover duplicate titles, ID filtering and unchanged report-note/recovery behavior alongside lost-upload recovery. These are local browser tests; no wallet or ledger behavior changed.

All **four browser cases passed in 1.5 minutes**, without retries or exclusions. The final normal-configuration release build passed source/compiler comparison, all six builds and packaging: **eight circuits, 62 files, 62,590,086 bytes**. Broader previous suites were not rerun for this selector-only increment. No contract source, proving key, backup schema or external state changed.

## Read back every ciphertext destination — 2026-09-09

The role workspace can explicitly check the selected saved report at every configured ciphertext store, including offline-restored roles. The API probe reads destinations in parallel and returns ordered per-store digest verification or failure details with a timestamp. GET requests bypass browser caching and keep the existing bounds. It neither falls back silently nor repairs/uploads data. The UI clears the observation when selecting another report or starting an upload and describes it as a read-only snapshot, not retention or ledger evidence.

The API client suite passed **15 tests**. Its new probe case receives valid bytes, corrupt bytes and HTTP 404 from three destinations, checks all outcomes independently, asserts GET-only/no-store behavior, and rejects bad addresses/timeouts before fetch. The two-service desktop/mobile suite exercises zero verified copies before upload, one after partial replication, two after full retry, and one after a simulated corrupt replica; read checks never increase the PUT count. This is two same-host service instances, not independently operated infrastructure.

The complete two-store suite passed **four cases in 51.5 seconds**. All **12 role-workspace tests** passed in 54.48 seconds, and web typechecking passed. The final normal-configuration `release:build` passed fresh compiler-source comparison, six builds and packaging: **eight circuits, 62 files, 62,584,706 bytes**. The previous broader unit/browser suites were not rerun beyond these changed paths. No proving keys, contract source, public deployment or blockchain state changed.

## Saved submission ciphertext reconciliation — 2026-09-09

For a recorded `submitReport`, the role workspace now compares SHA-256 of the exact saved disclosure envelope with the ciphertext digest returned by report replay. The envelope is selected by the journal report ID from the validated vault and hashed locally. Neither envelope nor decryption key is sent to the worker or evidence services. A mismatch gives explicit investigation guidance; absent saved material or malformed digest does not yield a match. The comparison does not test ciphertext-service retention, authenticate chain data, verify every submission argument or enable retry. The backup schema is unchanged.

The focused ciphertext/decision/worker suite passed **eight tests**. The complete web suite passed **26 files / 118 tests in 55.61 seconds**, and web typechecking passed. The new tests verify exact bytes (including a trailing newline mismatch), missing/invalid evidence and clearing a prior match; the worker-boundary test includes a saved envelope and still requires a public-only outgoing payload.

All four historical replay desktop/mobile cases passed in **43.7 seconds**. The two production-worker cases were subsequently strengthened and rerun in **41.5 seconds**, requiring the exact ciphertext digest from the earlier captured public lookup (`37ba2e…982eff9`) rather than only hex syntax. These are captured historical inputs and local Chrome execution, not a new network transaction or native-wallet recovery ceremony. The previous full browser and workspace baselines were not rerun beyond the stated web/replay scope.

The final normal-configuration release build passed compiler-source comparison, six workspace builds and manifest packaging: **eight circuits, 62 files, 62,579,106 bytes**. Proving keys, contract source and container images were retained.

## Saved decision versus replayed report — 2026-09-09

The report worker now returns public decision-digest/severity/reward-tier values from the replayed changed record. The role workspace compares those values locally to the note snapshot attached to the selected submission attempt: exact UTF-8 decision text for acceptance/rejection, severity for acceptance, reward tier for payout authorization. Mismatches raise an alert; missing snapshots, mismatched report IDs and unsupported operations never receive a successful comparison message. The note snapshot is not sent to the worker or external services. This is partial source-trusting reconciliation, not authenticated arguments, a terminal journal result, token transfer evidence or permission to retry. See [ADR-0023](adr/0023-saved-decision-comparison.md).

The focused comparison/worker-boundary suite passed **six tests**, and the complete web suite passed **25 files / 116 tests in 55.55 seconds**. Web typechecking passed. Tests include whitespace-sensitive text hashing, wrong digest/tier, operation-specific comparisons, absent snapshots and wrong report binding. The worker-boundary test supplies private text and asserts the exact outgoing payload remains public-only.

The production-worker browser suite passed **four desktop/mobile cases in 44.2 seconds**, without retries or exclusions. It replays captured historical Preprod data, checks the `accepted:p2` SHA-256 and severity/reward tiers of 3, rejects wrong program/report bindings and supports explicit cancellation. UI comparison behavior is component-tested; this run does not claim a new native-wallet ceremony or a real-role browser comparison against that historical actor's private backup. The prior full 66-case and four-replica browser baseline was not rerun for this increment.

The final normal-configuration `release:build` passed fresh compiler-source comparison, all six builds and packaging: **eight circuits, 62 files, 62,574,766 bytes**. No proving key, contract source or backup schema changed, and no external write was performed.

## Consolidated build-toolchain regression — 2026-09-09

After the environment, compiler staging and exact artifact-copy changes, `npm run validate` completed all six builds and typechecks. Shared 13, contract 13, API 26, ciphertext service 18 and integration 9 tests passed. The web run had one failed query: the receiving-key retention test's default one-second wait expired while real RSA-3072 generation and encrypted backup derivation were still processing. Its wait now has an explicit five-second bound; assertions and production crypto are unchanged. The complete web rerun passed **24 files / 113 tests in 57.35 seconds**. This establishes 192 passing workspace tests across the initial run and corrected web rerun, not a claim that the initial command was green.

All **15 tool tests** also passed: five compiler checks, seven release/HTTP/artifact-copy checks and three public/development environment checks. These are separate from the 192 workspace tests. Native-wallet, cross-region durability, semantic proving-key validation, escrow transfers and public deployment remain outside this local regression evidence.

The complete ordinary browser suite subsequently passed **all 66 desktop/mobile cases in 4.1 minutes**, with two CI workers, no exclusions and no retries. This run used the current artifact-copy scripts and development service launcher, including recovery, journal replay, role isolation, storage failures and release-subdirectory assets.

The separate two-store browser suite then passed **all four cases in 46.1 seconds**, also without retries or exclusions. It covers identical ciphertext at both local services, partial-upload blocking, three-report offline backfill, corrupt-source fallback and authenticated local fallback. No native wallet or externally operated replica is involved.

The final normal-configuration `release:build` passed source/compiler comparison, six workspace builds and manifest packaging: **eight circuits, 62 files, 62,567,604 bytes**. Container images, retained proving keys and public deployments were not changed. The browser evidence is local Chrome desktop/mobile emulation, not a native Lace ceremony or a remote CI run.

## Exact generated-directory copies — 2026-09-09

Contract/web artifact copying now replaces each generated directory from a completed temporary copy instead of overlaying files. This removes obsolete key/circuit files; an absent optional source directory produces an empty destination rather than retaining old keys. Required source absence, redirected paths and overlapping/out-of-workspace paths are rejected. Copy failure preserves the old destination; a reported installation-rename failure attempts rollback. A rollback failure retains its temporary recovery copy and reports its path. This is per-directory installation, not a transaction across an entire build or crash-atomic publication. Build and serving must remain separate.

The release suite passed **seven tests**, including stale-file removal, absent optional keys, required-source failure, path rejection, simulated copy failure and simulated installation failure with rollback. The normal `release:build` passed fresh compiler-source comparison, all six builds and packaging: **eight circuits, 62 files, 62,567,604 bytes**. Afterwards, synthetic obsolete `.prover` files were placed only in contract/web `dist` directories; both actual copy scripts removed them, and the readonly release manifest check passed with the same file count and bytes. Original generated source files were not changed. Application and browser suites were not rerun for this packaging-only increment.

## Staged compiler output and retained recovery — 2026-09-09

Full compilation and fresh syntax compilation now generate into an isolated `.compact/compile-*` directory under an exclusive cooperative compiler lock. The launcher verifies compiler files and, for a full compile, nonempty regular prover/verifier/binary-ZKIR files for every proving circuit. A changed source blocks installation. Only successful output is promoted; any old managed directory is archived in the same staging area. Installed source-map paths are adjusted to the final directory. Failure before promotion leaves existing artifacts untouched. Two-rename promotion is not crash-atomic: a crash between renames or failure of rollback requires manual recovery, and builds must not run concurrently. No semantic key verification or automatic cleanup is claimed.

**Five compiler tests passed**, covering retained-key detection, stale compiler comparison, generation failure, incomplete keys, source mutation, archive preservation, final map paths and an existing lock. The real retained-key syntax-check path also passed. A real full compiler invocation used `/bin/false` as its explicitly selected synthetic failing key generator: Compact generated temporary output, key generation failed with exit status 1, and all **36 existing managed-file hashes** remained identical. The failed stage is retained at `.compact/compile-zHYEVE`. An isolated fresh-checkout fixture successfully compiled and installed syntax-only output, then passed fresh compiler-source comparison. No real proving keys were regenerated or blockchain transaction sent. Prior web/release tests were not rerun for this compiler-only change.

## Preserve proving material during syntax checks — 2026-09-09

`compact:skip-zk` now detects any retained key-directory entry, including a partial/empty key file, and runs the existing isolated compiler-source comparison instead of replacing managed output. A fresh checkout with no key entries still generates bindings/ZKIR normally. An existing key set whose compiler outputs no longer match the source is preserved and requires explicit full compilation. Unknown or repeated command arguments are rejected. This does not make full key generation transactional or validate proving-key semantics.

Both compiler guard/comparison tests passed. A real `npm run compact:skip-zk` on the current checkout passed fresh compilation and preserved all **16 retained key-file SHA-256 hashes**. A separate synthetic fixture with invalid Compact source and a retained marker failed compilation with exit status 1 and kept its marker unchanged. That fixture remains under ignored `.compact/retained-guard-*`; the real contract source and key set were never replaced. No new proving keys, deployment or blockchain writes were produced.

A second isolated fixture containing the current source and no managed output successfully ran the real syntax compiler and produced bindings, declarations, compiler metadata and ZKIR. It remains under ignored `.compact/fresh-compile-*`. The prior application/browser/release validation was not rerun for this compiler-launcher-only change; the three real compiler paths above are the new execution evidence.

## Consistent development service configuration — 2026-09-09

The README's root `.env` previously configured the browser but was ignored by `npm run dev -w @vulnseal/cipherstore`. Loading its relative `./cipherstore/data` value from the nested workspace would also have selected a nested `cipherstore/cipherstore/data` directory. The dedicated development launcher now uses Vite's development env-file precedence, copies only `CIPHERSTORE_*` values and resolves storage paths from the repository root. It enters the existing server CLI in the same process, retaining server lease and shutdown behavior. Production `start`, containers and the backup CLI still require explicit environment configuration.

The configuration command passed **three tests**, including a synthetic root with all four development env layers, an ignored production file, shell overrides, exclusion of unrelated values, an absolute override and the default data path. The existing two-store browser suite then passed **four desktop/mobile cases in 45.7 seconds** through the actual new development launcher. Both services used separate temporary data directories and shell-selected ports; real uploads, replicated reads and saved-report backfill succeeded. No repository `.env` contents or existing ciphertext were modified. This does not establish production deployment, external durability or wallet readiness. The previous 192-test workspace baseline was not rerun because this increment changes only development startup/configuration and documentation.

The final normal-configuration `release:build` passed fresh source/compiler comparison, six workspace builds and packaging, retaining **eight circuits, 62 files and 62,567,604 bytes**. No proving keys were regenerated or local container images replaced.

## Effective public build configuration — 2026-09-09

Vite now reads the repository-root env directory used by the README setup instructions and validates its effective public mode, network and storage/proof/indexer URLs before build or serve. Shell overrides retain precedence over mode-specific files. Earlier `web/.env*` settings must move to the repository root. The shared ciphertext validator rejects even empty query/fragment delimiters and normalizes trailing slashes before duplicate checks; the exported direct single-store client now uses that validator too.

`npm run test:web-environment` passed **two tests** exercising actual Vite config resolution for build and serve, mode-specific files, shell precedence, root env-directory selection and exclusion of a synthetic non-public variable. A real failed Vite build preserved a preexisting output file even with `--emptyOutDir`. Initial test-development failures exposed fixture issues (dotenv strips an unquoted `#`; Vite's `envFile: false` also resolves its env directory to false); fixtures were corrected and the final tests passed. This gate validates syntax only and does not probe endpoints or validate every possible `VITE_*` application option.

`npm run validate` passed six workspace builds/typechecks and **36 files / 192 tests**: shared 13, contract 13, API 26, ciphertext service 18, integration 9, web 113. The direct-client regression confirms invalid endpoints trigger no fetch and a normalized base path produces the intended blob URL. The separate two-store browser suite passed **four desktop/mobile cases in 47.3 seconds**, without retries or exclusions, including three-report offline backfill and corrupt-read fallback. The 66-case ordinary browser suite was not rerun in this increment. CI now includes the public-environment gate; no remote CI execution or deployment is claimed.

The final normal-configuration `release:build` also passed fresh source/compiler comparison, all six builds and packaging: **eight circuits, 62 files, 62,567,604 bytes**. Existing proving keys and local container images were retained. Native-wallet, cross-region durability and public-host verification remain open.

## Saved workspace ciphertext backfill — 2026-09-09

The role workspace can explicitly upload all backed-up saved reports to its configured destinations. Reports run sequentially; the first unconfirmed upload stops the batch and selects that report. Progress counts all-destination acknowledgments. The stop control remains usable while other workspace controls are locked and skips remaining reports after the active request settles. Component unmount also stops later reports. No envelope, key, report ID, backup schema or wallet state changes, and no durable upload cursor or automatic resume is claimed.

Focused batch/workspace tests passed **14 cases** including the existing backup gate, partial failure, original-object retry, stop and actual component unmount with a held upload. The full web suite passed **24 files / 113 tests in 56.31 seconds**, and web typechecking passed. The two-store browser suite passed **four desktop/mobile cases in 44.8 seconds**. Its restored offline workspace now contains three distinct reports: a simulated replica failure on report two leaves report three untouched, then an explicit full retry stores byte-identical envelopes at both real local services. Both copies of every report were fetched and compared. No wallet connection or POST was allowed. An earlier browser startup failed its build check while the test edits were in progress; the final run above completed without retries or exclusions.

The final normal-configuration `release:build` passed the fresh compiler-source comparison, all six builds and manifest packaging: **eight circuits, 62 files, 62,567,245 bytes**. The previous full 187-test workspace / 66-case ordinary browser baseline below was not rerun in this increment; the changed workspace and two-store browser paths were rerun as stated. No proving keys were regenerated, container images updated, public deployment performed or blockchain transaction submitted. Cross-region durability and native Lace remain outside this evidence.

## Optional ciphertext replication — 2026-09-09

The browser and exported API client now support an explicit primary plus up to two additional ciphertext endpoints. Upload success requires every configured destination's acknowledgment; a partial failure retains the prepared artifact and has no automatic write retry. Reads move to the next endpoint after failure or invalid bytes, stop at the first digest-verified copy, and never write repair data. URLs reject credentials, query strings, fragments and normalized duplicates; fetches omit credentials/referrers and refuse redirects. The UI exposes destination configuration before upload.

The shared suite passed **13 tests**, including replica configuration rejection. The focused API client suite passed **13 tests**, including waiting for every acknowledgment, partial writes and explicit identical retry, corruption fallback, deadline-triggered fallback and all-source failure. The two-service browser suite passed **four desktop/mobile cases in 49.6 seconds**. Both real local service instances used distinct data directories. Tests simulated one unavailable upload destination, then reuploaded the original bytes to both; real GETs matched both stored envelopes. Corrupt primary reads used the valid replica, all-corrupt reads used the authenticated local copy, and neither path created a write. A restored offline role uploaded only its saved envelope to both real services without Lace.

The consolidated `npm run validate` passed all six builds/typechecks and **35 files / 187 tests**: shared 13, contract 13, API 25, ciphertext service 18, integration 9 and web 109. The web portion completed in 51.55 seconds. This also checks the default one-store path and existing recovery schemas; no root-test failure was observed in this increment.

The complete ordinary browser run subsequently passed **all 66 desktop/mobile cases in 3.7 minutes**, with CI's two workers and no exclusions or retries, using an explicitly empty replica setting. The new multi-store suite remains a separate configuration because it starts an additional storage service and builds a different public endpoint configuration.

The replica failure fixtures were then tightened to include valid CORS headers on both the simulated HTTP 503 and corrupt HTTP 200 responses. This ensures the browser can inspect the response instead of passing the fallback case due merely to CORS rejection. The complete separate suite passed again: **four cases in 44.7 seconds**, with no exclusions or retries. Combined coverage is 66 default-configuration cases plus four two-store cases; no new remote CI execution is claimed.

The final normal-configuration `release:build` passed the fresh compiler-source check, all six builds and packaging gate: eight proving circuits, 62 files and 62,560,451 bytes. Existing proving keys and container images were retained; no public deployment, new container drill or blockchain write was performed.

This is same-host HTTP-instance replication using the existing filesystem adapter. No cross-region/physical-device durability, second adapter, background backfill, native-wallet transaction or public deployment is claimed. The separate Playwright configuration and CI step run replication cases; the ordinary configuration explicitly clears replicas. Operator commands and failure-policy limits are documented in [cipherstore-replication.md](cipherstore-replication.md).

## Consolidated recovery-release validation — 2026-09-09

The preparation error UI now distinguishes a draft that failed before encryption from a retained ciphertext. Early failure no longer marks canonicalization complete or offers an upload retry for nonexistent saved bytes. Its regression test bypasses native form validation to exercise application validation, verifies no upload occurs and confirms the draft remains editable. Import guidance also names a pending preparation as an existing session that must not be replaced.

The compiler-comparison rejection test and all four release/HTTP tests passed. `npm run audit:prod` reported zero known production-dependency vulnerabilities at check time. These checks do not cover container OS packages, compiler provenance or a deployed service.

`npm run validate` completed all six workspace builds and typechecks, followed by **35 files / 182 tests**: shared 12, contract 13, API 21, ciphertext service 18, integration 9 and web 109. The web portion finished in 51.79 seconds. This is a new consolidated root run covering the preceding submission deadlines, recovery schema updates, retained uploads and pending preparation changes; it is not a native-wallet or live integration lifecycle run.

`CI=true npm run test:e2e` then passed **all 66 desktop/mobile cases in 3.7 minutes**, with two workers, no exclusions and no retries. This consolidates the entire browser suite after recovery v3 and role upload recovery, including older journal payloads, per-report notes, exact ciphertext reupload after file restore, worker replay and nested-release asset loading. It replaces the earlier 64-case browser baseline for this source state. Browser wallet/indexer fixtures and local services do not establish a real Lace ceremony, physical device recovery or public deployment.

The final normal-configuration `release:build` passed fresh compiler-source comparison, all six workspace builds and the manifest gate: eight proving circuits, 62 files and 62,551,757 bytes. Existing proving keys were reused. No new container image, public upload, GitHub CI execution or blockchain write was performed.

## Pending combined-session preparation — 2026-09-09

The combined browser now retains its exact encrypted preparation before upload. A storage-only retry reuses the original ciphertext, key, salt and report ID; pending data is separated from completed workflow state. Recovery v3 includes that preparation and a conservative submission-start flag. Once network submission setup begins, retry remains blocked after an error and after export/restore. Pending material is readable in the UI, and navigation cannot replace its draft/program or import over it. This is manual recovery, not a durable pre-wallet journal.

Three focused files initially had 18 passing tests and one test-harness failure caused by an incorrect default program name; correcting the fixture gave **19 passing tests in 11.67 seconds**. The later expanded uncertain-submission test successfully exported its pending flag but failed to restore because the JSDOM click did not submit the form (no join call and no application error). Increasing its wait alone did not resolve that failure. Using the existing component suite's explicit form-submit approach completed the restore and verified the retry remained blocked, with only one original submission call. That complete network test file passed **five tests in 15.09 seconds**.

The production browser regression passed **16 desktop/mobile cases in 1.5 minutes**, covering guided transitions, rejection/retest history, backup restore, attachments and storage failures. After adding the read-only pending report view, the focused storage run passed **four cases in 54.5 seconds**. Each stalled-upload case waits for the real 20-second client deadline, exports the pending encrypted file, restores it in an isolated browser, reads the private report and PUTs the original bytes/address to the real local service. A GET matches that envelope. No native wallet, live network transaction, public deployment or physical off-device recovery is claimed.

After the restore harness correction and final wording changes, the complete web suite passed **23 files / 108 tests in 51.05 seconds**. The earlier full run with the unsent JSDOM form had 107 passes and one failure and is not counted as passing validation.

The final normal-configuration `release:build` passed fresh compiler-source comparison, six workspace builds and the network-artifact packaging gate: eight proving circuits, 62 files and 62,550,933 bytes. Existing keys were reused; retained container images were not rebuilt.

See [ADR-0022](adr/0022-pending-demo-preparation.md) for the pre-export crash window, old-backup ambiguity, conservative submission boundary and remaining identifier/reconciliation work. The full 16-case run preceded the final read-only view/copy additions; the focused browser run covers that view. This is not a new full browser-suite total.

## Prepared report recovery after upload uncertainty — 2026-09-09

Independent role preparation now installs the locally encrypted disclosure in the vault before any storage request. The user saves it through the existing file/browser backup flow, then uploads the saved ciphertext. The same backed-up envelope is uploaded before an initial report contract call; a storage error prevents that call. No schema change, automatic upload retry or re-encryption on retry is introduced. Older saved disclosures also support the explicit upload action.

The focused role-workspace suite passed **10 tests in 51.42 seconds**. It verifies preparation makes no fetch, backup gates uploads and submission, a failed storage response prevents `session.execute`, and an explicit subsequent upload repeats the same envelope/address. The complete web suite then passed **23 files / 105 tests in 51.80 seconds**. These include existing autosave, journal, authority and finalized-receipt behavior; mocked sessions do not establish native wallet behavior.

The production browser run passed **four desktop/mobile cases in 1.1 minutes**: existing incomplete-draft recovery and the new upload-uncertainty journey. The latter uses the real local ciphertext server: Playwright forwards the first PUT, verifies the server accepted it, and deliberately drops the response. The browser retains the selected report; an isolated browser context restores the downloaded encrypted backup and PUTs exactly the same bytes to the same content address. A subsequent real GET returns the original envelope, and the restored private report remains readable. No Lace or blockchain submission is used. This is portable file recovery within one host, not a physical off-device drill.

The final normal-configuration `release:build` passed the fresh compiler-source comparison, all six workspace builds and packaging gate: eight proving circuits, 62 files and 62,537,941 bytes. Existing proving keys were reused. The earlier retained container images remain historical artifacts; they were not silently replaced by this web build.

See [ADR-0021](adr/0021-prepared-ciphertext-recovery.md) for the changed ordering and limits. Binary attachment delivery, replication, native-wallet uncertainty and the combined demo's separate preparation flow remain outside this change. No new full browser-suite total, public deployment or container rebuild is claimed.

## Fresh compiler-source comparison — 2026-09-09

`release:build` now begins with `compact:check-source`: a real isolated `compact compile --skip-zk` followed by comparison against retained managed outputs. The run at `2026-09-09T09:13:29.126Z` used compiler `0.31.1` and source SHA-256 `cf4a98e7256d7f10d9ea9a2ce009875ed7fb2de17b0c3c9c13de2db7b95e6d39`. All eleven files matched byte-for-byte: compiler metadata, generated JavaScript/declarations and eight textual ZKIR circuits. The parsed source map also matched after excluding only its directory-dependent `sourceRoot`. The original managed directory and keys were not replaced.

The new rejection test passed for stale JavaScript, declarations, circuit input and metadata, altered source mappings, an unsafe circuit name and a missing circuit file. All four existing packaging/HTTP tests passed. The complete updated release command passed the compiler gate, all six workspace builds and the manifest gate, retaining eight proving circuits, 62 files and 62,534,360 bytes. CI now includes the compiler comparison and rejection test; no remote CI execution is claimed.

The scripted checks removed their own temporary output. The initial manual comparison directory remains under ignored `.compact/source-check-adf3a238d5354ede904a47c5043b1baa`: automatic command review rejected its subsequent PowerShell cleanup with `blocked by policy`. It is not part of the packaged or committed artifact.

This proves current-source agreement for the compared compiler outputs, not fresh key/BZKIR generation or compiler authenticity. The older-CPU custom key generator recorded in ADR-0004 was not found in the inspected WSL locations; the existing keys were retained. No native wallet, new proof/transaction, container rebuild, deployment or full application/browser regression was performed in this tooling increment. The previous 64-case browser run remains the application baseline. See [the release guide](web-release.md) for the check's exact scope and WSL option.

## Retained release promotion and rollback — 2026-09-09

The new Compose topology runs two immutable-reference web backends behind a digest-pinned Caddy ingress. Separate release IDs retain their directory routes; promotion changes only the non-cacheable root redirect. The ingress startup script rejects duplicate IDs, malformed IDs and unknown active IDs. Image build/config validation and all three actual container rejection checks passed.

Two checked web images were built from the same application source with different public ciphertext configuration: A used a synthetic localhost endpoint on port 8898 and B used normal configuration. Four JavaScript files differ between their inventories. Both six-workspace release builds, image packaging gates and Caddy validation passed. A's 62-file inventory is retained in [web-rollout-a-manifest.json](evidence/web-rollout-a-manifest.json); B remains the normal local release artifact. This is a routing/asset-retention drill with distinct compiled chunks, not an application-schema migration or a test of the synthetic endpoint.

The first drill stopped on an HTTP `ECONNRESET` without a verified promotion result and cleaned its project. A bounded read-only root readiness probe was added for transport errors after ingress creation/recreation; it does not retry bad status/redirect assertions, artifact checks or wallet actions. The subsequent complete drill passed at `2026-09-09T09:02:25.943Z`. Both 62-file releases plus their directory indexes matched local hashes/MIME checks before promotion and after rollback. Chrome kept the old A page at its retained URL, opened A's distinct role-workspace chunk after promotion to B, and new root visits selected B. Rollback selected A while B's path remained intact. The two backend container IDs and serving origin remained unchanged.

[The captured result](evidence/web-rollout-drill.json) records both exact image IDs, ingress image and transfer inventories. The uniquely named Compose project, network and temporary env file were removed; images were retained. The final normal B artifact has 62,534,360 bytes across 62 files and eight proving circuits. No production endpoint, wallet, blockchain write, container vulnerability scan or new full workspace/browser run is claimed. The preceding 64-browser regression remains the application baseline. See [the rollout guide](web-rollout.md) for the two-slot limit, brief ingress recreation interruption and remaining deployment work.

## Release directory routing — 2026-09-09

The production build now emits relative asset URLs. The browser proving provider resolves resources beside the current index document, and demo/role links preserve that release directory. The HTTP release checker accepts a trailing-slash subdirectory base URL while retaining HTTPS/loopback, redirect, byte/hash and MIME requirements. Four release-tooling tests passed, including actual nested HTTP request paths and relative HTML entrypoints; seven browser-provider tests passed, including verifier/prover/ZKIR requests under a release prefix.

The new browser test uses a real local HTTP proxy that strips `/releases/test-v1/` before forwarding to the production preview. It loads captured public state through the SDK/WASM, starts the emitted worker at the nested path, checks its response to invalid input and follows the role-workspace link in a new tab. The first focused run passed eight existing cases but failed both new cases because the test changed only the fragment in the existing page; workspace selection happens on initial load. Following the real new-tab link corrected that harness assumption without changing routing semantics or relaxing assertions.

The subsequent complete `CI=true npm run test:e2e` run passed **all 64 desktop/mobile cases in 3.5 minutes**, with two workers and no exclusions or retries. This consolidates root-path journeys, v8 private-note recovery and both nested-release cases. The nested worker test establishes loading/initialization and input rejection; full captured report replay remains covered by the root-path worker cases.

The final `release:build` passed all six workspace builds and the local packaging gate; the subsequent read-only manifest check passed for eight circuits, 62 files and 62,534,360 bytes. No fresh compiler run, container rebuild or hosted artifact verification is claimed in this increment.

This enables mounting a release at an immutable directory URL; it does not retain old images, configure public ingress, prove a multi-version rollout or establish backup-schema compatibility across releases. [The hosting guide](web-hosting.md#mount-a-release-below-a-stable-path) describes the remaining operator work. Prefixes on one origin still share storage and wallet authorization. No native wallet or public deployment is involved in these tests.

## Private notes retained per submission attempt — 2026-09-09

Role-vault v8 adds an exact-schema, report-bound private working-note/tier snapshot to journal entries. Report submissions capture it before the existing encrypted checkpoint; checkpoint failure still prevents the wallet call. Legacy attempts migrate to null snapshots, and normal draft/note/attachment/receipt edits preserve the captured context. The wallet-free inspector explicitly strips private notes from its React projection. The unlocked workspace displays snapshots in collapsed sections labelled as local working context rather than verified arguments.

The focused run passed **four files / 23 tests**, including schema migration, encrypted round-trip, preservation after edits and finalization, replacement/oversize/report-mismatch rejection, and the decrypted pre-broadcast component checkpoint. The initial typecheck caught a missing helper closing brace; it was fixed before typechecking passed. Existing version assertions were updated for v8 report submissions.

The production browser regression passed **eight desktop/mobile cases in 1.1 minutes**. It covers v2/v5/v6 journal compatibility and the expanded v8 note journey: edit current notes, export encrypted data, reopen browser storage, read the unchanged historical snapshot, and inspect the same file without revealing private notes in the wallet-free view. These are synthetic backups and mocked wallet/network services, not native Lace transactions or immutable/audited history. See [ADR-0020](adr/0020-private-submission-notes.md) for limits.

The subsequent complete web suite passed **23 files / 104 tests in 52.41 seconds**, consolidating the preceding submission deadline with v8 recovery. This is a complete web test run, not a new full root/browser total.

The final `release:build` passed all six workspace builds and restored the normal release configuration after E2E. Its read-only manifest check passed for eight circuits, 62 files and 62,533,926 bytes. Existing compiler outputs were reused; no new container/public deployment is claimed.

## Wallet submission response deadline — 2026-09-09

The browser provider now limits its connector submission response wait to two minutes, starting only after the durable identifier checkpoint. Expiry raises `SubmissionOutcomeUnknown` with the original identifier. It does not retry, infer failure or cancel a broadcast already handed to Lace. A signal check after the final authorization read prevents a late authorization response from initiating a new broadcast after the wait has ended. Late connector success/failure remains detached from the completed result.

Focused submission/provider tests passed **two files / 14 tests**; the encrypted role-journal component regression passed **one test** in 13.90 seconds. Cases cover hanging responses, late success and rejection, late authorization with no broadcast, checkpoint-before-timer ordering and timer cleanup. Web typechecking passed. These use fake timers and mocked connectors, plus real journal encryption in the component regression; they do not establish native Lace execution. Browser suspension can delay timers, and this change does not bound connection, balancing/proving, local checkpoint I/O or later SDK finality polling. See [the recovery procedure](role-workspace.md).

`npm run release:build` passed all six workspace builds and generated the current manifest; the subsequent read-only release check passed for eight circuits, 62 files and 62,528,006 bytes. The previous complete 172-test / 62-browser run remains the consolidated baseline. No new full browser run or container rebuild is claimed for this provider change.

## Consolidated release validation — 2026-09-09

At application commit `e32cca3`, `npm run validate` passed all six workspace builds and typechecks followed by **35 test files / 172 tests**: shared 12, contract 13, API 21, ciphertext service 18, integration 9 and web 99. The complete web suite passed in 52.85 seconds. This consolidates attachment drafts, transport limits, release tooling, bounded evidence reads and static hosting changes with the existing recovery/replay implementation. Generated Compact sourcemap warnings remain visible; no assertion was skipped to suppress them.

`npm run audit:prod` reported zero vulnerabilities in its production dependency audit, and `npm run test:release` passed all four packaging/HTTP tests. The npm result does not cover OS/container packages or independent source review.

The full `CI=true npm run test:e2e` run passed **all 62 desktop/mobile cases in 3.4 minutes**, using two workers without exclusions or retries. The production browser build exercised report authoring/attachments, encrypted file and IndexedDB recovery, bootstrap failure, role switching, transaction journals, worker replay, public lookup and ciphertext-service failures. These journeys use captured or mocked network/wallet evidence and a local ciphertext service; the native Lace ceremony remains outstanding. No application change was required by this consolidation run.

The existing read-only Preprod verifier passed at `2026-09-09T08:19:41.981Z`: all eight retained historical identifiers were successful, the lifecycle tip remained `authorizePayout` at block 2371914, and the observed finalized head was 2471554. These are the previously recorded transactions, including the registration identifier; no deployment, transfer or new contract call was submitted. Reverification does not establish native Lace browser operation or payment execution.

After browser tests, `npm run release:build` restored the normal release build rather than leaving the E2E service configuration in `web/dist`. The generated manifest and subsequent read-only release check passed for eight circuits, 62 files and 62,526,683 bytes. Compiler outputs were reused; no fresh compilation provenance or public hosting claim follows from this packaging result. The preceding container drills remain separate evidence, and no remote CI run or public deployment was performed in this increment.

## Checked static web container — 2026-09-09

`npm run release:build` passed all six workspace builds and generated a release with eight proving circuits, 62 files and 62,526,683 bytes. The new multi-stage web image requires a manifest and reruns the packaging gate on copied local compiler/release inputs before copying only the static artifact into a digest-pinned Caddy runtime. Its initial Docker context was 104.38 MB. Image building and Caddy configuration validation passed.

The first runtime drill failed because the upstream Caddy binary retained a low-port binding file capability: execution with all container capabilities dropped returned `operation not permitted`. Removing that unnecessary capability in the image fixed execution on port 8080; non-root/read-only/no-new-privileges settings were retained. The corrected drill passed the complete HTTP hash/MIME comparison (63 requests, including the root page), cache/security header checks, 404s for missing keys/scripts/private paths and directory listing, non-root/read-only inspection, healthcheck command and graceful restart. [Captured image/result evidence](evidence/web-container-drill.json) identifies the exact tested image. The uniquely labelled test container was removed.

A separate uniquely named Compose project passed `up --no-build --wait`: Docker reported healthy at localhost port 32776. Inspection confirmed UID/GID 65532, a read-only root, init enabled, 268,435,456-byte memory limit and 64-process ceiling. That Compose container and network were removed after the check. Compose configuration validation also passed; no existing service was replaced.

Desktop Chrome and emulated Pixel 7 each loaded the production app through Caddy and verified captured public contract state with no page errors. External requests were intercepted; this is actual browser/SDK execution against fixtures, not a live chain or native wallet. The image ships a limited frame/base/object CSP, not a complete resource allowlist. No public host, TLS ingress, image vulnerability scan, CDN consistency or upgrade compatibility is established by these local checks. See [the hosting procedure](web-hosting.md).

## Bounded public evidence JSON — 2026-09-09

Public contract lookup and transaction observation now use the same streamed JSON reader as report replay. Transaction metadata/RPC responses are capped at 1 MiB each; public contract-state and replay responses allow 16 MiB each. Limits count actual decoded bytes independently of Content-Length. Oversized and aborted bodies are cancelled, reader locks are released, and invalid UTF-8 is rejected before JSON parsing. Existing 20-second request signals remain in effect; replay retains its worker cancellation/overall deadline.

The focused verification run passed **three test files / 20 tests**, including split multi-byte characters, exact byte boundaries, misleading Content-Length, oversized streams, stalled-body cancellation, pre-aborted reads and malformed input. Entry-point tests verify oversized indexer data stops both public lookup and transaction observation before any RPC request or published result. Web typechecking passed.

The rebuilt production browser regression passed **eight desktop/mobile cases in 57.7 seconds** with two CI workers: captured public-state lookup and receipt import, actual worker report replay, report/program mismatch rejection and cancellation. This is a selected regression, not a new full workspace/browser run or live network/wallet ceremony. The response caps bound accepted input bytes, not total browser memory, JSON object overhead or synchronous JSON/WASM execution time. Larger legitimate state needs an explicit future retrieval/schema design; it is not silently accepted beyond the cap.

## Served web artifact comparison — 2026-09-09

`npm run release:check-host -- http://127.0.0.1:4186` passed against a freshly started loopback Vite preview serving the previously checked production artifact: 62 inventoried files plus the root page, 63 HTTP requests and 62,523,111 decoded bytes. Every response matched the local artifact by length and SHA-256; HTML/JS/CSS/WASM MIME checks passed. The root page matched `index.html`. The owned preview process was stopped after verification. This is local HTTP evidence, not a public hosting or native-wallet result.

`npm run test:release` passed all four tests across packaging and hosting checks. Real HTTP fixtures cover changed/truncated/oversized content, incorrect MIME, HTTP errors, refused redirects, a stalled response body, wrong homepage content and inventory validation before requests. Origin checks require HTTPS outside loopback and reject credentials/paths/queries/fragments. The existing CI release-test step includes these cases automatically. No full workspace/browser test rerun is claimed for this tooling-only change.

The command uses a locally checked inventory, never a downloaded manifest as the trust authority. It streams sequential downloads with per-file deadlines and expected-size bounds. See [the operator instructions and limits](web-release.md#verify-files-through-the-serving-origin). Public-host configuration, cache/security headers, CDN consistency and browser execution remain separate release gates.

## Web release packaging gate — 2026-09-09

`npm run release:build` passed all six workspace builds and generated an inventory for eight proving circuits, 62 files and 62,521,837 bytes. A subsequent read-only `npm run release:check` passed against that manifest. The 24 required prover/verifier/binary-ZKIR files match the existing local compiler outputs by size and SHA-256. [The retained packaging evidence](evidence/web-release-packaging.json) records the manifest hash and source/metadata digests. Generated release files remain outside Git.

`npm run test:release` passed its synthetic fixture test covering missing, empty and mismatched prover data, missing HTML/lazy asset references, unexpected files, stale manifests and WASM import-object names. The initial static-reference scan misclassified a WASM namespace property as a fetched module; excluding object-property names resolved that false positive, and the actual production artifact passed. CI now runs these rejection rules alongside its existing checks; no remote CI run is claimed.

This gate verifies packaging against existing outputs, not compilation freshness, key semantics, arbitrary runtime URL closure or hosted availability. No compiler run, public deployment or native-wallet ceremony was performed in this increment. This is not a new full workspace/browser test run. See [the release guide](web-release.md) for the required preparation and remaining release gates.

## Ciphertext transport occupancy limits — 2026-09-09

The server now configures complete-request and socket-inactivity deadlines (30 seconds by default), a header deadline capped at 10 seconds, frequent timeout checks and a 64-connection default ceiling. It also explicitly configures a 16 KiB header limit, five-second keep-alive timeout and 100 requests per socket. CLI and Compose expose validated request-timeout and connection-limit settings; zero cannot disable either limit. These controls bound retained transport occupancy, not per-user fairness, operating-system buffering or the duration of underlying filesystem work.

The ciphertext build passed and all **four service test files / 18 tests** passed in 4.09 seconds. Real TCP tests continuously trickle headers/body, confirm closure within the deadline tolerance and verify that incomplete input leaves no committed file and a subsequent valid upload succeeds. They also test silent sockets, connection refusal before HTTP handling and invalid configuration. An initial test used a 150 ms timeout, assumed every closure included HTTP 408 and failed to consume a silent socket's readable side; correcting the socket handling and using a one-second test deadline resolved those harness assumptions. Production defaults were not relaxed to make the tests pass.

The selected production browser regression passed **six desktop/mobile cases in 1.4 minutes**, covering normal attachment upload/recovery/decryption, oversized-response fallback and the existing stalled-upload client deadline. This is not a new full workspace/browser validation run. Transport errors after receiving a complete upload still do not prove rollback or make automatic retry safe.

The updated Linux container image built successfully and passed the expanded container drill with a one-second CLI-configured request timeout: continuous body trickling was terminated, followed by successful ordinary uploads, quota/idempotency checks, writer exclusion, graceful restart and decryption of retained ciphertext. [The captured result](evidence/cipherstore-transport-drill.json) identifies the exact image. Disposable labelled resources were cleaned up. This adds cross-platform transport evidence; it is not a production load or fairness test.

## Ciphertext service container and deployment drill — 2026-09-09

The new multi-stage image builds the ciphertext service from allowlisted source inputs and a digest-pinned Node 24.14.1 base. The runtime uses the `node` account and contains compiled service/backup modules without workspace dependencies. Compose configures a read-only root, persistent volume, dropped capabilities, no-new-privileges, process/memory limits, bounded logs, a readiness healthcheck and localhost-only publication. A separate CI job is configured to build the image and execute its drill; no remote CI run is claimed.

`docker compose -f infra/cipherstore.yml config --quiet` and the actual image build passed. The build context was 242.18 kB; Docker reported a 79,379,398-byte linux/amd64 image. The first smoke invocation could not resolve the host's `.cmd` Docker wrapper from Node. Explicit executable/WSL argument routing fixed this without using a shell. The resulting container drill passed non-root/read-only checks, initial readiness, idempotent uploads, full-store rejection with continued reads/liveness, second-writer refusal, graceful restart and authenticated decryption of retained synthetic AES-GCM ciphertext. Its uniquely labelled container and volume were removed after the successful run.

A separate disposable Compose project also started healthy. The first attempt showed that PowerShell environment variables were not forwarded by this host's WSL wrapper, so its requested random port had not been applied; that HTTP check did not establish readiness. Explicitly setting the variable inside WSL recreated the container at `127.0.0.1:32770`, where `/readyz` returned `status: ready`. Inspection confirmed user `node`, read-only root, init enabled, 512 MiB memory and 64-process limits. The operator guide now explains env-file/WSL handling. Evidence is retained in [cipherstore-container-drill.json](evidence/cipherstore-container-drill.json).

These are local container/volume checks, not a hosted production release, OS-image vulnerability scan, physical off-device backup, load test or forced-shutdown drill. TLS, authentication/rate limits, external monitoring and production-volume recovery remain deployment work. No application behavior changed, and this section does not claim a new full workspace/browser validation run.

## Pending attachment input recovery — 2026-09-09

The full `CI=true npm run test:e2e` run passed **all 62 desktop/mobile cases in 3.4 minutes**, with two workers and no exclusions or retries. This includes the updated attachment recovery journeys and all prior startup, role, receipt, storage and workflow cases.

The attachment editor's four unfinished text fields now live with the parent draft and survive view changes. Role-vault v7 and demo recovery v2 retain bounded, exact pending input separately from sealed attachment metadata; older backups remain readable. Role autosave includes these changes, later receipts/notes/submission checkpoints preserve v7, and functional updates keep attachment addition plus field clearing from overwriting each other. A restored pending field blocks sealing immediately until the user adds or clears it. Original file bytes and hashing progress remain outside backups.

The production web build/typecheck passed. All **22 web test files / 93 tests** passed in 53.95 seconds, including new strict-input, encryption and v7 receipt-preservation cases. The focused browser run passed all **four desktop/mobile cases in 1.1 minutes**: unfinished role fields survive IndexedDB, downloaded-file and isolated-context recovery, then can be completed/added; the demo restores its pending fields, clears them, seals and verifies the original attachment as vendor. No wallet is used by these tests. The first typecheck identified an exact-optional-property mismatch in the controlled editor props; its types were corrected before the successful build.

See [ADR-0019](adr/0019-pending-attachment-drafts.md) for schema and recovery limits. The preceding complete root validation remains the 160-test run for the finalization checkpoint change; this section does not claim a new root test total.

## Encrypted SDK finalization checkpoints — 2026-09-09

`npm run validate` passed all six workspace builds and typechecks, then **33 test files / 160 tests**: shared 12, contract 13, API 21, ciphertext service 14, integration 9 and web 91. The complete web suite passed in 52.38 seconds, including the expanded role-action crypto/checkpoint cases. This consolidates the shared replay, worker, recovery and finalization changes together.

Role-vault v6 retains the SDK's returned block height and local capture time on the exact identifier/circuit journal entry. Legacy entries remain unknown, repeated same-height capture preserves the first timestamp, and conflicting/malformed receipts fail validation. Report writes await encrypted receipt persistence before follow-up reads; deployment saves address and receipt together. Save failures retain the updated vault in memory for export and explicitly warn against resubmission. Restored receipt text is labelled as a local claim and makes no automatic public request or retry decision.

The first focused component run passed 20 of 22 tests; two existing role-action tests exceeded their five-second budgets after their mocks were corrected to perform the pre-wallet checkpoint and the new post-finalization encryption. Their budgets now allow 15 seconds for the expanded crypto path; no assertions or production crypto settings were removed. Browser regression passed **22 desktop/mobile cases in 1.7 minutes** with CI's two-worker setting, covering v2/v5/v6 file and IndexedDB journal inspection, actual worker replay, storage, notes and drafts. This is a selected regression run; the preceding full browser run remains 60 cases at `fed02bb`.

The evidence uses mocked role providers for actual SDK-success/checkpoint failure ordering and synthetic encrypted browser backups for fresh inspection. It does not establish native Lace operation or independent finality from saved metadata. Missing SDK receipts are never interpreted as transaction failure. See [ADR-0018](adr/0018-saved-sdk-finalization.md) for migration and crash-window limits.

## Browser worker report-effect reconciliation — 2026-09-09

The full `CI=true npm run test:e2e` run passed all **60 desktop/mobile cases in 3.3 minutes**, using two workers and no exclusions or retries. This includes the four new worker/journal cases alongside all prior recovery, storage, bootstrap and disclosure journeys.

Both role journals now offer an explicit report-effects check for entries with saved report intent. Public metadata goes to a terminable worker, which requires successful finalized observation, discovers the predecessor, checks target/history/RPC consistency and replays the actual raw transaction through the shared ledger SDK. A result requires the saved program and exactly the saved changed report. Cancellation, identity replacement, unmount and a 90-second overall deadline terminate the worker; stale callbacks cannot restore a result. Results remain ephemeral and do not authorize retry.

The first production browser run failed all four new cases because bundling retained the ledger deserializer without initializing its WASM. Chunk separation alone did not fix it. An explicit dynamic ledger import before the replay module resolved the error, and the targeted run passed all four desktop/mobile cases in 44.2 seconds. These tests execute the emitted worker and actual SDK VM with routed captured public evidence. They reproduce RETEST_PASSED → PAYOUT_AUTHORIZED and reject a wrong report; the encrypted-journal UI independently rejects a different program and supports cancellation. The historical headless report is not a canonical browser-authored disclosure, so no positive native-role-backup recovery is claimed.

The production web build/typecheck passed. The existing web suite passed 21 files / 86 tests, and the new component suite separately passed 1 file / 3 tests for explicit public-only input, timeout, cancellation, stale workers, identity replacement, unmount and clearing an earlier successful result on failure. Declaring the already-installed ledger 8.1.0 dependency directly changed only its workspace manifest/lock entry; npm reported zero vulnerabilities. This is not a new full-root validation run or a live network transaction. See [the investigation](transaction-content-investigation.md#browser-recovery-journal-check) for retrieval bounds, cost-model assumptions, source-trust limits and the outstanding native Lace drill.

## Shared API replay core without direct Node dependencies — 2026-09-09

Raw transaction inspection and report replay now use exported API modules, with integration re-exports retaining the existing collector interfaces. The shared implementation uses Uint8Array/hex helpers and SDK serialization to compare the complete data state while holding other contract container fields fixed. It compares generated report fields explicitly and no longer imports `node:util` or uses Node Buffer. The affected CLI scripts now build the API dependency before integration.

API and integration builds passed. All 21 API tests and 9 integration tests passed. The historical six-call replay and its wrong-state/subject/status cases exercise the new shared implementation; an additional case removes the Buffer global and still identifies the payout-authorization report transition. The updated `preprod:replay-transactions` command also rebuilt the API and replayed all six calls successfully against newly retrieved Preprod states, without rewriting fixtures or submitting a transaction. These checks establish the shared core's behavior under Node and the removal of its direct Node-only helpers. Actual browser/worker replay, bounded retrieval/orchestration in the UI and recovery decisions remain unverified and unfinished.

## Bounded predecessor discovery and replay — 2026-09-09

The API now exposes a browser-compatible, bounded WebSocket history scan from a known deployment height. It validates contract/action/transaction metadata, requires a deployment at the start, refuses same-block or decreasing histories and non-success results, and returns the adjacent source-reported action before the exact target identifier. Timeout, explicit cancellation, malformed data and action limits fail without a guessed result; the scan releases its socket/subscription.

An initial probe used the HTTP query's transaction offset type for the subscription and was rejected; the installed SDK schema confirms the subscription requires a block offset. The corrected live scan returned all seven historical contract actions. The packaged `preprod:discover-replay` command then used the actual new API, obtained the deployment height from the target's deployment relationship, discovered submitRetest as the predecessor, fetched its state by hash and replayed authorizePayout successfully. [The evidence](evidence/preprod-discovered-replay.json) records the seven-event scan and report transition at `2026-09-09T06:45:46.254Z`.

API and integration builds passed. All API tests passed (3 files / 21 tests), including actual local WebSocket handshake/stream tests for predecessor selection, foreign/incomplete/same-block/unsuccessful history, action limits, deadline and cancellation. All integration tests passed (3 files / 8 tests), retaining raw-byte and SDK replay coverage. The history scan uses no wallet; the live command submitted no transaction. It still trusts indexer history completeness/order and does not independently authenticate inclusion, handle same-block/partial/multiple actions or expose a finished browser recovery workflow.

## SDK transcript replay against historical report states — 2026-09-09

The new replay utility runs hash/identifier-bound raw calls through the actual ledger SDK VM, compares the complete resulting contract data state with the indexer-supplied post-state, and projects changed reports through the generated VulnSeal schema. The collector replayed all six historical calls successfully, identifying one changed report each and the expected absent → COMMITTED → TRIAGED → ACCEPTED → PATCH_READY → RETEST_PASSED → PAYOUT_AUTHORIZED chain. Historical states and results are stored in [the replay fixture](evidence/preprod-transcript-replay.json).

Initial probes exposed two integration assumptions: an empty block-offset query did not return the most recent earlier action, and ledger/onchain-runtime WASM state classes were not interchangeable. Using known transaction offsets and the encoded-state bridge resolved those issues. The indexer returned null segments on SUCCESS; the installed official schema/provider confirms segment details describe partial success and maps SUCCESS to SucceedEntirely. The utility accepts null segments only after checking SUCCESS, and rejects partial/failed status or ambiguous/failed supplied target segments.

The integration build passed; all three integration test files / eight tests passed in 2.71 seconds. New offline tests execute all six genuine transcripts, assert exact changed report identities/statuses and increasing sequence values, and reject incorrect pre/post states, wrong contract/circuit, failed/partial status and missing/ambiguous target entries in a supplied segment list. No network transaction was submitted.

This is a conditional historical VM replay, not proof/signature verification, authenticated inclusion, complete contract/token-state validation, general previous-action discovery or a browser recovery decision. The captured chain does not cover reject/close/failed-retest or multiple/partial calls. See [the investigation](transaction-content-investigation.md) for the precise boundary and remaining work.

## Raw transaction content investigation and fixtures — 2026-09-09

The new read-only integration collector retrieved seven historical VulnSeal contract transactions from the official Preprod indexer, checked each against retained transaction hashes, deserialized them with the actual protocol SDK, and recomputed both hashes and identifiers. All seven passed; the constructor had no call entry and the six remaining transactions each had the expected call address/circuit. Public raw bytes and decoded call projections are retained in [the fixture](evidence/preprod-raw-transactions.json), with findings and remaining report-binding work in [the investigation](transaction-content-investigation.md).

The integration build passed, and its two test files / six tests passed in 928 ms. The new offline cases decode every captured transaction and reject wrong identifiers, wrong hashes, changed bytes and malformed/excessive input. The packaged `npm run preprod:inspect-transactions -w @vulnseal/integration` command also passed against all seven historical transactions without rewriting the fixture. This evidence supports SDK byte/hash/identifier compatibility; it does not verify proofs/signatures or report effects, add a browser report verifier, or establish coverage of absent reject/close/failed-retest network branches. No transaction was submitted.

## Consolidated recovery release checks — 2026-09-09

At runtime commit `fa6fe57`, `npm run validate` passed all six workspace builds and typechecks, followed by 29 test files / 147 tests. This consolidated run includes the startup export, contextual submission journal, finalized deployment-address checkpoint and indexer contract-action comparison changes together. It ran on Windows with Node 24.14.1 and npm 11.11.0.

| Workspace | Passing files | Passing tests |
| --- | ---: | ---: |
| shared | 1 | 12 |
| contract | 1 | 13 |
| api | 2 | 18 |
| cipherstore | 3 | 14 |
| integration | 1 | 4 |
| web | 21 | 86 |

`npm run audit:prod` reported 0 vulnerabilities. This run rebuilt dependency-ordered workspace artifacts using the installed dependencies and existing generated Compact artifacts/keys. It was not a fresh dependency installation, new Compact compilation/key generation, GitHub-hosted CI execution, or native Lace ceremony.

The subsequent full `CI=true npm run test:e2e` run passed all 56 desktop/mobile Chrome cases in 3.0 minutes with 2 workers. The suite rebuilt the production web app, used the local ciphertext service, and covered all current browser journeys together, including backup export under failed WASM loading, v5 journal inspection, contract-action mismatch reporting, drafts/notes, workspace switching, attachment checks and handoff recovery. No retries or test exclusions were needed for this run. Network transaction scenarios in these browser tests remain fixtures/mocks; a passing suite does not establish native-wallet interoperability or production hosting readiness.

## Indexer-reported contract and circuit comparison — 2026-09-09

Transaction status checks now query contract action types, addresses and call entry points, then compare them with local journal contract/circuit intent. Results distinguish one matching action, mismatches, ambiguous multiple matches, absent metadata and unknown intent. They list the source-reported actions without automatically installing a deployment address or claiming that a report was affected. Failed transaction status is not promoted to success by a matching action.

The observer suite passed all 8 tests, including call/deploy/update parsing, case normalization, different contracts/circuits, ambiguous and absent action data, malformed responses and existing finality checks. The actual application observer was also run against the official Preprod indexer and RPC at `2026-09-09T06:18:13.419Z`. It observed the historical transaction as finalized SUCCESS at block 2371914, with one `authorizePayout` call at contract `83c5aa340bd149b447c873fc2eecc4a9dadd183e5b26f9c3784e4c9acdaba9eb`; the finalized head was 2470340. The complete observation and trust scope are retained in [the evidence file](evidence/preprod-contract-action-observation.json). This was read-only; no new transaction was submitted and no payment transfer is claimed.

The production build/typecheck and `CI=true npm run test:e2e -- e2e/recovery-journal.spec.ts e2e/role-storage.spec.ts` passed all 12 desktop/mobile cases in 1.1 minutes. Browser tests include a matching deployment action, a subsequent wrong-contract response that replaces the prior match, explicit clearing, legacy/v5 wallet-free inspection and existing encrypted storage recovery. Browser indexer responses are fixtures; the separate observer execution above is the live network evidence.

Contract/circuit comparison trusts indexer metadata and RPC finality. It does not authenticate raw transaction contents or prove report-specific effects, complete command arguments, or retry safety. Those requirements remain open.

## Durable deployment address before follow-up reads — 2026-09-09

Role deployment now awaits an encrypted checkpoint containing the returned contract address before session attachment/public reads. Previously the address relied on the routine 400 ms autosave debounce while follow-up network work had already begun. The finalized receipt remains visible; a failed address write retains the updated vault in memory, opens the backup form, keeps the saved gate false and explicitly warns that deployment finalized and must not be repeated. Storage callback wording is now neutral about broadcast because it serves both pre-wallet and post-deployment checkpoints.

`npm run build -w @vulnseal/web` passed including TypeScript checking and production asset generation. The focused deployment, submission-journal and storage component suites passed all 3 files / 5 tests in 16.99 seconds. New cases decrypt the pre-wallet journal, require the encrypted address to be present before the mocked follow-up attachment, inject a subsequent indexer failure, and separately inject an address-save failure. The latter preserves the prior encrypted identifier journal, does not attach, retains the live address/receipt, and exports a decryptable file with the address and identifier.

These tests use mocked network/session and IndexedDB adapters with real backup encryption. They do not establish native Lace deployment recovery, crash safety before the address checkpoint completes, or durable finalized receipt history. Existing transaction-identifier reconciliation is still needed if the page closes before that checkpoint.

## Local operation/report context in submission recovery — 2026-09-09

New role submissions persist their circuit name and report identifier alongside the pre-wallet transaction identifier. Deployment uses a null report identifier. Payload version 5 retains drafts, working notes and prior entries; legacy entries migrate with explicit unknown intent. Strict validation rejects foreign report identifiers, role-inappropriate circuits, duplicate transaction identifiers, and additional metadata fields. The workspace and wallet-free inspector distinguish locally recorded intent from observed public transaction status. See [ADR 0017](adr/0017-submission-intent-context.md).

The initial focused checks found a cross-realm byte-array mismatch in the newly shared report submission path. Normalizing the generated-circuit inputs with `Uint8Array.from` fixed it. The first full web run then passed 81 tests and identified one existing assertion still expecting payload version 4. Updating that assertion to version 5 and adding checks for persisted/restored intent produced a passing full web run: 20 files / 82 tests in 44.46 seconds. Component tests decrypt the saved checkpoint before a simulated wallet failure, verify report intent survives restoration, reject a late callback without active intent, and prevent the simulated broadcast when storage fails. These use mocked sessions/storage, not native Lace.

Production browser checks for recovery journals, browser storage, drafts and notes passed 16 desktop/mobile cases in 1.4 minutes with 2 CI workers. These include both v2 and v5 journals opened from a file and real IndexedDB without wallet or network access; only an explicit transaction check sends a public request. This browser run preceded the byte-array normalization; the full component run above includes that fix.

After the final code fix, a rebuilt/typechecked production app passed all 12 recovery-journal and bootstrap desktop/mobile cases in 1.0 minute, including encrypted export while WASM remains blocked.

These labels do not authenticate actual transaction effects, preserve complete command arguments or private transition history, or establish safe retry. Those reconciliation requirements remain open.

## Encrypted backup export during startup failure — 2026-09-09

The root error screen now reuses the browser-copy catalog in export-only mode. Its React/storage imports do not require the Midnight SDK, wallet connection or decryption password. Deletion controls are available only when the normal workspace supplies its deletion callback. Downloads retain the stored ciphertext and existing password, with the existing revision check before export.

`npm run test:run -w @vulnseal/web -- src/AppBoundary.test.tsx` passed (1 test). `CI=true npm run test:e2e -- e2e/bootstrap.spec.ts e2e/role-storage.spec.ts` rebuilt/typechecked the production web app and passed 16 desktop/mobile Chrome cases in 1.1 minutes with 2 workers. At both app entries, actual WASM requests remain blocked while the recovery catalog downloads a file; the test compares that file byte-for-byte with the previously saved real IndexedDB ciphertext and verifies deletion controls are absent. Removing the fault and reloading then permits password unlock of the original identity. Existing catalog deletion, separate-context restore, concurrent revision and journal recovery cases also passed.

This is recovery of previously persisted role copies, not unsaved state recovery or a guarantee of offline availability. It still needs the lightweight bootstrap to load and browser storage to be readable. No live Lace transaction or physical-device recovery drill was performed in this increment.

## Application startup and render failure recovery — 2026-09-09

The entry point now renders a lightweight React loading screen before dynamically loading the browser globals, Midnight network module and selected app/role entry. A root error boundary handles rejected module loading and descendant render failures with generic recovery guidance and explicit reload. It does not render exception contents or clear browser storage. The HTML root also carries loading/recovery instructions, including a paragraph for JavaScript-disabled browsers.

The production build/typecheck and the error-boundary component test passed. Initial bootstrap E2E checks passed the six delayed/failed WASM cases but could not locate the bare `noscript` text in the two JavaScript-disabled cases; a screenshot showed the text outside the main content. Moving it into a paragraph within the main fallback improved its placement and made all 8 bootstrap cases pass on desktop/mobile Chrome in 35.2 seconds. Those cases delay actual WASM loading, abort it at both app entries, explicitly reload after removing the fault and unlock a previously persisted real IndexedDB role copy with its password. No live wallet or contract transaction is involved.

The full `CI=true npm run test:e2e` run passed all 54 desktop/mobile cases in 2.9 minutes with 2 workers, covering the shared entry-point change across all existing browser journeys.

After refining the recovery text to state what this screen does (rather than guarantee the state of every saved copy), the component check passed again and a rebuilt app passed all 8 bootstrap cases in 36.3 seconds.

This boundary does not recover unsaved React state or establish total offline availability. If the initial bootstrap script itself cannot load, only the static HTML guidance is available. Existing operational handlers remain responsible for async/event-handler failures; this boundary covers module-loading and rendering failures, not every possible exception.

## Bounded ciphertext response reading — 2026-09-09

The client now independently enforces the service's 5 MiB envelope limit. PUT rejects excessive UTF-8 byte length before digest work/fetch. GET incrementally reads into a bounded growable byte buffer and cancels excess input without trusting `Content-Length`; decoding rejects malformed UTF-8 and preserves BOM/multibyte bytes before digest validation. Unneeded PUT/error response bodies are cancelled. The existing request deadline covers the streamed body read.

The API build and 18 API tests passed, including exact-limit input, excessive/multibyte uploads without fetch, oversize streaming with a misleading length header, cancellation/unlocking of the reader, malformed UTF-8, digest mismatch, split UTF-8/BOM round-trip and the existing body-read timeout. The web suite passed all 19 files / 77 tests. Production browser testing (`e2e/cipherstore-timeout.spec.ts` and `e2e/vulnseal.spec.ts`) passed all 14 desktop/mobile cases in 1.2 minutes, including a 5 MiB + 1 response that falls back to the authenticated local ciphertext and leaves vendor review usable.

After the final BOM-preservation adjustment, the API build/tests passed again, and a rebuilt production app passed both targeted oversized-response browser cases in 48.6 seconds including startup/teardown.

The stream unit checks establish client byte limits and cancellation. The browser fallback case establishes integrated recovery from an oversized invalid response; fallback alone would not distinguish size refusal from digest refusal. No whole-process memory ceiling, decompression-bomb benchmark or production storage-server compromise drill is claimed.

## Consolidated release gate and ciphertext request deadlines — 2026-09-09

On Windows with Node 24.14.1 and npm 11.11.0, the initial consolidated `npm run validate` passed all six workspace builds/typechecks and 27 files / 132 tests. `npm run audit:prod` reported 0 production dependency vulnerabilities. The first full E2E run with `CI=true` (2 workers) passed 41 of 42 cases; desktop handoff exceeded the 5-second sealing assertion while its PUT had no captured response. The recurrence at two workers contradicts treating worker limits alone as a verified remedy. The trace identifies an unfinished request, not its underlying cause.

Review found that `CipherstoreClient` had no request deadline. PUT and GET now use an AbortController with a 20-second default; the GET deadline includes reading the response body. Timeout errors retain uncertainty about whether an upload reached storage and explain recovery without automatic retry. Successful/error completion clears the timer. The handoff sealing assertion now allows 25 seconds for the network operation to settle, while its other assertions retain their existing timeout.

After that change, `npm run validate` again exited 0: all six builds/typechecks and 27 files / 135 tests passed. Added API cases cover aborted PUT, stalled GET response body, no retry, timer cleanup and invalid timeout settings. The new production browser timeout case holds a PUT through the real 20-second deadline and checks that the UI shows recovery guidance, no sealed receipt appears and the draft remains available for review.

The final full `CI=true npm run test:e2e` run exited 0 with all 44 desktop/mobile Chrome cases passing in 3.5 minutes, using 2 workers and fresh service startup. Both actual client-deadline cases passed (22.7 and 22.9 seconds including page setup). No automatic retries were enabled. The longer handoff assertion allows the bounded network operation to finish; this result is not proof that the underlying upload latency was fixed or that the previous 5-second target is met.

These are local checks with existing installed dependencies/generated Compact artifacts. They do not establish fresh GitHub Actions execution, native Lace operation, production load performance or the root cause of the initial upload delay. Audit results cover production dependency advisories, not all source risks.

## Browser storage visibility and quota recovery — 2026-09-09

The encrypted-copy section now exposes timestamped origin-wide usage/quota estimates and browser-reported persistent/best-effort/unknown retention. It reads status automatically, but calls `persist()` only from the explicit request button. Missing capabilities, partial failures and denial do not become claims of protected storage. The panel never reads or decrypts a role copy. Quota errors from database opening or writes provide backup-first recovery guidance; write request errors are captured before transaction error propagation.

The storage-health and local-storage component selection passed 5 tests in 2 files, and the web typecheck passed. Coverage includes no automatic retention request, denial followed by a later grant, request rejection without retry, partial browser API failure, invalid estimates, and existing persistence/save-gate behavior.

`npm run test:e2e -- e2e/storage-health.spec.ts e2e/role-storage.spec.ts` rebuilt/typechecked the production web app and passed all 10 desktop/mobile Chrome cases in 46.8 seconds. The health case uses native StorageManager estimates/status and counts persistence calls; no request occurs before an explicit click. It permits either browser denial or grant and does not establish that persistence was granted on a physical device. The IndexedDB primitive case injects synchronous quota exceptions and an asynchronous request error with the quota-error shape (backed by a real duplicate-key transaction abort). Both produce the new recovery message while leaving the previous row/revision/ciphertext intact. Existing encrypted-copy, journal and catalog recovery journeys also passed.

The quota drill does not fill an actual disk or exhaust a browser's real quota. Browser estimates cover the entire origin and do not reserve space. Retention grants do not protect against user deletion, device loss or all storage failures; physical storage-pressure and eviction drills remain open.

## Locking and switching role workspaces — 2026-09-09

The role entry point can lock a saved active workspace and return to the encrypted-copy picker in the same tab. Locking remounts the active role tree, stops its autosave writer and clears the old view/password fields. Unsaved vaults and active workflow operations cannot lock. Loaded receiving keys require acknowledgment of their separate retained backup. See [ADR-0016](adr/0016-role-workspace-locking.md).

The web typecheck passed. `RoleWorkspace.test.tsx` passed 7 cases, including the saved-vault gate, autosave stop on lock, fresh password fields and receiving-key acknowledgment. The journal/storage/autosave selection passed 6 cases across 3 files, including a lock control that remains disabled during the pre-wallet submission flow. These component checks use mocked wallet/storage boundaries where described in their fixtures.

`npm run test:e2e -- e2e/role-switching.spec.ts e2e/role-notes.spec.ts e2e/roles.spec.ts` rebuilt/typechecked the production app and passed all 10 desktop/mobile Chrome cases in 1.2 minutes. The new journey creates two distinct undeployed vendor identities, stores both in real encrypted IndexedDB, locks/reopens each in the same tab, rejects wrong passwords, retains both catalog entries and verifies focus returns to the entry heading. Existing role backup, note recovery and no-wallet deployment gates passed alongside it.

This demonstrates local application switching, not native Lace switching across deployed programs, wallet authorization revocation, locking other tabs or forensic erasure of secret bytes.

## Private working notes per report — 2026-09-09

Role payload v4 retains editable text and tier selection for each saved report, while preserving older backups, drafts and submission journals. Switching reports no longer clears the shared text field. Offline workspaces now expose saved report contents and their notes; contract actions still require a verified session/current snapshot and saved vault. See [ADR-0015](adr/0015-private-report-notes.md).

The web typecheck passed. The initial full web suite passed 71 of 72 cases; the existing leave-warning case exceeded its 5-second test budget after adding encrypted note persistence. That case now has a 15-second overall budget, with assertion timeouts unchanged, and the affected `RoleWorkspace.test.tsx` rerun passed all 5 cases. Other checks in the full run covered v4 encrypted round-trip, duplicate/foreign/oversized/extra-field note rejection, journal checkpoints retaining v4 notes, and draft updates preserving the note collection.

`npm run test:e2e -- e2e/role-notes.spec.ts e2e/role-drafts.spec.ts e2e/role-storage.spec.ts` rebuilt/typechecked the production app and passed all 12 desktop/mobile Chrome cases in 1.2 minutes. The new case opens two synthetic saved reports offline, reads their private contents, edits distinct notes and tiers, switches back without losing text, authenticates the downloaded encrypted file and reopens the notes from real IndexedDB in a fresh tab. Existing draft and storage recovery cases passed alongside it.

Working notes are latest editable values, not an append-only history or proof of the rationale used by a past transaction. This increment does not establish native Lace operation, physical device recovery or a complete private audit trail.

## Encrypted role drafts and offline recovery — 2026-09-09

Role payload v3 includes one incomplete researcher draft and retains the submission journal. Legacy v1/v2 files still validate. Drafts preserve blank reproduction lines and whitespace; sealed reports retain canonical validation. File exports and opt-in encrypted browser copies carry the same draft. Explicit offline restore opens local material without Lace and requires a later verified connection before contract actions. See [ADR-0014](adr/0014-encrypted-role-drafts.md).

The final web suite passed 18 files / 71 tests (`npm run test:run -w @vulnseal/web`), and the web typecheck passed. Coverage includes incomplete-draft encryption/round-trip, strict schema and size/type rejection, failed ciphertext upload retaining an exportable draft, successful preparation clearing the draft, existing journal persistence, and cancellation of an older delayed autosave before a newer pre-wallet checkpoint. That last regression keeps the older prop mounted beyond the debounce and verifies that only the newer journal is persisted.

The initial 18-case browser selection passed 16 existing role/storage/attachment cases and failed the two new draft cases because their exact label selector omitted the reproduction field's inline help text. Correcting that test locator made both draft cases pass in 41.2 seconds including server startup/teardown; app timeouts were unchanged. After the delayed-save checkpoint fix, `npm run test:e2e -- e2e/role-drafts.spec.ts e2e/roles.spec.ts e2e/role-storage.spec.ts` rebuilt the production web app and passed all 16 desktop/mobile cases in 1.3 minutes. The draft cases recover exact unfinished text through real encrypted IndexedDB, a downloaded backup and a separate browser context, with no POST/PUT requests during those offline recovery journeys. This is browser-isolation evidence, not a physical cross-device or native-wallet ceremony.

Only the latest confirmed encrypted save is recoverable. Pending debounce/encryption/writes can be lost on termination. Decision/patch/retest notes, receiving keys, attachment bytes and unfinished attachment-editor inputs remain outside the draft.

## Role workspace leave protection — 2026-09-09

The separate role workspace installs a conditional `beforeunload` handler when ownership/report changes are not saved, an operation is active, private draft/transition text remains, or receiving keys are loaded. Inline notices identify text and keys excluded from role autosave. The handler is removed when no condition applies and on unmount. Receiving keys conservatively retain the warning even after key export; downloading a file cannot confirm its retention.

`npm run test:run -w @vulnseal/web -- src/RoleWorkspace.test.tsx` passed all 5 component cases, including unsaved identity → encrypted autosave, private notes added/cleared, draft retention across workspace tabs, and listener cleanup. `npm run test:e2e -- e2e/roles.spec.ts e2e/role-storage.spec.ts` rebuilt/typechecked the production web app and passed 14 desktop/mobile Chrome cases in 51.2 seconds. The new browser case dismissed a real before-unload dialog to retain the unsaved identity, then saved it to encrypted IndexedDB and closed without another dialog. Existing role-file, browser-copy and catalog recovery journeys passed alongside it.

This is best-effort accidental-navigation protection, not draft persistence. Browser suppression, process crashes and mobile application termination can bypass the warning. No native Lace transaction or physical mobile-device termination was exercised in this increment.

## Fresh workspace artifacts and release-gate review — 2026-09-09

The former `validate` order ran typechecks/tests before builds even though workspace exports resolve to `dist`. Removing all six workspace `dist` directories from their expected locations reproduced API TS2307 errors for missing contract/shared declarations. The original build directories were preserved in a temporary archive; generated Compact source artifacts and installed dependencies were retained. The workspace order now builds shared before contract/API/consumers, and `validate` builds first, then typechecks and tests current artifacts. CI and quick-start instructions follow that order.

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Fresh dist validation | `npm run validate` with no workspace `dist` present initially | Exit 0; six workspaces rebuilt/typechecked; 26 test files / 122 tests passed |
| Production dependency audit | `npm audit --omit=dev --json` | Exit 0; 0 reported vulnerabilities |
| Local browser proof-asset inventory | Rebuilt `web/dist/keys` and `web/dist/zkir` | 8 prover/verifier pairs and 8 ZKIR/BZKIR pairs present from existing generated Compact artifacts |
| Initial full browser run | `npm run test:e2e`, automatic 14 workers | Exit 1; 28 passed, 4 failed waiting 5 seconds for sealing; traces showed PUT requests with no captured response, not a definitive server error |
| Final full browser run | `npm run test:e2e`, bounded 4 workers | Exit 0; all 32 passed in 1.7 minutes; assertions and timeouts unchanged |

Browser concurrency is now four locally and two in CI to bound concurrent WASM/cryptography workloads. The successful run does not establish the root cause of every high-concurrency stall or constitute production load testing. This audit proves a build with absent workspace dist artifacts, not a fresh dependency installation, fresh proving-key generation, native wallet ceremony or GitHub-hosted CI execution. Prior green local runs alone did not establish clean-build readiness. Publication and live native-wallet release gates remain open.

## Cipherstore writer exclusion — 2026-09-09

The CLI now leases its canonical data directory before listening. Backup creation leases the source and restoration leases its fresh destination. SIGINT/SIGTERM stops accepting connections, waits for server close and remaining request/file operations, then releases the lease. Abandoned locks require operator inspection; there is no automatic stale-lock takeover.

The cipherstore build passed and its suite passed 3 files / 14 tests. A second actual Node process was rejected while the parent held the directory lease and acquired it after release; backup creation was also refused while locked. Changed owner tokens prevented lock removal. The final server test rerun passed 9 cases, including a drain that remains pending until an in-flight upload body completes. Production desktop/mobile guided disclosure passed 2 E2E cases in 35.4 seconds using the leased service CLI and a fresh temporary data directory. Native OS graceful-signal delivery and forced-crash recovery are not established by these tests; the handler ordering is implemented, while the drain primitive and cooperative exclusion are independently exercised. Library embedders must explicitly acquire the lease.

## Cipherstore backup and restoration — 2026-09-09

The ciphertext service now has `create`, `verify` and `restore` CLI operations for a stopped writer. Destinations must be new and outside the source tree; existing stores are never merged or overwritten. Manifest verification covers exact inventory, digest, size and encrypted-envelope shape. The writer must remain stopped; no live-snapshot claim is made.

The cipherstore TypeScript build passed, followed by 2 files / 12 tests. The new drill uploads genuine AES-GCM ciphertext through HTTP, stops the service, creates/verifies/restores the backup, starts the restored store, checks readiness, retrieves the same content and authenticates/decrypts it with the original key. Negative cases reject corruption before destination creation, manifest traversal, unlisted files, nested destinations and overwriting an existing restored directory. Source and restored bytes remain intact.

The compiled CLI independently completed create/verify/restore for a synthetic envelope at `2026-09-09T04:30:22.285Z`, with byte equality confirmed. Counts are recorded in [cipherstore-backup-drill.json](evidence/cipherstore-backup-drill.json); no private paths, keys or ciphertext payloads are included. This is a local temporary-directory drill, not physical off-device or production-volume evidence. See [the operator guide](cipherstore-operations.md).

## Cipherstore storage readiness — 2026-09-09

The service now exposes `/readyz` independently of `/healthz`. It checks aggregate quota headroom and exercises actual write, flush, hard-link publication, read-back and cleanup in the configured directory. Simultaneous probes share one in-flight operation. Full quota or inaccessible storage returns 503 without exposing paths; liveness and existing reads remain available at capacity.

The cipherstore suite passed 9 tests and its TypeScript build passed. The new real-filesystem/HTTP assertions cover concurrent probes leaving no files, quota exhaustion after a successful upload, liveness/read continuity at capacity and non-directory storage failure. The production browser harness now waits on readiness; desktop/mobile guided disclosure checks passed 2 cases in 1.0 minute, including the web typecheck/build and real ciphertext service. This is a point-in-time disk probe, not an upload reservation or a deployed monitoring system. See [the operator guide](cipherstore-operations.md).

## Cipherstore capacity controls — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated validation | `npm run validate` | Exit 0; six workspace typechecks/builds; 24 files / 116 tests passed |
| Storage capacity | Cipherstore HTTP/filesystem suite, 8 cases total | Concurrent distinct uploads cannot exceed byte or blob limits; identical re-uploads and GET still work at capacity; recreating the server against existing files preserves quota accounting; active upload limit returns 503 and is released when the held body finishes |
| Client capacity messages | Two additional API client cases | HTTP 507 and 503 produce actionable messages and exactly one fetch each, with no automatic retry |
| Production disclosure journeys | `npm run test:e2e -- e2e/vulnseal.spec.ts` | Exit 0; 10 passed in 43.5 seconds; desktop/mobile upload, read, guided transitions and encrypted recovery against the real ciphertext service |

Quota tests use real temporary directories and HTTP connections. Restart coverage recreates the server within the test process; no cross-process reservation or replica coordination is claimed. The actual volume was not filled to trigger ENOSPC. Production hosting, retention policy, backup drills and monitoring remain open. See [cipherstore-operations.md](cipherstore-operations.md) for defaults and the one-writer-process requirement.

## Early journal preflight — 2026-09-09

The role workspace now rejects missing browser autosave before deployment wallet initialization or report transaction API calls. The later durable checkpoint remains in place for storage failures arising during proof/balancing. File recovery and read-only operations remain available without autosave.

The final workspace/journal component run passed 2 files / 4 tests, including an assertion that missing autosave invokes no `session.execute`. The production role browser suite passed 4 cases in 52.8 seconds with its typecheck/build: a restored file-only vendor receives the autosave instruction first, then reaches the actual missing-Lace error only after enabling autosave. No wallet was injected and no transaction submitted. The first-use role guide now includes autosave explicitly.

## Wallet-free recovery journal inspection — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Web checks | Web typecheck; full web test suite | Exit 0; 18 files / 67 tests passed |
| Pending display cancellation | Inspector component test | Clearing while decryption is pending suppresses its late result and clears the password |
| Affected production journeys | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/recovery-journal.spec.ts e2e/roles.spec.ts` | Exit 0; 6 passed in 56.6 seconds |
| Final inspector browser checks | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/recovery-journal.spec.ts` | Exit 0; final production typecheck/build included; 2 passed in 41.7 seconds after layout placement and all-request assertions |

The desktop/mobile checks use a synthetic deployed-role encrypted backup with a real-format public identifier and no injected Lace wallet. Wrong passwords reveal no journal; file and actual IndexedDB inspection create no network requests or role session; actor secrets are absent from visible text. Only the explicit status check makes a public indexer request (mocked as missing). Clearing removes its observation. The mobile screenshot in `docs/screenshots/*-offline-journal.png` was inspected. These checks do not establish native wallet recovery, authority correctness of a backup, or forensic memory erasure.

## Transaction observations and real identifier compatibility — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Web validation | Web typecheck and full web test suite | Exit 0; 17 files / 66 tests passed before the real-identifier correction |
| Initial affected browser journeys | `npm run test:e2e -- e2e/role-storage.spec.ts e2e/public-verifier.spec.ts` | Exit 0; 12 passed in 50.5 seconds; production web build included |
| Final real-format tests | Web tests for RoleJournal, role-recovery and transaction-verification | Exit 0; 3 files / 11 tests, including the actual 33-byte Preprod identifier through encrypted checkpoint recovery and lookup |
| Final production journal journeys | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/role-storage.spec.ts --grep "encrypted submission journal"` | Exit 0; final production typecheck/build included; 2 passed in 37.7 seconds; desktop/mobile restore, finalized observation and stale-result clearing after a missing lookup |
| Live official-service observation | Repository transaction verifier transpiled and invoked in Node, no request mocks | `2026-09-09T04:05:19.313Z`: recorded authorizePayout identifier matched SUCCESS at block 2371914; canonical block agreed with RPC; finalized head 2469011 |

The initial live probe exposed the 32-byte-only journal/lookup validation error before sending a request. Corrected code accepts the real 33-byte identifier and was rerun successfully; hashes remain 32 bytes. The live result is [preprod-transaction-observation.json](evidence/preprod-transaction-observation.json). This rechecks an existing transaction and broadcasts nothing. Browser screenshots in `docs/screenshots/*-transaction-check.png` show deterministic mocked block 100, not the live Preprod result; the mobile view was inspected. The observations trust indexer/RPC sources and do not establish circuit/report binding or safe retry. See [ADR-0013](adr/0013-transaction-observations.md).

## Encrypted submission checkpoint — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated validation | `npm run validate` | Exit 0; six workspace typechecks/builds; 22 files / 104 tests passed (web: 16 files / 60 tests) |
| Wallet boundary | Submission helper tests | Wallet call waits for checkpoint completion; failed persistence invokes no wallet submission; identifier/serialization failures remain before submission |
| Journal schema | Authenticated recovery tests | Version 2 round trip preserves encrypted identifiers; version 1 remains accepted; duplicate/malformed identifiers and extra outcome claims rejected |
| Workspace orchestration | Component test, mocked role session/storage, real backup crypto | Missing autosave and a storage failure prevent simulated broadcast; persisted ciphertext contains the identifier before the simulated finality error; fresh component restore recovers the journal |
| Production browser suite | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 30 passed in 1.6 minutes on desktop Chrome and Pixel 7 |
| Production journal recovery | Two of the browser cases | Synthetic version 2 file restored, encrypted into actual IndexedDB, original tab closed and fresh-tab unlock displays the same identifier with reconciliation labeling; no finality receipt fabricated |

The journal is a durable pre-submission intent record for the independent role workspace, not complete pending-transaction recovery. The combined demo does not register the checkpoint. No real wallet transaction was submitted by these checks. Automatic finality lookup, semantic retry protection and native Lace interruption drills remain open. The current mobile role-storage screenshot was visually inspected; see [ADR-0012](adr/0012-submission-journal.md).

## Submission uncertainty handling — 2026-09-09

The browser resolves a transaction identifier and serializes the transaction before invoking the wallet's submission method. Local failures therefore cannot occur after an otherwise successful broadcast in those two steps. A connector-call error becomes `SubmissionOutcomeUnknown`, retaining the identifier and cause without claiming network rejection or retrying. Both browser entries share this provider.

Web typecheck passed. The web suite passed 15 files / 56 tests before one additional provider-wiring assertion; the final targeted provider/submission run passed 2 files / 9 tests (57 distinct web tests across these runs). Tests cover no-identifier and serialization failures before the wallet call, identifier retention when the connector response fails, a single successful submission, and propagation through the actual browser provider with a mocked connector. The production web build was also run. These tests do not submit real transactions or establish native Lace behavior. Durable pending records and later SDK finality-wait error reconciliation remain incomplete.

## Browser-copy lifecycle validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Web checks | `npm run typecheck -w @vulnseal/web`; `npm run test:run -w @vulnseal/web` | Exit 0; 14 files / 52 tests; typecheck rerun after final save-gate change |
| Full production browser suite | `npm run test:e2e` | Exit 0; 28 passed in 1.3 minutes, before final deletion save-gate refinement |
| Final storage lifecycle checks | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/role-storage.spec.ts` | Exit 0; production web rebuilt; 6 passed in 41.5 seconds across desktop Chrome and Pixel 7 |
| Recovery drill | Production UI, real IndexedDB and downloaded encrypted file | Autosave stopped before management; deletion disabled without acknowledgment; encrypted file exported; selected copy deleted; live workspace retained but transaction backup gate reset; file restored in a separate browser context with matching program identity |
| Concurrent deletion safety | Repository storage module against real two-tab IndexedDB | Stale revision cannot delete a newer row; correct revision deletes it; an old writer cannot recreate the removed row |
| Visuals and hygiene | Mobile catalog screenshot inspected; `git diff --check`; conventional download name checked against `.gitignore` | No whitespace errors; encrypted device-export filename ignored; catalog screenshot in `docs/screenshots/*-copy-catalog.png` |

These checks establish file portability between isolated browser contexts on this machine, not a physical cross-device or native Lace ceremony. The catalog does not decrypt exports or guarantee forensic erasure after deletion. Active writers in other tabs discover removal on their next save. Pending-transaction recovery and quota management remain open.

## Encrypted browser autosave validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated checks | `npm run validate` | Exit 0; six workspace typechecks/builds; 20 test files / 96 tests passed (web: 14 files / 52 tests) |
| Serialized autosave | Three writer tests with real encryption | Ordered snapshots decrypt correctly; conflict stops queued writes; stopping before persistence prevents writes |
| Save gate and failure handling | Component test with mocked storage | Changed vault is marked saved only after persistence; write failure stops autosave without marking the newer vault saved |
| Production browser suite | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 26 passed in 1.3 minutes across desktop Chrome and Pixel 7 |
| Device recovery | Two production browser cases | Actual IndexedDB contains only metadata and encrypted envelope; original tab closed; wrong password rejected; fresh-tab unlock restores vendor identity and enables the saved-vault gate |
| Atomic revision checks | Two browser cases, repository storage module injected into test pages | Real IndexedDB across two tabs permits exactly one concurrent revision update; stale update and plaintext replacement fail; original ciphertext remains intact |
| Final storage browser checks | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/role-storage.spec.ts` | Exit 0; 4 passed in 35.9 seconds after error-copy and screenshot-position refinements |

The storage-module injection is confined to tests; production exposes no debug storage API. Screenshots are in `docs/screenshots/*-browser-storage.png`. These checks use no injected wallet and submit no network transactions. Native Lace recovery, pending-transaction recovery, draft persistence, quota management and deletion controls remain open. See [ADR-0011](adr/0011-encrypted-browser-autosave.md).

## Independent role workspace validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Final consolidated checks | `npm run validate` | Exit 0; all six workspaces typechecked/built; 18 test files / 92 tests passed (web: 12 files / 48 tests) |
| Role backup and invitation | Three cryptographic/schema tests | Fresh encrypted round trip; wrong password; second actor field, duplicate/foreign reports and private invitation fields rejected; only vendor identities permit pre-deployment backups |
| Network restoration | Four mocked-provider tests | Backup network and single identity passed to join; wrong researcher authority and ciphertext rejected; prepared but unsubmitted reports preserved |
| Role workspace components | Three tests with mocked network providers | Researcher join and two-report preparation/backup; backup required before submission; role-only controls; finalized receipt retained while stale/failed public reads block writes; private saved report readable after restore |
| Production browser suite | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 20 cases passed before two additional invitation cases |
| Final role browser cases | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/roles.spec.ts` | Exit 0; 4 passed in 37.8 seconds; desktop/mobile actual vendor identity export, closed-tab recovery, wrong-password rejection, backup-gated deployment, strict public invitation parsing and real missing-Lace failures; 22 distinct browser cases covered across these runs |

The final workspace component suite was rerun after adding the saved-report reader and post-finality stale-read assertions. Production role screenshots are in `docs/screenshots/*-roles.png`. Conventional vendor/researcher role-backup filenames are Git-ignored. No wallet was injected in these production browser checks, and no real network transaction was submitted. The component network operations are mocked; the separate API tests invoke generated circuits in a simulator. Native Lace multi-profile transaction verification, durable pending recovery, automatic persistence and full per-report histories remain outstanding. See [ADR-0010](adr/0010-independent-role-workspace.md) and the [workspace guide](role-workspace.md).

## Fixed-role API validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated checks | `npm run validate` | Exit 0; all six workspace typechecks/builds; 15 test files / 81 tests passed before the final alternative-lifecycle case |
| Final API tests | `npm run test:run -w @vulnseal/api` | Exit 0; 2 files / 10 tests, including 9 role-session/provider cases; total suite coverage across these runs is 82 tests |
| Two-actor simulator lifecycle | Generated Compact circuits through the real API witness wrapper | Fixed researcher/vendor sessions submit, triage, accept, patch, retest, authorize and close; rejected closure and failed-retest remediation also pass; each circuit receives its intended actor witness |
| Authority and concurrency failures | Included in API tests | Wrong role rejected before witness installation; wrong program/vendor/researcher and stale patch/preimage rejected; duplicate queued submission invokes one circuit; changed owner checked afresh; caller-array mutation cannot swap authority; queue releases after malformed input, provider failure and operation failure |
| Built package export | Node import of `@vulnseal/api/role-session` | Exit 0; `RoleSession.join` available from built package |

This work changes the API and adds a simulator-backed integration, not the browser's combined authority workflow. The simulator invokes generated circuits but produces no proofs, wallet signatures or real network finality. Existing browser E2E results remain historical; they were not rerun for this API-only change. See [ADR-0009](adr/0009-fixed-role-api-sessions.md) and the [API usage guide](role-session-api.md).

## Private disclosure exchange validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated validation | `npm run validate` | Exit 0; all six workspaces typechecked and built; 14 test files / 73 tests passed (web: 9 files / 38 tests) |
| Cryptographic exchange | Five handoff unit tests | Fresh encryption, intended-recipient round trip, wrong-recipient rejection, ciphertext/IV/wrapped-key tampering, fingerprint mismatch, private-field rejection, report/program binding, encrypted receiving-key recovery and wrong-password rejection |
| Production browser suite | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 18 passed, desktop Chrome and Pixel 7 |
| Separate recipient journey | Two of the 18 browser cases | Recipient creates and downloads its key backup/public key, closes the tab; researcher seals a report and exports only after confirming fingerprint; recipient restores its own key in an isolated context and reads the report with no injected wallet or actor-recovery file |
| Final browser tampering checks | `npm run test:e2e -- e2e/handoff.spec.ts` | Exit 0; 2 passed in 37.9 seconds; a changed package clears the previous report and fails authentication; key restore and disclosure decryption make no network requests |
| File hygiene and visuals | Git ignore checks; desktop/mobile handoff screenshots | Conventional private receiving-key backup and disclosure filenames ignored; public key files have an exact public allowlist; synthetic received report renders on both viewports |

The first consolidated run exposed a pre-existing flaky corruption test: modifying the final base64 character sometimes changed only unused padding bits, leaving decoded ciphertext unchanged. The test now changes actual leading data bits, and the shared decoder rejects noncanonical base64url spellings. The passing consolidated run above includes that fix and a dedicated padding-bit regression test. No AES-GCM authentication bypass was observed.

These are real browser cryptographic/file-exchange journeys using a guided report and real ciphertext service, not separate-role on-chain transactions. Recipient keys grant reading only. No network deployment, identity attestation or independent security audit is claimed. See [ADR-0008](adr/0008-recipient-bound-disclosure.md).

## Attachment authoring validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated validation | `npm run validate` | Exit 0; all workspace typechecks/builds; 65 tests passed before two additional race tests |
| Async editor checks | `npm run test:run -w @vulnseal/web -- src/AttachmentFields.test.tsx` | Exit 0; both tests passed: edits during hashing preserved, stale completion after unmount discarded; total suite coverage now 67 tests |
| Production browser suite | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 16 passed in 48.2 seconds on desktop Chrome and Pixel 7 |
| Attachment journey | Two of the 16 browser cases | Local hashing, duplicate rejection, manual size validation, add/remove, encrypted backup, original-tab closure, fresh-tab draft restore, real ciphertext PUT/decryption, mismatching and matching local-file checks |
| Final authoring check | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e -- e2e/attachments.spec.ts` | Exit 0; 2 passed in 32.4 seconds after the multiline input fix; Enter creates a new step and both steps survive draft recovery; final web typecheck/build included |

The upload assertions confirm the fixture's filename, digest and original contents are absent from the ciphertext request. Unit tests cover a known SHA-256 vector, metadata normalization, invalid sizes/digests and rejection of files over 32 MiB before reading. Only attachment metadata is backed up and sealed. Binary transfer and automatic persistence are not implemented, and these guided browser tests do not establish cross-user key exchange or native-wallet operation.

## Independent public lookup validation — 2026-09-09

| Check | Command / environment | Observed result |
| --- | --- | --- |
| Consolidated typecheck, tests, builds | `npm run validate` | Exit 0; six workspace typechecks/builds; 11 test files / 62 tests passed (web: 6 files / 28 tests) |
| Production browser journeys | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 14 passed in 49.6 seconds, desktop Chrome and Pixel 7 |
| Public state and negative cases | Six verifier unit tests | Real captured ledger deserialized; invalid address, missing contract, failed action, unfinalized block, RPC/indexer mismatch, incompatible schema and private/extra receipt fields rejected |
| Public browser journeys | Four of the 14 E2E cases | Fresh wallet-free share-link lookup, public receipt import, private recovery-file rejection, expected digest mismatch and stale-result clearing; indexer/RPC responses are deterministic mocks |
| Public receipt export | Network recovery component test with mocked providers | Download payload contains exactly the public receipt allowlist; restored actor secrets, plaintext, salt and key are absent |
| Final targeted checks | Web typecheck; network component test; public-verifier E2E | Exit 0; 4 component tests and 4 desktop/mobile public cases passed after export assertions and screenshot positioning were finalized |
| Live public browser lookup | Production Vite preview and desktop Chrome, no request mocks | Success at `2026-09-09T02:33:37.531Z`; no injected wallet or failed requests; contract block 2371914, RPC finalized head 2468094, `PAYOUT_AUTHORIZED` |

Live browser output is saved in [preprod-browser-public-lookup.json](evidence/preprod-browser-public-lookup.json), with a [live screenshot](screenshots/live-preprod-public-lookup.png). This confirms browser access to the official services as well as actual ledger decoding. It rechecks the existing contract; no transaction was submitted. The public verifier trusts its indexer/RPC sources and does not authenticate deployed code or prove funds transfer. See [ADR-0007](adr/0007-independent-public-lookup.md).

## Browser recovery validation — 2026-09-09

After adding explicit encrypted session backup/restore and local encrypted-copy fallback:

| Check | Command | Observed result |
| --- | --- | --- |
| Consolidated typecheck, tests, builds | `npm run validate` | Exit 0; six workspace typechecks/builds; 10 test files / 56 tests passed (web: 5 files / 22 tests) |
| Final production browser run | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 10 passed in 38.5 seconds, desktop Chrome and Pixel 7 |
| Recovery cryptography and bindings | Included in web tests | Authenticated round trip, fresh salt/IV, wrong password/tampering, fixed KDF parameters, incomplete draft recovery, report/program binding, authority/policy verification |
| Browser recovery against mocked network providers | Included in web tests | Wrong owner rejected without installing a session; stale backup reconciled to newer ledger state; recovered researcher authority used for a subsequent retest; ledger observations labeled separately from transaction evidence |
| Actual production browser recovery | Included in both viewport E2E cases | Encrypted file downloaded, original tab closed, wrong password rejected, fresh-tab restore completed, ciphertext GET blocked, report decrypted from the recovered encrypted copy, failed retest remediated through payout authorization |
| Recovery visuals and repository hygiene | Fresh desktop/mobile recovery screenshots, `git diff --check`, `git check-ignore vulnseal-recovery.json` | Recovery screen inspected; no whitespace errors; conventional backup filename ignored |

These results do not establish a real Lace restore ceremony or recover transactions interrupted before their results were captured. No new on-chain transaction was sent by this recovery work. See [ADR-0006](adr/0006-encrypted-browser-recovery.md).

## Follow-up validation — 2026-09-09

The current worktree fixes browser workflow correctness, random tab-local actor secrets, program policy/severity form binding, wallet network binding, post-finality read recovery, immutable storage races, and report/envelope validation.

| Check | Command | Observed result |
| --- | --- | --- |
| Consolidated checks before final wallet-provider additions | `npm run validate` | Exit 0; all six workspaces typechecked and built; 45 tests passed |
| Final web typecheck and tests | `npm run typecheck -w @vulnseal/web`, `npm run test:run -w @vulnseal/web` | Exit 0; 4 files / 15 tests passed, including four new wallet network/authorization cases |
| Current suite totals across those runs | Contract 13 + API 1 + cipherstore 5 + integration 4 + shared 11 + web 15 | 49 tests passed; mocked browser wallet/API cases are not live network transactions |
| Production browser journeys | `VULNSEAL_CAPTURE_VISUALS=1 npm run test:e2e` | Exit 0; 8 passed in 33.8 seconds; production Vite preview plus real ciphertext service; desktop Chrome and Pixel 7 |
| Dependency audit | `npm run audit:prod` | Exit 0; 0 vulnerabilities |
| Independent live Preprod re-verification | `npm run preprod:verify` | Exit 0 at `2026-09-09T02:00:53.710Z`; all 8 recorded identifiers successful; contract tip still `authorizePayout` at block 2371914; finalized head 2467767 |
| Visual checks | Four fresh production screenshots in `docs/screenshots` | Desktop/mobile landing and verifier inspected; wallet control available on mobile; local simulation labels visible |

The initial dev-server browser run had six passing cases and two 30-second cold-load timeouts, then stalled during Windows sandbox teardown. Its process was stopped; it is not counted as a successful suite. External font requests were removed, navigation scrolling made immediate, the full-journey timeout set to 60 seconds, and the production suite above completed successfully. CI now builds/serves the production UI and runs these journeys; the edited CI workflow has not yet run on GitHub.

The live Preprod check revalidated the existing deployment; it did not deploy this browser revision or execute new wallet transactions. Durable browser recovery, independent public lookup, and separate-user operation remain open in [readiness-audit.md](readiness-audit.md).

## Original baseline — 2026-09-02

Run date: 2026-09-02 on Windows/WSL2, Node `24.14.1`, npm `11.11.0`, Docker `29.5.3`.

| Check | Command | Exact result |
| --- | --- | --- |
| Full Compact compile/key generation | `VULNSEAL_ZKIR_BINARY=/tmp/.../zkir npm run compact` | Exit 0; 8 circuits; 8 prover + 8 verifier files generated |
| Static type checks | `npm run typecheck` | Exit 0 across contract, API, cipherstore, integration, shared, web |
| Contract simulator | `npm run test:run -w @vulnseal/contract` | 1 file, 13 tests passed |
| API unit | `npm run test:run -w @vulnseal/api` | 1 file, 1 test passed |
| Cipherstore unit | `npm run test:run -w @vulnseal/cipherstore` | 1 file, 2 tests passed |
| Shared privacy/crypto unit | `npm run test:run -w @vulnseal/shared` | 1 file, 8 tests passed |
| Preprod checkpoint security | `npm run test:run -w @vulnseal/integration` | 1 file, 4 tests passed: encrypted round trip, wrong password, address binding, tamper rejection |
| React/component/a11y | `npm run test:run -w @vulnseal/web` | 1 file, 5 tests passed |
| Consolidated deterministic validation | `npm run validate` | Exit 0; typecheck across 6 workspaces, 6 test files / 33 tests passed, 6 production builds passed |
| Browser E2E | `npm run test:e2e` | 2 passed: desktop Chrome and Pixel 7 |
| Real local Midnight lifecycle | `npm run test:integration` with local password | Exit 0; 7 finalized transactions; final `PAYOUT_AUTHORIZED` |
| Real Preprod Midnight lifecycle | `npm run preprod:lifecycle` with Git-ignored environment | Exit 0; NIGHT→DUST registration plus 7 successful contract transactions; contract `83c5aa34…a9eb`; final `PAYOUT_AUTHORIZED` |
| Independent Preprod verification | `npm run preprod:verify` | Exit 0; all 8 identifiers `SUCCESS`; latest contract action block 2371914; rerun finalized head 2372137 |
| Dependency audit (all) | `npm audit --json` | 0 vulnerabilities across 395 dependencies |
| Dependency audit (production) | `npm audit --omit=dev --json` | 0 vulnerabilities |
| Sensitive pattern scan | tracked files and `git log --all -p`, excluding lockfile noise | 0 literal seed/password/private-key hits; Preprod env and encrypted checkpoint confirmed ignored |
| Visual inspection | fresh Playwright screenshots + manual inspection | Desktop/mobile landing and verifier usable; audit pills no longer clip; guided/local evidence labeled |

No deterministic test in this table was skipped. Local lifecycle evidence remains explicitly labeled ephemeral. The separate Preprod run used the official proof server `8.1.0`, current public RPC/indexer, and a synthetic report; its public evidence is in [preprod-evidence.md](preprod-evidence.md).

The generated Compact sourcemaps reference compiler source files that are not emitted by the CLI, producing a harmless test warning. The production bundle includes large official Midnight WASM assets; those sizes are expected and are a future loading-performance optimization target.
