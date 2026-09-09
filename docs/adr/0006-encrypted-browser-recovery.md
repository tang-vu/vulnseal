# ADR 0006 — Explicit encrypted browser recovery

Status: implemented, 2026-09-09. Native Lace recovery remains to be exercised on a real test wallet; network adapter coverage currently uses mocked providers and real commitment derivation.

## Problem

Browser program authority, researcher secrets, report salts, encryption keys, and private notes previously disappeared when a tab closed. Public commitments cannot reconstruct them. Making actor secrets random removed public fixed credentials but made an explicit recovery path essential.

## Decision

The Private recovery screen exports a password-encrypted JSON file. It does not persist plaintext, passwords, or secrets to localStorage, sessionStorage, a server, or the public ledger. It works before submission for incomplete drafts and after submission for the active report. It also exports program-owner material immediately after deployment.

The authenticated payload contains the active program/policy, both experimental actor secrets, draft, report ciphertext/key/salt/commitment, local status history, public commitment values, and private decision/patch/retest notes. The outer envelope exposes only a format/version, algorithm/KDF, fixed iteration count, random salt/IV, and ciphertext. No report or contract identifier is required outside encryption.

- AES-256-GCM, 128-bit authentication tag, fresh random 96-bit IV.
- PBKDF2-HMAC-SHA-256 with 600,000 iterations and a fresh random 128-bit salt, using browser Web Crypto and a non-extractable derived key.
- Fixed additional authenticated data: `vulnseal:browser-recovery:v1`.
- Password minimum: 12 characters; maximum: 1024 UTF-8 bytes. This is a format policy, not a guarantee of password entropy.
- Import limit: 20 MiB. Unsupported KDF parameters and malformed lengths are rejected before key derivation; attacker-selected iteration counts cannot make import perform unbounded derivation.

## Restore checks

Decrypt and validate the payload before replacing any active state. Recompute the report digest and Compact commitment, verify the program-bound AAD, validate key/commitment widths, and check local workflow consistency. Wrong passwords and modified ciphertext fail authentication. Incomplete drafts remain drafts and are not presented as committed reports.

Network restore connects the wallet to the named network and joins the saved contract without submitting a transaction. It verifies the program ID, derived vendor authority, all four policy digests, public policy windows, report membership, ciphertext digest, and derived researcher authority. Current ledger status, severity, and patch/retest/payout values replace stale backup values. A mismatch leaves the existing tab unchanged.

Network transaction history is not reconstructed from private backup claims. The timeline labels the current ledger observation separately; later transaction results from this tab carry their own finality evidence. Local backup history is labeled recovered local history.

Vendor review normally retrieves ciphertext from the store. If retrieval fails or returns a digest mismatch, the locally held encrypted copy can be authenticated and decrypted instead; the UI explicitly labels that fallback. The backup includes that encrypted copy, so store withholding does not prevent the owner from reopening a backed-up report.

## Operational limits

This is an explicit snapshot, not automatic persistence. Save a new file after new reports, secrets, or private evidence. Losing both the current tab and the latest backup loses any newer material. Transactions interrupted before their results are captured still require a separate pending-transaction recovery design.

The current experimental session holds both roles. Its recovery file must not be used for researcher/vendor key exchange: anyone with the file and password gains both authorities. Separate-role exports and deliberate key sharing are subsequent work. The file does not back up the Lace wallet seed, rotate a compromised secret, or recover a forgotten password.

Use a local filesystem/private password manager or other user-chosen secure storage. No external upload is performed by the application. Cleartext exists in browser memory during use; this design does not protect a compromised browser or device.
