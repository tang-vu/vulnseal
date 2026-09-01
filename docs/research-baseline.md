# Research baseline

Recorded 2026-09-01 (Asia/Saigon). Versions and APIs were selected from current official sources, not model memory.

## Contest timing

The official [Midnight Buildathon page](https://midnight.network/hackathon/buildathon) lists Wave 1 as **August 27–September 16, 2026**. Work began on September 1, inside that period. The AKINDO event page is [Build Privacy-First Apps on Midnight](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG). No repository history was rewritten or backdated.

## Compatibility matrix

| Component | Pinned / observed | Source or evidence |
| --- | --- | --- |
| Node.js | `>=24.11.1`; tested `24.14.1` | `midnightntwrk/example-bboard` engine; local `node --version` |
| npm | tested `11.11.0` | local environment and `package-lock.json` |
| Compact CLI | `0.31.1` | installed official toolchain |
| Compact language | `0.23.0` | official compiler; `pragma language_version 0.23` |
| Midnight.js | `4.1.1` | current official `example-bboard` commit below |
| DApp connector API | `4.0.1` | current official `example-bboard` |
| Wallet SDK | `1.2.0` | current official `example-bboard` |
| Compact runtime | `0.16.0` | generated contract imports / current SDK |
| On-chain runtime v3 | `3.0.0` | direct root pin required to preserve `StateValue` class identity across SDK packages |
| Ledger v8 | `8.1.0` override | current official `example-zkloan` compatibility override |
| Proof server | `8.1.0` | official image; `/version` returned `8.1.0` |
| Standalone indexer | `4.3.3` | official current image used by example configuration |
| Midnight node | `1.0.0` | official image used by current local configuration |
| React / Vite | React `19.2.4`, Vite `8.0.14` resolved | project lockfile |

All project dependencies are locked by `package-lock.json`. Midnight packages use exact versions. Workspaces use npm only.

## Official reference points

- [Midnight documentation](https://docs.midnight.network/) — Compact, Midnight.js, wallet, networks, and local development.
- [Official GitHub organization](https://github.com/midnightntwrk) — source of all Midnight references.
- [example-bboard](https://github.com/midnightntwrk/example-bboard), inspected at `38bfac8c574abb0c5a96c9e076779716c3e88231` — primary provider, connector, and current full-stack pattern.
- [example-zkloan](https://github.com/midnightntwrk/example-zkloan), inspected at `5da98549ef62addb72e391332bbcf0bea51e4213` — current standalone stack and deterministic development wallet patterns.
- [midnight-js](https://github.com/midnightntwrk/midnight-js) — package implementation and provider behavior.
- [OpenZeppelin Compact contracts](https://github.com/OpenZeppelin/compact-contracts) — reviewed as a security-oriented Compact library reference; no unnecessary dependency was added.
- [Request for Startups](https://midnight.network/request-for-start-ups) — product alignment, specifically the Provable Bug Bounty Board opportunity.
- [Recent winning projects](https://midnight.network/blog/celebrating-seven-winners-from-mlh-x-midnight-july-hack) — evidence-first demos, scoped privacy claims, and product clarity.

The archived `example-counter` was not used as the foundation. Kapa MCP was not configured in the available environment, so work continued from official documentation and repositories.

## Environment verification

| Capability | Result |
| --- | --- |
| Windows / PowerShell | Available |
| WSL2 Ubuntu | Available; Compact compiler runs there |
| Docker Desktop / Compose | Available (`29.5.3` engine reported during build session) |
| Git LFS | Available |
| Official sample compile | `example-bboard` Compact source compiles with `--skip-zk`; bundled full key generation exits with illegal instruction on the host Xeon E5-2678 v3 |
| VulnSeal full keys | Success using the official ledger `ledger-8.0.2` ZKIR source built with Rust `1.96.0`; eight prover/verifier pairs generated |
| Official amd64 services | Exit `132` on this old CPU |
| Official ARM64 manifests | Node/indexer/proof server ran healthy under Docker/QEMU binfmt; used for real local evidence |

The fallback changes execution architecture, not cryptographic semantics: it uses official source and official multi-architecture images. It is slower and is documented in [ADR-0004](adr/0004-legacy-cpu-toolchain.md).

## Decisions grounded during research

1. One contract keeps report/program authorization and state invariants atomic.
2. Persistent, domain-separated hashes are used because they are supported by the selected Compact version.
3. `ownPublicKey()` is not used as authorization. Current secure examples explicitly warn that it does not establish application authorization by itself.
4. Browser encryption is Web Crypto AES-256-GCM with a random 96-bit IV and program-bound AAD; plaintext never crosses the ciphertext-store boundary.
5. Public ordering uses a monotonic contract sequence, not an invented block-time API.
6. The public result is a payout **authorization**, not escrow or settlement.
