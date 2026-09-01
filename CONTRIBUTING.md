# Contributing to VulnSeal

VulnSeal handles security-sensitive private inputs. Contributions must preserve the distinction between encryption, zero-knowledge proof, public ledger state, guided demos, and actual transactions.

## Development

1. Use Node `>=24.11.1` and npm; do not introduce another lockfile.
2. Install with `npm ci`.
3. Compile Compact with `npm run compact:skip-zk` for normal iteration and `npm run compact` for full key generation.
4. Run `npm run validate && npm run test:e2e && npm run audit:prod` before opening a change.
5. Never hand-edit `contract/src/managed`; regenerate it from `contract/src/vulnseal.compact`.

Use Conventional Commit messages. Add negative tests for authorization or state-machine changes and update `docs/claims-evidence.md` whenever a product claim changes.

## Security rules

- Never commit seeds, private keys, reports, salts, encryption keys, private-state databases, or proof request bodies.
- Do not log full ciphertext envelopes, witnesses, wallet objects, or raw provider errors that may contain secrets.
- Do not call simulator output a network transaction or call a digest a proof.
- Discuss vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).

By contributing, you agree that your contribution is licensed under Apache-2.0.
