# VulnSeal pitch deck

## Slide 1 — The disclosure trust gap

- Centralized bounty platforms protect report content but remain the authority for first submission, alteration, duplicate decisions, remediation, and payment promises.
- A leaked report can turn responsible disclosure into an exploit roadmap.
- Security teams need privacy and neutral process evidence at the same time.

Speaker line: “Encryption hides the report; it does not make the process independently verifiable.”

## Slide 2 — VulnSeal in one sentence

**Seal the vulnerability. Prove the process. Reveal only when safe.**

VulnSeal timestamps and proves ownership of an encrypted vulnerability report, enforces authorized triage/repair/retest transitions, and emits a public resolution and payout-authorization trail without publishing the exploit or reporter identity.

## Slide 3 — One complete user journey

1. Vendor publishes program and policy digests.
2. Researcher canonicalizes and encrypts locally.
3. Midnight records commitment and receipt.
4. Vendor triages and anchors a patch.
5. Researcher proves a report-and-patch-bound retest.
6. Valid path emits payout authorization.
7. Anyone verifies the minimal public timeline.

## Slide 4 — Privacy is the product requirement

- Exploit details must stay private before remediation.
- Reporter identity can carry career, legal, and physical risk.
- Public proof must not become public weaponization.
- Browser AES-GCM protects the artifact; Midnight proves the workflow. Neither substitutes for the other.

## Slide 5 — Midnight dual-ledger architecture

Private witnesses: report digest/salt, actor secrets, patch/retest evidence.

Public state: program policy, commitments, pseudonymous key, status, disclosed result/tier, receipts, sequence.

Off-chain: immutable content-addressed ciphertext only.

Show the Mermaid diagram from `docs/architecture.md`.

## Slide 6 — Live evidence, not a mock proof

- Compact `0.31.1`, eight real proving circuits and key pairs.
- 13 contract lifecycle/adversarial simulator tests.
- Real local and Preprod node/indexer/proof-server lifecycles: seven finalized contract transactions each.
- Preprod contract `83c5aa34…a9eb`; final state `PAYOUT_AUTHORIZED` at block 2371914.
- Desktop and mobile full-flow tests plus accessibility checks.

Show the public explorer contract and the independent indexer/RPC evidence snapshot. Say “authorization,” never “payment.”

## Slide 7 — Security and honest limitations

Proves: commitment ownership knowledge, subject-bound authorization, valid state path, patch/retest binding, payout authorization conditions.

Does not prove: exploit validity, objective severity, semantic duplicates, owner honesty, availability, civil identity, or payment.

Wave 1 is experimental and unaudited.

## Slide 8 — Market and adoption hypothesis

Initial users: open-source maintainers, Web3 protocols, lean security teams, audit firms, ecosystem foundations.

Hypothesized model: free public program → paid private workspace → later escrow fee → integration SDK/API.

No traction is claimed. First validation is structured interviews and opt-in pilots.

## Slide 9 — Three Waves

- Wave 1: proof of disclosure—complete encrypted workflow, public verifier, and Preprod evidence.
- Wave 2: proof of resolution—test-token escrow, disputes, stronger authorization, richer evidence chain.
- Wave 3: proof of adoption—GitHub/SDK, production storage, privacy-safe analytics, pilots, audit.

## Slide 10 — Closing vision

“The safest vulnerability is one the public can verify was handled—without being able to read it.”

VulnSeal turns coordinated disclosure from a platform promise into a privacy-preserving, verifiable process.
