# ADR-0014: Recoverable private role drafts

Status: accepted, 2026-09-09.

The independent researcher workspace previously retained an incomplete report only in React state. A leave warning could not recover a closed or crashed tab. The current authoring draft now lives in the role vault and follows its encrypted browser/file persistence boundary.

## Format and migration

Payload version 3 requires `submissionAttempts` and `draft` in addition to the original role fields. `draft` is either null or a researcher-only report-shaped object. Versions 1 and 2 remain valid and retain their exact allowlists. Editing or preparing a draft upgrades the payload to v3 while retaining earlier journal entries; subsequent submission checkpoints preserve that version and draft. The encrypted outer envelope and its authenticated additional data remain version 1; the payload version is authenticated inside the ciphertext.

Draft validation accepts incomplete strings and preserves whitespace and blank reproduction lines, without sealed-report normalization. Exact field allowlists reject unexpected material. Limits are 1 MiB per text field, 2 MiB serialized draft, 10,000 reproduction lines and 50 attachment metadata entries. Digests and sizes are validated. These drafts are not sealed report evidence. Sealing filters blank reproduction lines and applies the existing canonical report requirements. Successful ciphertext upload replaces the draft with the prepared report in one vault update; a failed upload leaves the draft intact.

## Persistence and recovery

Browser autosave remains opt-in and password encrypted. Ordinary updates debounce for 400 ms before entering the serialized writer, avoiding key derivation for every keystroke. The UI distinguishes queued/encrypting changes from a confirmed save. Only the current successfully persisted vault satisfies the backup gate and clears its unsaved-data leave warning. The explicit pre-wallet journal checkpoint cancels any older delayed snapshot and is awaited directly, without this debounce. Already queued saves finish before the checkpoint through the serialized writer. This prevents an older draft snapshot from erasing the new submission journal. Revision conflicts/storage failures retain the open workspace and stop the writer.

File exports include the same draft. Restore normally checks the deployed program through Lace. An explicit offline option permits authenticated local file or browser-copy recovery without contacting a wallet or ledger. Offline workspaces show that authority/state remain unchecked; they can edit, back up and prepare encrypted reports, but contract actions require a later successful verified connection. Offline decryption does not authenticate current contract authority or historical submission outcomes.

## Limits

Only the last confirmed encrypted save survives termination. Edits during the debounce, encryption or write can be lost; this does not make browser shutdown reliable. Receiving keys, decision/patch/retest notes, uncommitted attachment-editor fields, original attachment bytes and the authoring acknowledgment checkbox are outside this draft. One current researcher draft is retained per workspace; multiple prepared reports remain supported. Physical device recovery, quota management and complete private history remain separate requirements.

Payload v4 subsequently adds per-report working notes separately from the draft; see [ADR-0015](0015-private-report-notes.md). It does not add complete private decision history.
