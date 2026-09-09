# Privacy model

## Privacy objective

VulnSeal minimizes what a public observer needs to learn while retaining evidence that a fixed report followed an authorized disclosure process. It does not make all metadata disappear and it does not turn subjective security decisions into mathematical facts.

## What each party learns

| Party | Learns | Does not inherently learn |
| --- | --- | --- |
| Researcher browser | Full report, salt, researcher secret, AES material, private retest evidence | Vendor secret |
| Vendor browser after authorized artifact exchange | Decrypted report and necessary workflow data | Researcher's civil identity unless disclosed in report/contact channel |
| Ciphertext store | Envelope size, digest, timing, requester network metadata | Plaintext or AES key |
| Midnight proof service | Proof inputs required by the current provider path; treat as sensitive | AES key unless application wrongly passes it |
| Public ledger / verifier | Program config, commitments, pseudonymous key, status, disclosed tiers/result, receipts, sequence | Report title/body/reproduction/impact/contact, salts, secrets, patch details, retest details |

## Cryptographic claims

The implementation can establish:

1. A commitment was included in a Midnight ledger position, demonstrated locally and on Preprod.
2. The submitting circuit knew a canonical report digest, salt, and secret consistent with the published commitment and derived researcher key.
3. A later selectively revealed report can be canonicalized and recomputed against the original commitment.
4. Vendor transitions knew the program-bound owner secret.
5. Researcher retest evidence was bound to the original report and the current patch commitment.
6. A payout-authorization receipt could be created only after a passing retest along the implemented state path.
7. An observer can verify public state without the private report fields appearing in that state.

The implementation cannot establish:

- that the claimed vulnerability works or has the assigned severity;
- that a vendor's rejection reason is honest;
- that two differently salted or worded reports describe the same vulnerability;
- that the off-chain blob remains available;
- that the holder of a secret has a particular legal identity;
- that money moved or will move;
- that a compromised browser did not leak plaintext before encryption;
- mainnet permanence or production security from the resettable Preprod deployment.

## Linkability and metadata

Each public researcher key is bound to program, report commitment, and researcher secret. This limits direct cross-report equality compared with a global identity key, but public timing, ciphertext size, network traffic, wallet activity, and voluntarily disclosed details can still link events. The local ciphertext store does not pad envelopes. Production adapters should consider size classes, delayed/batched upload, private retrieval, and rotating transport identities.

## Selective disclosure

The public contract intentionally reveals only a coarse retest Boolean, public severity/reward tier, and content commitments. A researcher can later reveal the canonical report and salt to a chosen verifier, who recomputes `deriveReportCommitment`. Public disclosure is not automatic in Wave 1; coordinated disclosure policy is committed in program configuration.

## Secret lifecycle

Actor secrets, report salts, and encryption keys must be generated with a cryptographically secure random source, encrypted at rest, exported only through an explicit recovery flow, and never logged. The deterministic bytes in simulator/integration tests are clearly local test fixtures, never production keys. Losing the researcher secret prevents later researcher-authorized transitions. Losing the encryption key can make the ciphertext unrecoverable.

The browser's explicit **Private recovery** flow encrypts an active-session snapshot with password-derived AES-GCM. Import checks ciphertext/report bindings and, for Midnight sessions, both authorities and current public state before replacing local state. No recovery password or file is uploaded. Backups contain both experimental roles and are not a mechanism for sharing reports with another actor. See [ADR-0006](adr/0006-encrypted-browser-recovery.md). A local encrypted copy also permits authenticated decryption when the ciphertext store is unavailable; the UI labels that source.

## Data minimization test

The contract suite enumerates public record keys and asserts the absence of title, summary, reproduction steps, impact, contact, and salt. Both real local and Preprod integrations repeat this check on indexer-returned ledger state. This proves the current schema boundary; it does not prove that every surrounding wallet, browser extension, proxy, or infrastructure log is private.
