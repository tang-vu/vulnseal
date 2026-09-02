# Claims and evidence

Status vocabulary: **real** means implemented and evidenced in the stated environment; **partial** means a bounded part is real but the broader claim would overstate it; **planned** means no implementation claim.

| Product claim | Mechanism | Evidence / test | Current limitation | Status |
| --- | --- | --- | --- | --- |
| A researcher committed to a fixed private report | Domain-separated Compact commitment over program, canonical digest, and salt | `valid report commitment`, incorrect preimage tests; Preprod `submitReport` at block 2371859 | Preprod is a resettable test network, not mainnet permanence | Real (Preprod) |
| The submitting actor knows the report preimage and secret | Circuit recomputes commitment and report-specific researcher key from private witnesses | Incorrect preimage and incorrect secret negative tests | Knowledge does not establish civil identity or report truth | Real |
| A revealed report can be matched to the original seal | Deterministic canonicalization and `deriveReportCommitment` | Canonicalization/encoding tests and pure-circuit tests | Disclosure UI is selective/manual in Wave 1 | Real mechanism; partial UX |
| Vendor transitions are authorized | Program-bound owner key recomputed inside every vendor circuit | Unauthorized triage test; legal-edge tests; Preprod lifecycle | No rotation, multisig, or stolen-secret recovery | Real |
| Researcher transitions are report-bound | Report preimage plus report-specific secret key assertions | Wrong preimage/secret tests | Secret theft remains possible | Real |
| Report identifiers cannot be overwritten | Map membership assertion in `submitReport` | Replay/duplicate commitment test | Semantic duplicates with new salts are possible | Real |
| Patch is bound to the report | Patch witness subject assertion and domain-separated commitment | Wrong-report patch test | Patch correctness is not proven | Real |
| Retest is bound to report and current patch | Circuit asserts both subjects before committing evidence | Wrong-patch test; Preprod `submitRetest` at block 2371904 | Evidence truth is not objectively proven; only result is disclosed | Real |
| Payout authorization requires acceptance and passing retest | Closed state path, status/result assertions, unique receipt set | Two premature-payout tests; Preprod authorization at block 2371914 | No escrow or token transfer | Real authorization only |
| Public observers can inspect a sealed workflow | Indexer-readable public record and verifier timeline | UI component/E2E tests; independent Preprod indexer/RPC snapshot | Verifier depends on indexer availability; Preprod may reset | Real (Preprod) |
| Plaintext never reaches the ciphertext service | Browser AES-256-GCM before PUT; service schema accepts envelopes only | Round trip, corruption, server digest tests | A compromised browser can leak before encryption | Real for implemented client/service path |
| Ciphertext alteration is detectable | AES-GCM authentication plus SHA-256 content address | Corrupted ciphertext and digest-validation tests | Store can delete/withhold blobs | Real |
| Report fields stay out of public state | Public type contains only allowlisted commitments/status metadata | Simulator plus real local and Preprod indexer-shape assertions | Metadata and disclosed tiers remain visible | Real for current schema |
| The workflow proves vulnerability validity or severity | None—explicitly excluded | Privacy/claims docs and UI language | Requires external technical evaluation | Planned / not claimed |
| Semantic duplicate reports are prevented | None—explicitly excluded | Negative claim in docs | Different secrets/salts/content produce different commitments | Planned / not claimed |
| Funds were paid | None in Wave 1 | Receipt is named `PAYOUT_AUTHORIZED` everywhere | No token escrow or transfer | Planned / not claimed |
| VulnSeal is deployed to Preprod | Compact deployment and seven proven lifecycle transactions | [preprod-evidence.md](preprod-evidence.md); public explorer links; independent indexer/RPC snapshot | Preprod can reset and is not a production deployment | Real (Preprod) |
| Production end-to-end privacy | Browser encryption + ZK workflow are foundations | Threat model and tests | No audit, hardened key exchange, production store, traffic protection, or operational controls | Partial |
