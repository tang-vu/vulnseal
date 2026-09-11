# ADR 0006 — Explicit encrypted browser recovery

Status: implemented, 2026-09-09. Native Lace recovery remains to be exercised on a real test wallet; network adapter coverage currently uses mocked providers and real commitment derivation.

## Problem

Browser program authority, researcher secrets, report salts, encryption keys, and private notes previously disappeared when a tab closed. Public commitments cannot reconstruct them. Making actor secrets random removed public fixed credentials but made an explicit recovery path essential.

## Decision

The Private recovery screen exports a password-encrypted JSON file. It does not persist plaintext, passwords, or secrets to localStorage, sessionStorage, a server, or the public ledger. It works before submission for incomplete drafts and after submission for the active report. It also exports program-owner material immediately after deployment.

The authenticated payload contains the active program/policy, both experimental actor secrets, draft, report ciphertext/key/salt/commitment, local status history, public commitment values, and private decision/patch/retest notes. The outer envelope exposes only a format/version, algorithm/KDF, fixed iteration count, random salt/IV, and ciphertext. No report or contract identifier is required outside encryption.

Validation captures a deep copy of the supplied recovery data before asynchronous cryptographic checks. Export encrypts the validated snapshot, not the original caller-owned object. Later mutations cannot change the pending export, and fields outside the recovery schema are not included in its encrypted payload. This is a snapshot of the export's starting state; later work still requires a new backup.

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

## Uncertain network transitions

Recovery payload v4 adds a required `uncertainTransition` field: null, or one of the seven existing-report circuit names. A non-null value requires network mode and a validated report. Versions 1-3 remain readable but cannot carry this field; a v4 document missing it is rejected. The encrypted envelope/KDF are unchanged. Pending initial submissions retain their separate v3 `submissionStarted` marker.

The combined demo sets the marker before private-state setup for triage, acceptance/rejection, patch, retest, payout authorization and closure. Only a successful API result clears it, before any follow-up public read. An API/private-state error therefore blocks further transactions and the report-reset action; it does not label the transaction as failed. The UI keeps a visible explanation, private backup access after the call returns, and a leave warning. Export preserves the marker; joining and checking the ledger during import does not clear it. There is no manual unlock or automatic retry because observing current report state alone does not reconcile a particular attempt.

This is conservative explicit-snapshot recovery, not a durable pre-wallet journal. Even an error before broadcast retains uncertainty. A tab crash before export, an older backup, initial deployment recovery, transaction identifiers and safe reconciliation remain separate gaps. Do not interpret a null/missing legacy marker as proof that there is no pending transaction.

## Bounded waits in the combined demo

Initial report submission and the seven existing-report transitions stop waiting after ten minutes across private-state preparation and the API transition call. Expiry releases the working UI so encrypted backup export is available, retains the existing uncertainty/submission marker and does not retry. If preparation resolves after expiry, the transition API is never called. If an already started API call resolves late, its result cannot clear the marker or update the report/receipt through this finished action.

This timer bounds the asynchronous application wait, not SDK cancellation or chain finality. Already started SDK work can continue; synchronous browser work can delay timer execution. The demo still has no durable pre-wallet journal or transaction identifier for these attempts. Initial program deployment and connection/restore are outside this helper. Public-state reads through `VulnSealApi.readPublicState` have a separate twenty-second deadline: expiry permits an explicit read retry without resubmitting a transaction, and late responses cannot update the completed caller. Connection/join operations before that read remain separate. The separate role workspace retains its identifier-based deadline and journal design.

## Operational limits

The combined demo requests a leave warning while it holds a sealed/prepared report, connected program authority, receiving keys, a created program policy, edited report/attachment/private-note fields, or an active/uncertain operation. Viewing the untouched default draft does not enable the warning; reverting edited draft fields to their initial values clears it when no other protected material exists. Completing a ciphertext upload does not clear the guard because its decryption key still lives in the tab. Starting a backup download also does not prove the file was saved, so it does not dismiss the guard. The handler is removed when the component unmounts.

Real Chrome desktop/mobile tests verify cancelling close preserves both edited drafts and sealed reports, and explicitly accepting close still closes the tab. This is a leave warning, not autosave, crash recovery or a guarantee for browser/OS termination. The private-exchange child panel also requests a warning while it holds unfinished backup/restore passwords, selected files, a parsed recipient, a decrypted disclosure, a receiving key or an active operation. Reverting all unfinished input clears its guard when no other material remains, and unmount removes its listener. The private-exchange panel also remains mounted and hidden across local screen/tab navigation, preserving its input until the workspace actually unmounts. The recovery panel also remains mounted across in-app navigation, as described below. Other child forms are not covered by this panel-specific retention. Receiving keys use their separate key-backup flow; the combined recovery file does not acquire new fields from this warning change.

### Ledger conflicts during restore

Network restoration now checks whether a saved pending report already exists in the selected contract, before activating the restored session. If it exists, restore refuses with an instruction to retain the file and investigate the previous submission, regardless of the backup's `submissionStarted` value. An old snapshot marked not-started must not offer a new submission for a report that is already present. This refusal does not promote the preparation to a completed report or infer the finality of any particular transaction.

