# Threat model

## Assets and trust boundaries

Primary assets are unreleased vulnerability content, reporter identity/contact data, report ownership secrets, program owner authority, encryption keys, salts, private retest evidence, and the integrity of workflow receipts. The browser/private-state provider, proof path, wallet, dependencies, ciphertext store, Midnight network/indexer, and public UI are separate trust boundaries.

## Threats, mitigations, and residual risk

| Threat actor / failure | Attack | Current mitigation | Residual risk / next control |
| --- | --- | --- | --- |
| Malicious researcher | Claims another report or rewrites its contents | Commitment recomputation, report-bound researcher key, no overwrite | Can submit false/noisy reports; validity is not proven; add rate economics later |
| Malicious program owner | Rejects valid work, misstates severity, withholds key/payment | Decisions and state transitions are attributable to program authority; original commitment remains fixed | Truthfulness and payment remain social/legal; Wave 2 disputes and escrow |
| Compromised ciphertext store | Reads, replaces, deletes, withholds, or correlates blobs | AES-GCM before upload; immutable SHA-256 address; digest validation | Availability, size/timing metadata, and traffic correlation; replicate/pad privately later |
| Metadata observer | Links wallet, timing, sizes, statuses, and pseudonyms | Report-specific derived researcher key; minimal public record | Network and behavioral correlation remains; batching/relays/padding later |
| Replay attacker | Reuses submission or payout data | Unique report map key; legal-edge state checks; payout receipt set; subject/domain binding | A semantically equivalent report with new salt is not detected |
| Front-runner | Copies a visible commitment/ciphertext digest first | Researcher authorization is derived from a private secret bound to commitment | Front-runner can cause nuisance if exact commitment public before submission; atomic proof submission and secret ownership prevent lifecycle capture |
| Report linkability | Correlates multiple reports to one researcher | Researcher key includes report commitment and program | Wallet-level and content metadata can link; use unlinkable submission transport later |
| Leaked browser storage | Steals plaintext, key, salt, or actor secret | No secrets in URLs/logs; encrypted provider store; secure randomness in app crypto | XSS, malicious extensions, device compromise; CSP, isolation, hardware-backed key options, explicit session wipe |
| Malicious/buggy witness | Supplies wrong subject or leaks inputs | Small typed witness module; circuit rechecks program/report/patch bindings; negative tests | Witness can expose data before circuit execution; audit and minimize witness surface |
| Accidental logging | Writes reports/secrets to console or evidence | Redaction utility/tests; ciphertext store has no request-body logs; integration writes allowlisted fields | Third-party wallet/proof logs may differ; structured logger allowlists and production log review |
| Dependency compromise | Alters crypto/provider/build code | Exact Midnight pins, lockfile, production audit, official sources, no invented crypto | npm supply chain and build images remain trusted; add provenance/SBOM/signature policy |
| Dishonest triage | Labels invalid/duplicate or assigns unfair tier | Decision digest and authorized public transition bind the record | Circuit cannot judge facts; mediator and signed evidence policy in Wave 2 |
| Unavailable proof server | Blocks submission/transition | UI has explicit offline/failure state; local services are health-checkable | No liveness guarantee; redundant proof infrastructure and retry queue later |
| Unavailable indexer | Public UI becomes stale or unavailable | Direct health checks and error states; node remains source of truth | Verifier availability; independent indexers later |
| Secret theft | Attacker executes authorized transition | Domain/subject binding limits blast radius | Knowledge authorization cannot distinguish thief; rotation/recovery/multisig policy later |
| Initialization hijack | Attacker becomes owner | Owner key is set only in constructor from deployer's private witness; no reinitializer | Deployment UI and operators must verify the expected contract/address |
| Wrong patch/retest binding | Reuses evidence across reports or fixes | Circuits assert report ID and exact current patch commitment | Evidence content can still be dishonest; independent verification/dispute later |

## Witness review

The [recipient disclosure exchange](adr/0008-recipient-bound-disclosure.md) uses a separate receiving key and excludes contract actor secrets. Confirm its public fingerprint through an agreed independent channel. It provides confidentiality and package/report integrity, not sender authentication or vendor-ownership attestation. Receiving-key compromise exposes past packages; no forward secrecy, revocation or prevention of recipient redistribution is claimed. Combined actor recovery files remain private.

`contract/src/witnesses.ts` is security-critical. It returns exactly four private inputs: actor secret, report preimage tuple, patch evidence tuple, and retest evidence tuple. Missing data fails closed. The Compact contract never trusts tuple membership alone: it recomputes hashes and asserts subject equality. Changes require both incorrect-secret and wrong-subject negative tests.

## Abuse and availability

Wave 1 has no on-chain fee policy beyond normal network costs, no spam moderation, no key recovery, no store replication, and no dispute mechanism. Those omissions are accepted to keep the privacy-critical lifecycle complete. A production service needs program admission controls, encrypted abuse review, recovery, retention/deletion policy, rate limits, multi-region ciphertext availability, and operational incident response.

## Security verification performed

- Compact simulator negative and lifecycle tests.
- Real local and Preprod indexer-state privacy assertions.
- Independent Preprod transaction, contract-action, and finalized-head checks.
- AES-GCM corruption rejection and content digest checks.
- Safe logger redaction tests.
- Environment validation tests.
- UI wallet/proof-server failure tests.
- Automated accessibility smoke check.
- npm production dependency audit with findings recorded in Wave progress.

No independent audit, formal verification, penetration test, or production deployment has occurred.
