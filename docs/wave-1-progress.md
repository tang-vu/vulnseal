# Wave 1 progress — Proof of Disclosure

Last updated: 2026-09-09. The original Wave 1 baseline is retained below. Follow-up work improves browser state/evidence correctness, policy forms, wallet network binding, atomic ciphertext storage, and schema validation; production E2E now covers eight desktop/mobile cases. All eight recorded Preprod identifiers were independently reverified on September 9. Exact results and remaining completion gaps are in [validation-report.md](validation-report.md) and [readiness-audit.md](readiness-audit.md).

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
| Preprod deployment | Pass | Contract `83c5aa34…a9eb`; seven successful lifecycle transactions; independent indexer/RPC verification |

## Implemented scope

- Public program policy and program-bound owner authorization.
- Report commitment, ciphertext digest, pseudonymous researcher key, submission receipt.
- Authorized triage, acceptance/rejection, patch, retest pass/fail, payout authorization, closure.
- Deterministic report canonicalization and SHA-256 input encoding.
- Browser AES-256-GCM envelope and immutable ciphertext-only store.
- Current Midnight.js node and browser provider wiring.
- Real local and Preprod node/indexer/proof lifecycles with redacted evidence.
- Restart-safe Preprod wallet synchronization using an authenticated encrypted checkpoint.
- Professional researcher/vendor/verifier UI, privacy explanations, and offline states.
- Security documentation, threat model, claims table, deck, demo, and roadmap.

## Validation record

The final exact command/result matrix is intentionally updated only from actual command output. The initial implementation results were:

- Contract simulator: 13 passed.
- Shared crypto/schema: 8 passed.
- Cipherstore: 2 passed.
- API: 1 passed.
- Preprod checkpoint security: 4 passed.
- Web component/accessibility: 5 passed.
- Playwright: 2 passed (desktop Chrome and Pixel 7).
- Local Midnight lifecycle: 7 transactions finalized, final `PAYOUT_AUTHORIZED`.
- Preprod Midnight lifecycle: NIGHT→DUST registration plus 7 successful contract transactions, final `PAYOUT_AUTHORIZED` at block 2371914.
- Full npm audit: 0 vulnerabilities after removing the unused top-level-await plugin, upgrading `ws` to `8.21.3`, and adding the browser `assert` implementation required by the ledger codec.

The consolidated record is [validation-report.md](validation-report.md).

No skipped or failed check is represented as passing.

## Known limitations

- Preprod is resettable and is not mainnet or a production-security guarantee.
- Knowledge-based secret authorization has no rotation/recovery/multisig.
- Local proof path and ciphertext key exchange are not production-hardened.
- Store availability, padded traffic, dispute resolution, and asset settlement are outside Wave 1.
- No external audit, pilot, video URL, public repository check, or logged-out submission review yet.
- The host requires the documented official-source/ARM emulation compatibility path.

## Submission-only human actions

1. Record/upload the three-minute demo and place its link in the README/submission.
2. Confirm the project/author contact details that should be public.
3. Approve pushing/publishing the repository.
4. Add topics: `midnightntwrk`, `midnight-network`, `compact`, `zero-knowledge`, `bug-bounty`, `responsible-disclosure`, `security`, `typescript`, `react`.
5. Verify repository, license, README, screenshots/deck/video, and links from a logged-out browser.
