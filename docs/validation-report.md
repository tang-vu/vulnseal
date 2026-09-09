# Validation report

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
