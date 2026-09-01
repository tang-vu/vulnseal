# Security policy

## Project status

VulnSeal is experimental Buildathon software. It has not received an independent audit and must not protect production vulnerability reports, identities, signing authority, or funds.

## Reporting a vulnerability in VulnSeal

Do not open a public issue containing exploit details, keys, private reports, or personally identifying information. Contact the repository maintainers through the private security-reporting channel shown on the eventual public repository. Until that channel is published, retain the report privately and ask a maintainer for a secure contact method without including the vulnerability details.

Include the affected commit, impact, minimal reproduction, and a safe contact route. The maintainers will acknowledge receipt, coordinate a disclosure date, and credit the reporter if requested. There is no bounty promise unless a published program explicitly says otherwise.

## Supported versions

Only the latest commit on the default branch is considered for security fixes during the Buildathon.

## Sensitive-data handling

- Report plaintext is canonicalized and encrypted in the browser.
- The demo ciphertext store accepts only validated AES-GCM envelopes and stores them under their SHA-256 content digest.
- Local private state and wallet databases are Git-ignored and encrypted where the Midnight provider supports it.
- Evidence logs contain circuit names, transaction IDs, block heights, public record field names, and limitations—never actor secrets, salts, plaintext, or encryption keys.
- Browser storage, extensions, clipboard managers, and a compromised device remain outside the contract's protection.

## Cryptographic scope

The Compact circuits prove report/preimage consistency, knowledge of subject-bound secrets, and valid workflow transitions. They do not prove exploit correctness, severity, semantic uniqueness, honest triage, payment, or ciphertext availability. `PAYOUT_AUTHORIZED` is not a transfer.

See [threat-model.md](docs/threat-model.md) for mitigations and residual risk.
