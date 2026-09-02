# Validation report

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
