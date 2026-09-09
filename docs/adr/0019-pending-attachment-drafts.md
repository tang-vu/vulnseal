# ADR-0019: Preserve pending attachment metadata in private recovery

Status: Accepted — 2026-09-09

## Problem

The attachment editor previously owned its filename, media type, size and digest fields locally. Switching away from the editor discarded unfinished input even though the rest of the report could be recovered. Only metadata already added to the report survived backups.

## Decision

The role workspace and demo own a separate `attachmentDraft` beside the report draft. It contains exactly four strings: `filename`, `mediaType`, `size` and `digest`. Each field permits up to 4 KiB of UTF-8 text. Incomplete sizes, partial digests and whitespace are retained exactly; normal attachment validation still runs when the user chooses **Add attachment metadata**.

Role-vault v7 adds a required nullable `attachmentDraft`; non-null values belong only to researchers. Migration preserves all drafts, notes, intents and SDK finalization receipts. Subsequent receipt, note and submission updates retain v7. Earlier role versions remain readable and start with empty pending fields. Demo recovery v2 retains the same structure, while v1 remains readable. Both encrypted outer envelopes retain their existing v1 formats and encryption parameters.

The editor receives controlled fields from its parent. Role report/attachment updates use functional state updates so adding metadata and clearing the pending fields in one event cannot overwrite each other. Restored pending fields disable sealing immediately, including before the editor's effect runs. Adding or clearing fields removes that restriction. Switching views preserves pending text; role autosave and file export include it. The demo includes it in manual encrypted export.

## Limits and validation

These fields remain draft metadata outside the sealed report. They do not upload file bytes, save selected File objects, resume in-flight hashing or replace the need to retain originals. Role users must wait for a successful encrypted save; demo users must export a current backup. Neither path recovers changes made after its last completed save.

The attachment editor and received-file checker now let users cancel a pending local hash. Cancellation discards that attempt's result and releases the editor's pending restriction; it does not abort an already-started browser file read or WebCrypto operation. A late success or failure cannot change a replacement attempt. Received-file results also reset when any sealed attachment metadata changes, including size or filename with an unchanged digest, so an earlier match cannot remain attached to different metadata. This does not add persistence or resumption of file reads.

Browser tests restore unfinished role fields from IndexedDB and a downloaded file in an isolated context, then complete and add an attachment without losing report edits. The demo test exports/restores pending fields, clears them, seals the report and verifies the original attachment bytes as the vendor. Unit tests exercise bounds, invalid types/extra fields, whitespace preservation and v7 receipt/note preservation through encryption. Executed results are recorded in the validation report.
