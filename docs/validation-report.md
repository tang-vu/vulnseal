# Validation report

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
