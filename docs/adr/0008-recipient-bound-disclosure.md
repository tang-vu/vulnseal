# ADR-0008: Recipient-bound private disclosure exchange

Status: accepted, 2026-09-09.

The combined experimental recovery file contains both actor secrets and must never serve as a researcher-to-vendor handoff. Private exchange uses a separate allowlisted disclosure format and a receiving key that grants decryption only.

## Protocol

The recipient generates RSA-3072 with exponent 65537 and OAEP SHA-256 using Web Crypto. Its public file contains format/version, canonical SPKI encoding and SHA-256 fingerprint. Parsing checks the algorithm, size, exponent and fingerprint. The sender confirms that fingerprint through an agreed independent channel; the public file does not authenticate vendor identity or contract ownership.

Each disclosure uses a fresh AES-256 key and 96-bit IV. AES-GCM authenticates the versioned protocol context and recipient fingerprint; RSA-OAEP wraps the AES key using that context as its label. The outer file exposes only format/version, recipient fingerprint, wrapped key, IV and ciphertext. The encrypted inner allowlist is network, contract address (null for guided local), program ID, report commitment, original ciphertext envelope, report decryption key and salt. Actor secrets, wallet data and private triage/retest notes are excluded. Version 1 contains metadata only; version 2 can additionally carry verified original attachment bytes as described below.

Export captures the public recipient file before asynchronous report validation, so later changes to the caller's recipient object cannot redirect a pending package. Receiving-key backup similarly captures the public recipient and private key at entry, validates the public file, and verifies the key pair before encryption. Both backup creation and restoration require a matching RSA-OAEP SHA-256 private key with decryption usage. A caller cannot obtain an apparently successful backup of mismatched keys; ordinary UI key creation and the encrypted v1 file formats are unchanged.

Decryption enforces the schema, checks program AAD, decrypts the report and recomputes its Compact commitment. This establishes correspondence with the supplied commitment, not sender authority, original submission or network inclusion. Network packages offer an independent-verifier link with public identifiers and expected ciphertext digest only. Guided reports explicitly have no network evidence.

## Key recovery and limits

The receiving private key stays in memory. Creation installs the key in the current workspace before backup encryption/download, so a failure does not discard the new key. The receiving fingerprint remains visible, and **Save receiving key backup** retries with that same key and the chosen password; it also permits another backup of a restored key. Public-key export is available once a key is retained. Save and retain its encrypted backup before sharing the public key or closing the tab. Download initiation does not prove a file was saved; neither the backup nor its password is automatically persisted. Closing/locking during failed backup preparation can still lose a key without a retained backup. This backup contains the receiving key pair only. Its fixed v1 suite is PBKDF2 SHA-256 (600,000 iterations, random 128-bit salt), AES-256-GCM (random 96-bit IV), and a separate versioned backup AAD. Passwords require at least 12 characters and at most 1024 UTF-8 bytes. Restoration checks the key pair before installation. Public files are bounded to 8 KiB, backups to 16 KiB and disclosure packages to 20 MiB before parsing.

Receiving-key backup is separate from combined actor recovery. Losing the receiving key and backup prevents receipt of earlier packages. Compromise exposes recorded packages addressed to that key: no forward secrecy is provided. Recipients can retain or redistribute decrypted reports. Browser compromise remains a residual risk. No automatic delivery, server storage, identity directory, revocation service or secure memory-erasure guarantee is claimed. Conventional private backup/package filenames are Git-ignored.

## Implementation boundary

The sender exports from an existing sealed-report session. A fresh recipient context restores only its receiving key and reads the disclosure locally, without a wallet or actor recovery file. Received reports use a separate read-only view and cannot replace active reports or alter contract state. Independent researcher/vendor transaction sessions, program invitations, role-specific authority recovery and multi-report persistence remain required work.

Verification covers wrong recipients, ciphertext/IV/wrapped-key tampering, wrong backup passwords, fingerprint mismatch, private-field rejection, report/program mismatch and isolated browser contexts. Executed results are in the validation report.

## In-session navigation

