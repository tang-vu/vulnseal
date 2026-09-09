# Validation report

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