If the pending report is absent, restoration preserves its original uncertainty marker; absence is not evidence that a retry is safe. Completed-report restoration also requires decrypted report material and recomputes the submission receipt from the report commitment, ciphertext digest and researcher key, in addition to the existing program/policy/authority checks. These checks detect inconsistencies in the returned ledger state; they do not authenticate the indexer, prove deployed code identity or reconcile transaction history. Recovery formats and encryption are unchanged.

This is an explicit snapshot, not automatic persistence. Save a new file after new reports, secrets, or private evidence. Losing both the current tab and the latest backup loses any newer material. Transactions interrupted before their results are captured still require a separate pending-transaction recovery design.

The current experimental session holds both roles. Its recovery file must not be used for researcher/vendor key exchange: anyone with the file and password gains both authorities. Separate-role exports and deliberate key sharing are subsequent work. The file does not back up the Lace wallet seed, rotate a compromised secret, or recover a forgotten password.

Use a local filesystem/private password manager or other user-chosen secure storage. No external upload is performed by the application. Cleartext exists in browser memory during use; this design does not protect a compromised browser or device.

### Recovery panel asynchronous boundaries

The combined recovery panel serializes both forms with a synchronous busy guard and disables their input while processing. Unmount invalidates pending panel callbacks: a file read completing afterward cannot start restoration, and a completed export cannot initiate a late download. Import eligibility is checked before reading and again before invoking restoration. A failed download keeps the password available for retry and cleans its temporary link/blob URL. This does not cancel an already invoked parent restoration, crypto operation or wallet request; the parent retains its own session and busy checks.


### Recovery form retention during navigation

The combined recovery panel remains mounted and hidden when another screen is selected. Backup passwords, restore password and selected recovery file survive these screen changes. Its leave warning covers unfinished inputs and processing even while hidden; an untouched empty panel does not warn. `Clear recovery inputs` removes all three passwords and the selected file from component state and resets the native file input, without altering the active report/session. Clearing is disabled during processing. Successful import clears its file/password; failed import preserves them for explicit retry. Successful export retains the existing password-clearing behavior.

An in-app screen change no longer invalidates a pending panel operation: an initiated export can finish its download and an initiated restore can finish through the parent's session checks. Actual unmount still applies the asynchronous invalidation above. These inputs remain only in browser memory; they are not stored in localStorage or added to recovery exports. Reload, crash or closing the workspace can still lose them. Clearing form input does not clear the parent's independent warning for report keys or other private session material.


### Incomplete program drafts (snapshot v5)

The combined program form now uses a separate `ProgramDraft` in application state. Text and selected policy windows survive screen changes without replacing the active `policy` used for existing program/report verification. Edits enable the session leave warning; fully reverting to the initial default draft clears that contribution. Submission still validates and normalizes the form through `readProgramForm` before constructing a program.

New exports use snapshot version 5 and require a `programDraft` with exactly the six policy fields as strings, each bounded to 64 KiB UTF-8. Empty/unfinished text and whitespace are retained. The existing pending-report and uncertainty checks still apply. Versions 1?4 remain readable; their program form starts from the validated saved policy because those formats did not retain an independent draft. A draft field on an older version is rejected instead of silently discarded. Older application releases reject v5 files and cannot serve as rollback readers for them. The outer encrypted envelope and key derivation are unchanged.

This is explicit encrypted-file recovery plus in-memory navigation retention. Undeployed network sessions still cannot export through the combined recovery flow; this change does not add deployment-attempt journaling, autosave or safe deployment retry. The separately validated active policy remains authoritative for existing ledger checks even when a new draft is incomplete.


### Manual encrypted browser copies

Private recovery can now save an encrypted combined-session copy in IndexedDB using the same password/confirmation fields as file export. Each confirmed save creates a new random copy ID, rather than replacing an earlier checkpoint. The stored record contains only that ID, a fixed non-private label, revision, timestamp and encrypted recovery envelope. Passwords and decrypted snapshots are not stored in the record. The dedicated `vulnseal-encrypted-recovery` / `copies` database is separate from single-role backups.

Refresh browser copies lists metadata on explicit request. In a fresh session, select a copy and enter its Recovery password to restore through the existing decryption and ledger checks. Incorrect passwords retain retry inputs. Removing a selected copy uses its reviewed revision in a single IndexedDB transaction; a changed revision blocks deletion. It does not clear the live session or other browser copies/files. The application's existing leave warning stays enabled after saving because further edits can occur and browser storage is not a separate-device backup.

The common IndexedDB driver now serves both role and combined recovery adapters without changing the role database/schema. Both retain strict transaction durability, revision comparison and separate 15-second open/transaction deadlines. Each adapter validates its own encrypted envelope before writing; combined copies reuse the parser used by `decryptRecovery`. Raw plaintext and cross-format envelopes are rejected. Quota failure preserves older committed copies, and a timeout cannot claim a late committed write was confirmed.

This is manual checkpoint storage, not autosave or a pre-wallet transaction journal. Only the latest state explicitly saved and confirmed is recoverable; reload can lose edits made afterward. Clearing site data, changing origin/browser/profile or storage eviction can remove or hide these copies. Keep a separate encrypted file backup and password. Undeployed network sessions retain the existing export restriction, and an encrypted copy does not authenticate transaction history or make uncertain attempts safe to repeat.
