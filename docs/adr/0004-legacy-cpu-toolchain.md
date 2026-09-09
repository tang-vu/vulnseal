# ADR-0004: Official-source compatibility route for an older CPU

- Status: accepted for local and Preprod evidence
- Date: 2026-09-01

## Context

The official `example-bboard` and VulnSeal both compile with Compact `0.31.1 --skip-zk`, but the CLI-bundled ZKIR key generator exits with illegal instruction on the host Xeon E5-2678 v3. Official amd64 node/indexer images also exit `132`. This is a host instruction-set limitation, not a Compact syntax failure.

## Decision

Use only official code/images through two compatibility routes:

1. Build the `zkir` CLI from the official `midnight-ledger` tag `ledger-8.0.2` in WSL with Rust `1.96.0` (Rust `1.97.0` is incompatible with that source's `ethnum` layout), then run:

   ```bash
   export VULNSEAL_ZKIR_BINARY=/absolute/path/to/zkir
   npm run compact
   ```

   The script first asks Compact to emit managed TypeScript/ZKIR with `--skip-zk`, then runs `zkir compile-many` into the standard `keys` directory.

2. Install Docker ARM64 binfmt and run the exact official ARM manifests recorded in `infra/arm64-emulation.env`.

## Consequences

All eight prover/verifier pairs and every lifecycle proof are real. The same official ARM64 proof-server image under emulation produced the successful Preprod lifecycle. ARM emulation is substantially slower. Generated keys remain ignored because they are approximately 40 MB and reproducible. CI or a modern x86 host should use the ordinary official binaries.

The underlying compiler recreates its requested output directory. The repository wrapper now stages full compilation and archives the previous installed artifacts before replacement. When retained keys exist, `compact:skip-zk` instead compares fresh bindings/textual ZKIR in isolation and preserves the installed directory; it rejects a mismatch. Regenerate with the full command when sources change. The manual release-verification workflow uses full compilation from a clean checkout and does not depend on this older-CPU fallback.
