# ADR 0017: Retain local submission intent in encrypted role journals

Date: 2026-09-09

## Context

Transaction identifiers alone cannot tell a recovering participant which of their reports an interrupted operation concerned. Current ledger state cannot safely reconstruct that intent, especially after subsequent transitions.

## Decision

Role vault payload version 5 adds a required `intent` to each submission journal entry: either `null` for unknown legacy intent, or an exact `{ circuit, reportId }` object. Deployment uses `constructor` and a null report identifier. Report operations must be permitted for the vault's role and name an authenticated disclosure already in that vault. Versions 1–4 remain readable with their original strict schemas. The outer authenticated encryption format remains unchanged.

The workspace scopes intent to the active deploy/execute call. Report submission derives the report commitment from the command preimage; other commands use their actual report identifier. The provider's existing pre-wallet identifier callback appends the intent to the encrypted journal and awaits IndexedDB persistence. A missing intent or failed save stops that callback. A `finally` clears active intent on both success and failure. Preparing a report now shares the same command execution path as other report transitions.

Migrating an older journal preserves all entries with explicit null intent. Editing drafts and working notes preserves version 5 and its journal. Both the active workspace and wallet-free inspector display intent separately from public transaction observations.

## Limits

This is locally recorded intent, not decoded or authenticated transaction contents. Possession of the backup password permits editing metadata. The schema does not retain complete command arguments, immutable private rationale, or final outcomes. An identifier observation still does not establish that the transaction executed the recorded circuit/report operation. Reconciliation against actual transaction effects and safe retry remain required; this change does not automate retries. A constructor entry can precede the deployment address being known.
