# ADR-0020: Retain private working notes with submission attempts

Status: accepted, 2026-09-09.

## Problem

Per-report working notes and tier selections are editable. Replacing them after triage, a patch or a retest previously erased the context visible during an earlier attempt, even though its transaction identifier remained in the encrypted journal.

## Decision

Role-vault v8 adds a required nullable `notes` field to each journal entry. Non-null notes contain the report ID, exact working text and selected tier. The report must match the entry's saved intent and an existing saved disclosure. Text is limited to 64 KiB of UTF-8 and the tier to 1–4, with exact object keys. Deployment and unknown-intent entries cannot have report notes. Existing entry-count and overall encrypted-backup limits remain in force.

For report commands, the workspace captures the note/tier values used by the initiating render and attaches them to the new identifier before its existing encrypted checkpoint. A checkpoint failure prevents the wallet submission. Later working-note edits do not change this entry. The application helper rejects replacement of an existing snapshot with different contents. New entries added to a v8 vault start with null notes until explicitly captured. Schema upgrades retain existing drafts, pending attachment input and finalization claims, and migrate older attempts to null notes without inferring their past context.

The unlocked role workspace offers a collapsed private-note section per journal attempt. The wallet-free recovery inspector explicitly projects only transaction/intent/finalization fields, omitting private notes from its React state and display. Snapshot data remains inside the password-encrypted role envelope and follows its browser/file recovery paths. The outer encrypted-envelope format is unchanged.

## Limits

These are working-context snapshots associated with attempts, not verified transaction arguments, immutable audit records or proof of broadcast. Some operations do not consume notes or the selected tier. The stored context therefore must not be interpreted as the exact public circuit inputs. A backup can be replaced or edited by its owner; this is application-level preservation, not a cryptographic append-only log. Attempts that never reach the identifier checkpoint have no new snapshot. Legacy snapshots cannot be reconstructed from current text. Physical backup recovery, independent argument reconciliation and native Lace validation remain separate work.

## Verification

Schema tests cover migration, preservation through draft/attachment/receipt edits, encrypted round-trip and rejection of mismatched/replaced/oversized notes. The role-journal component checks that a decrypted durable checkpoint includes the snapshot before its simulated broadcast. Browser tests edit current notes while retaining old attempt context, export/reopen encrypted copies and confirm that the wallet-free inspector does not show the private snapshot.
