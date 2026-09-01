# Wave 1 progress — Proof of Disclosure

Last updated: 2026-09-01.

## Completion gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Compact contract compiles | Pass | Compact `0.31.1 --skip-zk`; full keys generated with official-source compatibility route |
| Generated bindings build | Pass | contract/API/web builds |
| Contract tests pass | Pass | 13 simulator tests, including required negative cases |
| Meaningful private state | Pass | actor, report, patch, retest witnesses |
| Researcher submits encrypted commitment | Pass | browser crypto/store flow and real local `submitReport` transaction |
| Vendor triage and acceptance/rejection | Pass | circuits, UI, tests, real local triage/accept |
| Patch and retest | Pass | bound circuits/tests and real local transactions |
| Payout authorization valid path only | Pass | negative tests and local final state |
| Public verifier | Pass | responsive timeline and indexer-state mapping |
| Unit/integration/E2E/type/build | Pass as of recorded final validation | See final validation section below and git history |
| Public/private boundary tests | Pass | simulator plus local indexer field-shape assertion |
| Visual inspection | Pass | four desktop/mobile screenshots; no known clipping/fake network labels |
| Preprod deployment | Not run | Requires human Lace/faucet/signing; no address claimed |

## Implemented scope

- Public program policy and program-bound owner authorization.
- Report commitment, ciphertext digest, pseudonymous researcher key, submission receipt.
- Authorized triage, acceptance/rejection, patch, retest pass/fail, payout authorization, closure.
- Deterministic report canonicalization and SHA-256 input encoding.
- Browser AES-256-GCM envelope and immutable ciphertext-only store.
- Current Midnight.js node and browser provider wiring.
- Real local node/indexer/proof lifecycle with redacted evidence.
- Professional researcher/vendor/verifier UI, privacy explanations, and offline states.
- Security documentation, threat model, claims table, deck, demo, and roadmap.

## Validation record

The final exact command/result matrix is intentionally updated only from actual command output. The initial implementation results were:

- Contract simulator: 13 passed.
- Shared crypto/schema: 8 passed.
- Cipherstore: 2 passed.
- API: 1 passed.
- Web component/accessibility: 5 passed.
- Playwright: 2 passed (desktop Chrome and Pixel 7).
- Local Midnight lifecycle: 7 transactions finalized, final `PAYOUT_AUTHORIZED`.
- Full npm audit: 0 vulnerabilities after removing the unused top-level-await plugin, upgrading `ws` to `8.21.3`, and adding the browser `assert` implementation required by the ledger codec.

The consolidated record is [validation-report.md](validation-report.md).

No skipped or failed check is represented as passing.

## Known limitations

- Local ephemeral network only; no Preprod address.
- Knowledge-based secret authorization has no rotation/recovery/multisig.
- Local proof path and ciphertext key exchange are not production-hardened.
- Store availability, padded traffic, dispute resolution, and asset settlement are outside Wave 1.
- No external audit, pilot, video URL, public repository check, or logged-out submission review yet.
- The host requires the documented official-source/ARM emulation compatibility path.

## Submission-only human actions

1. Connect/fund an authorized Lace Preprod wallet and approve deployment/transactions.
2. Record/upload the three-minute demo and place its link in the README/submission.
3. Confirm the project/author contact details that should be public.
4. Approve pushing/publishing the repository.
5. Add topics: `midnightntwrk`, `midnight-network`, `compact`, `zero-knowledge`, `bug-bounty`, `responsible-disclosure`, `security`, `typescript`, `react`.
6. Verify repository, license, README, screenshots/deck/video, and links from a logged-out browser.
