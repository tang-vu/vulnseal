# ADR-0011: Encrypted browser role copies with revision checks

Status: accepted, 2026-09-09.

The role workspace previously relied on downloaded files for durability. Users can now opt into a password-encrypted IndexedDB copy and reopen it in a fresh tab. This supplements downloadable backups; clearing site data, browser eviction or device loss can remove local copies.

## Storage boundary

Each row contains an opaque UUID, a user-selected label, revision, update timestamp and the encrypted single-role backup envelope. The app does not copy program addresses, actor secrets, report identifiers, report keys or report plaintext into metadata. Labels and timestamps are intentionally visible without the password; labels must not contain private report details. The existing role-backup crypto suite and validation remain unchanged.

The password is kept in the active autosave writer's private memory to encrypt later snapshots and is never written to IndexedDB, localStorage or URLs. Each encryption generates fresh salt and IV. Stopping autosave clears the writer's password reference and blocks work that has not reached persistence; JavaScript cannot guarantee erasure of all runtime copies. A browser compromise while unlocked still has access to sensitive material.

## Ordering and stale tabs

An active writer serializes snapshots. Routine edits are debounced for 400 ms before encryption, coalescing changes while typing; explicit pre-submission journal persistence bypasses this delay and must complete before the wallet call. IndexedDB reads the current row and compares the expected revision within the same `readwrite` transaction as the update, using strict durability. A stale revision fails without replacing the newer copy. A storage error or conflict stops that writer; queued snapshots cannot continue overwriting. The open workspace remains available for file export. A later enable action creates a distinct copy, rather than silently overwriting the conflicted one.

The UI marks a vault revision saved only after persistence completes and only when it still matches the current vault. Autosaving an older snapshot cannot unlock transactions for a newer unsaved vault. A successful browser save satisfies the role workspace's pre-transaction backup gate. Keep an independent downloaded copy as well. Wait for the saved indicator before closing; shutdown during encryption/write has no guaranteed completion.

## Restore and limits

The catalog reveals metadata only. Unlock authenticates/decrypts the role backup. By default it uses the same program/authority/report checks as file recovery before installing a deployed workspace. The explicit offline-restore option opens local material without Lace; an offline notice remains and contract actions require a later verified connection. Restoring an undeployed vendor identity requires no wallet. Autosave resumes from the exact loaded revision; changes made elsewhere before the next write trigger a conflict. The app makes no cross-tab merge attempt.

Autosave covers the current `RoleVault`: role identity, deployment address and prepared/received reports. Payload version 2 also includes pre-submission identifiers as described in [ADR-0012](0012-submission-journal.md). Payload version 3 also carries one incomplete researcher report draft, as described in [ADR-0014](0014-encrypted-role-drafts.md). Payload version 4 adds private working notes and tier selection for each saved report; see [ADR-0015](0015-private-report-notes.md). Receiving keys and complete transaction history remain outside that schema. The feature is scoped to one origin/browser profile and does not synchronize across devices. The device-storage panel now reports origin-wide estimates and retention status and offers a click-only persistent-storage request; browsers may deny or omit it. Quota write failures give explicit backup/recovery guidance. Password recovery, per-copy capacity accounting and real-device storage-pressure/eviction drills remain separate work. Existing IndexedDB rows are preserved on validation or storage failure.

The copy catalog exports the existing encrypted envelope without decrypting it or connecting a wallet. Export checks the reviewed revision; password knowledge is only established by a later successful restore. Deletion requires an explicit loss acknowledgment and compares the reviewed revision atomically before removing one row. The check uses metadata, so malformed ciphertext does not prevent removal. Stale writers expect an existing revision and cannot recreate deleted rows. Management is disabled while this tab is autosaving; removing this tab's saved copy resets its backup gate. Other tabs detect deletion on their next write; there is no immediate cross-tab revocation. Downloads, other copies, server files and public records are unaffected. Deletion makes no forensic-erasure guarantee.

Evidence includes serialized writer tests, a UI changed-vault persistence test, fresh-tab recovery in production Chrome, and a two-tab atomic-revision test against real IndexedDB using the repository storage module. No network transaction or native Lace recovery is established by those tests.
