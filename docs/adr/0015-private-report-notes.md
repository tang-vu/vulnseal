# ADR-0015: Private working notes per report

Status: accepted, 2026-09-09.

The independent role workspace previously used one ephemeral text field for decision rationale, patch reference and retest evidence. Selecting another report cleared that text. The current text and selected tier now belong to a saved report and follow the encrypted role vault's persistence boundary.

## Data and meaning

Payload v4 requires `reportNotes` alongside the v3 draft and submission journal. Each entry has exactly `reportId`, `text` and `tier`. The report must exist in the same validated vault, identifiers cannot repeat, at most 100 entries are accepted, text is limited to 64 KiB UTF-8, and tiers are the strings 1–4. Empty text and whitespace are retained. Earlier payload versions remain valid and upgrade only when notes are edited. Draft edits and transaction checkpoints preserve v4 fields.

These are editable working copies, not an append-only decision history or evidence that a transaction used these values. An explicit contract action still hashes the current text or submits the selected public tier as appropriate. Later edits do not change earlier transactions. Notes are not included in public invitations or disclosure handoffs; role backup exports contain them and must remain private.

## UI and durability

Selecting a report selects its notes and tier without clearing another report's values. Notes remain editable while ordinary autosave is pending; the transaction controls require the current vault to be saved and the ledger connection to be verified. The existing 400 ms debounce, encrypted serialized writer, revision comparison and pre-wallet journal checkpoint ordering apply unchanged. Browser/file recovery restores the same notes. Clearing a note saves empty text; it does not promise forensic erasure from older backups.

Offline restoration also exposes the saved report selector and authenticated decrypted contents. Ledger refresh and contract actions require a connected session; the UI explicitly distinguishes unchecked offline state from current contract status. Private notes can be edited offline and saved without invoking a wallet. Ciphertext preparation and explicit transaction-observation buttons retain their existing network behavior.

Only the latest confirmed save is recoverable. Complete private decision history, transaction-bound rationale evidence, original attachment delivery, receiving keys and multi-program session management remain separate requirements.
