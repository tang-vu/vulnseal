# Validation report

Run date: 2026-09-01 on Windows/WSL2, Node `24.14.1`, npm `11.11.0`, Docker `29.5.3`.

| Check | Command | Exact result |
| --- | --- | --- |
| Full Compact compile/key generation | `VULNSEAL_ZKIR_BINARY=/tmp/.../zkir npm run compact` | Exit 0; 8 circuits; 8 prover + 8 verifier files generated |
| Static type checks | `npm run typecheck` | Exit 0 across contract, API, cipherstore, integration, shared, web |
| Contract simulator | `npm run test:run -w @vulnseal/contract` | 1 file, 13 tests passed |
| API unit | `npm run test:run -w @vulnseal/api` | 1 file, 1 test passed |
| Cipherstore unit | `npm run test:run -w @vulnseal/cipherstore` | 1 file, 2 tests passed |
| Shared privacy/crypto unit | `npm run test:run -w @vulnseal/shared` | 1 file, 8 tests passed |
| React/component/a11y | `npm run test:run -w @vulnseal/web` | 1 file, 5 tests passed |
| All production builds | `npm run build` | Exit 0 across 6 workspaces; Vite production bundle succeeded |
| Browser E2E | `npm run test:e2e` | 2 passed: desktop Chrome and Pixel 7 |
| Real local Midnight lifecycle | `npm run test:integration` with local password | Exit 0; 7 finalized transactions; final `PAYOUT_AUTHORIZED` |
| Dependency audit (all) | `npm audit --json` | 0 vulnerabilities |
| Dependency audit (production) | `npm audit --omit=dev` | 0 vulnerabilities |
| Sensitive pattern scan | scoped `rg` patterns excluding dependencies/generated/private DB | No private key marker or local test password found; only expected redaction-key names |
| Visual inspection | fresh Playwright screenshots + manual inspection | Desktop/mobile landing and verifier usable; audit pills no longer clip; guided/local evidence labeled |

No test in this table was skipped. The local lifecycle used real proofs and real transactions on an ephemeral undeployed network. It is not Preprod evidence.

The generated Compact sourcemaps reference compiler source files that are not emitted by the CLI, producing a harmless test warning. The production bundle includes large official Midnight WASM assets; those sizes are expected and are a future loading-performance optimization target.
