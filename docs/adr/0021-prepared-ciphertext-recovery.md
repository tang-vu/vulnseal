# ADR-0021: Back up prepared ciphertext before upload

- Status: accepted
- Date: 2026-09-09

## Problem

The independent role workspace previously uploaded freshly encrypted report bytes before adding their envelope, key, salt and commitment to the vault. If the service stored the bytes but its response was lost, only the editable draft remained locally. Preparing again generated new cryptographic material rather than retrying the same artifact.

## Decision

Preparation is local. Once encryption, commitment derivation and vault validation succeed, one vault update adds the prepared disclosure and clears the draft. The workspace opens the backup form. Existing encrypted autosave also covers this update when enabled; until a save succeeds, the ordinary unsaved-data warning and lock restrictions remain in force. Preparation sends no storage request and does not call the wallet.

The selected report offers **Upload saved ciphertext**, enabled only when the current vault is backed up. This validates the saved disclosure and PUTs its exact envelope at its computed SHA-256 content address. It is available after offline recovery, to either participant holding the disclosure. A failed or uncertain response preserves the report and backup. The user can explicitly repeat the upload with identical bytes and address; the immutable ciphertext service treats an identical existing blob idempotently. No automatic retry is introduced.

**Submit prepared report** retains its existing connected-session, current-state and encrypted-journal requirements. Before starting the contract call, it also PUTs that same backed-up ciphertext. Storage failure prevents entry into the contract call and leaves the prior ledger snapshot available. This may repeat an already acknowledged upload, so it does not depend on a stale local success flag. A storage acknowledgment is not a retention guarantee or transaction receipt.

## Scope and limits

The role-vault schema is unchanged. Its existing disclosure already contains everything needed to restore and reupload the original encrypted report. No report key, salt, actor secret or plaintext is sent to storage. The standalone upload does not require Lace or make any on-chain change. Download completion remains a browser signal; users must retain the file, and browser autosave remains subject to deletion/eviction.

This changes the independent role workspace only. The combined demo's preparation flow is separate. There is no binary attachment delivery, ciphertext replication, automatic reconciliation of uncertain wallet outcomes, upload-retention promise or cryptographically authenticated upload receipt. An old backup that never captured a prepared disclosure cannot recover it from a draft alone. Before preparation finishes and a backup succeeds, unsaved material can still be lost.

The browser recovery test deliberately lets the real local service store a PUT and drops its response, then restores the encrypted role file in a separate browser context and reuploads identical bytes. This tests storage uncertainty and portable recovery without a native wallet or live network transaction.
