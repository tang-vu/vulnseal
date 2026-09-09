# ADR-0010: Independent browser role workspace

Status: accepted, 2026-09-09.

`/#roles` mounts a dedicated workspace instead of the combined experimental `App` session. It creates one actor identity and uses `RoleSession` for report transitions. The old demo remains available separately. Use distinct browser profiles/providers for separate participants; a receiving key from private exchange is not a contract actor secret.

## Authority and program setup

A vendor first creates a random program ID and actor secret and downloads a password-encrypted role backup. Deployment is disabled until that backup has been exported. Successful deployment records the contract address before subsequent attachment/read operations and requires a refreshed backup. A pre-deployment backup can reconnect to a known deployment address only after the role API verifies its owner key. A public invitation contains only format/version, network, contract address and program ID. Researcher join generates a separate secret and checks the selected program through Lace/providers. Invitation identity must be confirmed through the parties' agreed channel; the invitation is not a signed identity certificate.

## Reports and disclosure

Researchers prepare encrypted reports before submitting. As amended by [ADR-0021](0021-prepared-ciphertext-recovery.md), preparation computes the commitment and adds the key, salt and envelope to the role vault locally; upload follows backup and reuses the saved envelope. An updated backup is required before any transaction. The vault retains up to 100 reports scoped to its one program; selecting another does not discard previous ownership material. Prepared reports can survive restoration even when absent from the ledger. For existing researcher reports, restoration also checks the derived researcher authority and ciphertext binding.

The exchange panel can encrypt a selected researcher report to a recipient key. A vendor can add an opened disclosure only when its network, contract, program, report membership and ciphertext digest match the current ledger. The vendor vault then retains the report's decryption material, without receiving the researcher actor secret. Saved reports can be decrypted directly in the workspace. Vendor and researcher transaction controls follow their respective roles and the current ledger stage.

After a transaction, its returned receipt is retained before the follow-up public read. A missing or unexpected state blocks further writes until a manual refresh. Errors do not automatically resubmit transactions. This is not a durable pending-transaction reconciliation system.

## Backup format and limits

The encrypted plaintext has an exact allowlist: version, role, network, contract address, program ID, one actor secret, and scoped report disclosures. Additional actor fields, duplicates and foreign reports are rejected. The fixed v1 envelope uses PBKDF2 SHA-256 with 600,000 iterations and random 128-bit salt, AES-256-GCM with random 96-bit IV, and the AAD `vulnseal:single-role-backup:v1`. Passwords are 12 or more characters and at most 1024 UTF-8 bytes. Import is capped at 32 MiB; export plaintext is capped at 16 MiB. Conventional role-backup filenames are Git-ignored.

Backup is manual and file-based. Draft form edits must be prepared first; they are not included. Receiving keys have their own separate backup. Per-transition private notes, full transaction history, deployment policy text, pending submissions and automatic persistence are not included. Keep the deployment receipt/address and external policy records. A failed wallet operation may require independent transaction reconciliation before retrying. No secure memory-erasure guarantee is made.

## Evidence scope

Cryptographic tests cover one-role vaults and report/invitation bindings. Component tests use mocked network providers to cover role controls, researcher preparation of multiple reports, backup gating and finalized-receipt preservation. Production Chrome/Pixel journeys cover actual file backup/restore, invitation parsing and missing-wallet failure. The API's generated-circuit tests separately cover two actors through closure. These layers do not replace a successful native Lace multi-profile deployment, disclosure, triage, retest and closure ceremony on Midnight; that remains open.
