# Three-minute demo script

Target runtime: 2:50–3:00. Show working evidence; do not narrate every form field.

## 0:00–0:20 — The trust gap

Show the landing page.

“A vulnerability platform can encrypt a report and still be the only authority for who submitted first, whether the original changed, and whether a promised process completed. VulnSeal seals the vulnerability, proves the authorized process, and reveals only when safe.”

## 0:20–0:40 — Public program

Open **Programs**.

“The vendor publishes scope, response window, reward policy, and disclosure policy. The public ledger receives configuration and digests, never exploit details.”

## 0:40–1:15 — Researcher seals locally

Switch to **Researcher**, enter a concise example report, and submit.

“The browser canonicalizes the versioned report, hashes it, encrypts with AES-256-GCM, and sends only the ciphertext envelope to the store. The Compact circuit proves knowledge of a program-bound report preimage and secret, and emits this receipt.”

Pause on the receipt. Point to commitment, ciphertext digest, and privacy callout. Never call guided-mode transitions transactions; for network evidence, show the recorded integration JSON or a live Lace-confirmed run.

## 1:15–1:50 — Authorized triage and patch

Switch to **Vendor**, begin triage, accept at a public tier, and anchor a patch.

“There is no arbitrary status setter. Each edge is a separate circuit. Vendor transitions require the program-bound owner secret, and this patch commitment is tied to this report.”

## 1:50–2:15 — Bound retest

Return as **Researcher**, submit a passing retest, then authorize payout as **Vendor**.

“The private retest evidence must name both the original report and the current patch. Only pass/fail is disclosed. Payout authorization can occur only after the accepted, patched, passing path. This receipt authorizes a tier; it does not claim funds moved.”

## 2:15–2:40 — Public verifier

Open **Public verifier**.

“A public observer sees that the report existed by this ledger position, stayed sealed, followed the authorized process, passed retest, and reached payout authorization—without seeing the exploit.”

Show the public Preprod contract, payout-authorization transaction at block 2371914, and the `publicRecordFields` allowlist in `docs/evidence/preprod-lifecycle.json`.

## 2:40–3:00 — Honest close

“Midnight is essential because the neutral workflow evidence is produced without putting the dangerous report on a public chain. Wave 1 proves disclosure. Wave 2 adds test-token escrow and disputes. Wave 3 adds developer-platform integrations and pilots. VulnSeal does not prove exploit validity or semantic uniqueness—and it says so everywhere.”

## Recording checklist

- Use a clean browser profile at desktop width; zoom 100%.
- Ensure no seed, secret, report from a real target, terminal environment, or wallet identifier is visible.
- Use a fictional vulnerability against a fictional target.
- If showing local evidence, label it “local ephemeral Midnight network.”
- When showing Preprod, distinguish the SDK identifier from the enclosing explorer transaction hash and state that Preprod can reset.
- Replace README video placeholder only after upload is verified from a logged-out browser.