The combined demo and role workspace keep the private-exchange panel mounted while another local screen/tab is selected. Its hidden wrapper removes it from normal display and keyboard navigation while retaining unfinished passwords, file selections, fingerprint confirmation and decrypted results in memory. Returning to exchange resumes that same panel; an explicitly started operation can finish while it is hidden. Merely mounting the panel performs no cryptography or network request. Its unload warning remains active for retained material.

Role locking still remounts the workspace and clears the panel, and actual unmount still invalidates late async results. Hiding a panel is not a security boundary, durable storage or secure erasure. Page reload/close still requires the separate receiving-key backup; other forms do not inherit persistence from this change.

## Recipient confirmation and selected report

The sender panel displays the selected report commitment. Fingerprint confirmation is cleared whenever the source disclosure changes in network, contract, program, report, envelope, key or salt, including when it becomes unavailable. The parsed recipient stays available for explicit reconfirmation. Equivalent rerenders and navigation with the same disclosure retain the confirmation. This prevents a saved confirmation for one report from silently enabling export of another after workspace selection changes. An export already requested for the prior report may still finish using that request's captured source; this guard does not retract downloaded disclosures.

## Clear panel input and preview

**Clear exchange inputs and preview** drops the panel's passwords, selected file references, parsed recipient, fingerprint confirmation, decrypted preview and status/error messages. It also resets the native file inputs so the same file can be explicitly selected again. The action is disabled during a pending operation. Receiving keys and workspace reports remain held by the parent; this control does not delete files, backups or ledger data, and does not promise secure erasure from browser memory. A retained receiving key continues to require a separate backup and keeps the leave warning active.

## Download failures

Public receiving-key export uses the same local operation/error handling as private exchange backups and packages. A failed download reports an error while retaining the key for explicit retry. All panel downloads remove their temporary anchor and schedule blob-URL revocation even if clicking the anchor throws. Success messages describe download initiation; the user still needs to retain the file.

## Version 2: encrypted original attachments

The sender can select original files in Private exchange after sealing a report and confirming the recipient fingerprint. At most 50 files and 8 MiB total raw bytes are included. Each selected filename (NFC), byte size and SHA-256 must match an attachment entry in the sealed report. Duplicate filename/digest pairs are refused. A subset is allowed; entries without included files still require separate delivery. The sender retains the originals.

An attachment-bearing package uses outer version 2 and the authenticated context `vulnseal:recipient-handoff:v2:<fingerprint>` for both AES-GCM AAD and RSA-OAEP label. Its inner allowlist is `{disclosure, attachments}`, where each attachment contains only `filename` and canonical base64url `data` (empty string for a zero-byte file). The same fresh key/IV and recipient binding apply. Raw input bytes are copied before asynchronous validation. The entire serialized outer package must still fit 20 MiB; a very large report can therefore leave less room for attachments. No ciphertext service limit or endpoint is changed.

On opening, the recipient validates the report and its commitment, rechecks every included file against the sealed metadata, and rejects the entire package if any file is invalid. Authentication alone does not bypass this check: anyone with a receiving public key could encrypt a package, so the sealed report binding is independently enforced after decryption. An outer version downgrade fails authentication. Metadata-only exports remain version 1, and this reader accepts both versions. Earlier releases reject version 2 and must be upgraded to receive originals.

Verified bytes can be explicitly downloaded in the recipient browser as `application/octet-stream`; they are never rendered inline. Download filenames replace path separators/control characters. Clearing the preview releases the retained file references. Workspace and receiving-key backups do not gain binary content: retain the encrypted disclosure package and receiving-key backup, or download and retain each original before clearing/closing. Adding a report to the vendor workspace preserves report metadata only.

Reading/encrypting selected files and reading/decrypting a received package each have a three-minute deadline with continuation checks. Expiry prevents a late download or preview; underlying crypto/file operations are not forcibly cancelled. Exports remain local downloads; users deliver the encrypted package through their agreed channel.

See [attachment transfer guide](../attachment-transfer.md) and the validation report for executed browser and crypto evidence.
