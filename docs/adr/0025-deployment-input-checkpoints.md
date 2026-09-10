# ADR-0025: Deployment input checkpoints

Status: Accepted for local recovery; native-wallet validation remains open.

## Problem

A vendor's editable program draft does not establish which constructor inputs were selected for an earlier deployment attempt. Recovery needs that context even when the wallet response is lost or the draft later changes.

## Decision

Role-vault v12 adds a required `deployment` field to each journal entry. It is null for unknown legacy inputs and non-constructor attempts. A non-null value belongs only to a vendor constructor intent and contains the seven selected public constructor arguments: program ID, four policy/scope digests, response days and disclosure delay days. Digests use canonical lowercase 32-byte hex; windows use canonical decimal uint64 strings. The program ID must match the vault. No actor secret or raw policy text is copied into this record.

The workspace captures independent string values before invoking deployment. Its before-submit callback adds them to the transaction attempt and awaits the encrypted browser save before returning to the wallet boundary. A missing snapshot or failed save rejects that callback. Later draft edits, journal additions and finalization updates preserve the snapshot; the helper refuses replacement with different values.

The active workspace displays saved inputs separately from public observations. The wallet-free inspector omits them. Older attempts remain explicitly unknown; inputs are never reconstructed from today's draft. Encryption and IndexedDB envelopes are unchanged. Current code reads v1-v11, but older releases cannot read v12: retain a compatible application for recovery and rollback.

## Limits and evidence

These values are local selected intent, not authenticated transaction arguments, deployed policy, confirmation of success or authorization to retry. Native Lace and independent transaction reconciliation remain required release work.

Tests cover encrypted round-trip, buffer independence, preservation after draft edits/finalization, overwrite and schema rejection, and a real encryption checkpoint with a mocked wallet boundary. Existing deployment address-save and indexer-failure regressions remain intact. Exact validation results are recorded in the validation report.

The production-browser recovery test imports synthetic uncertain v12 attempts, including an older attempt with unknown inputs. Desktop Chrome and Pixel 7 edit the working policy, inspect unchanged checkpoint values, download a backup, unlock the saved browser copy after closing the tab, and restore the downloaded file in an isolated browser context. The downloaded vault is decrypted and compared in full. The separate journal inspector omits the constructor snapshot and draft text. No POST/PUT requests are made. This checks actual browser storage and recovery, not a native wallet submission or ledger binding to a recovered address.
