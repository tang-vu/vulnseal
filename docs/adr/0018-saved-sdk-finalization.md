# ADR-0018: Retain SDK finalization receipts in encrypted role journals

Status: Accepted — 2026-09-09

## Problem

Role submissions persist identifiers and local report/circuit intent before handing a transaction to the wallet. SDK finalization receipts previously existed only in React state. Closing the tab after a successful transaction could therefore discard its returned block height, even when the identifier survived in a backup.

## Decision

Role-vault v6 adds a required nullable `finalization` field to each submission attempt. A non-null value contains the SDK receipt's decimal block height and the local capture timestamp. The surrounding journal entry supplies the exact transaction identifier and circuit/report intent; the vault supplies the network, program and deployed contract address. Receipt capture requires a matching recorded identifier and circuit. Conflicting replacement heights, malformed heights/timestamps, unknown intent and undeployed vaults are rejected. Repeated capture of the same receipt preserves its first recorded timestamp.

Versions 1–5 remain readable. The first receipt capture upgrades the vault to v6, preserving reports, draft, notes and attempts. Earlier entries receive null receipts; missing legacy intent remains null. Later submission checkpoints, draft edits and note edits preserve v6. The password-encrypted outer envelope remains version 1 with its existing authenticated-encryption format.

After an SDK call succeeds, report operations await encrypted receipt persistence before reading ledger state again. Deployment checkpoints the learned address and receipt together before attaching the role session. If persistence fails, retain the updated vault in memory, clear its saved state, open the backup view and explain that the finalized operation must not be resubmitted. The prior stored copy remains available; the updated in-memory copy can be downloaded. No automatic retry is added.

Both the active workspace journal and wallet-free inspector label these values **Saved SDK finalization** and identify them as local backup claims. Restoring a backup does not promote its receipt to independently verified transaction evidence or current ledger state. Public status and report-effects checks remain explicit, read-only and ephemeral.

## Limits and evidence

This records successful SDK return values only. Unknown outcomes, failures and partial results are not assigned inferred terminal states; an absent receipt does not mean an operation failed or was never sent. There is still a crash window between SDK finalization and the completed encrypted write. No cryptographic finality/code proof, intended-argument validation, append-only private-note history or safe-retry decision is added.

Tests exercise legacy migration, strict receipt validation, conflicts, edit/encryption round trips, report receipt checkpoint failure, deployment address/receipt checkpoint failure and failed follow-up reads. Browser tests inspect v6 file and IndexedDB backups without Lace or implicit network requests. Native-wallet recovery remains an external validation requirement. Executed results are recorded in the validation report.
