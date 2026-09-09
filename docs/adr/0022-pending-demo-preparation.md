# ADR-0022: Retain pending preparation in combined-session recovery

- Status: accepted
- Date: 2026-09-09

## Problem

The combined experimental browser flow retained a sealed report only after upload and optional contract submission succeeded. An interrupted response discarded the newly generated encryption material from the UI state, and its retry button could start a new seal or repeat a contract call whose outcome was unknown.

## Decision

The application retains the encrypted envelope, key, salt and derived report ID before attempting the ciphertext PUT. Until success, this preparation stays separate from the completed report and workflow history. Storage retries reuse the exact bytes and address. Editing a replacement, changing programs, switching a guided report to network mode, and importing over the pending preparation are blocked. The private report remains readable, and a best-effort browser leave warning requests that the user keep a backup.

Immediately before entering network private-state setup/submission, the application marks the attempt as started. A failure after that conservative boundary blocks the combined flow's retry button. This includes a private-state setup failure before any actual wallet call; the UI does not infer that a transaction was broadcast, rejected or finalized from the error. Success installs the completed report and clears the pending preparation. This change does not introduce automatic retries.

Recovery payload v3 adds `pendingReport`, either null or an exact object with `report` (envelope/key/salt/ID) and boolean `submissionStarted`. The pending material must authenticate, derive the recorded commitment, belong to the same program and match the canonical draft. Pending and completed reports cannot coexist, and pending material cannot claim completed workflow history or later commitments. Guided mode cannot contain a started network attempt. Versions 1 and 2 remain readable; the outer encrypted envelope and password derivation are unchanged.

The private recovery export includes this pending state. Restoring a guided pending upload opens the preserved preparation and permits explicit retry. A network restore still verifies the program/owner/policy using the existing connected flow, but a started pending attempt remains blocked even after that check. Program verification does not reconcile that attempted report. Local backup flags are not authenticated transaction evidence or permission to retry a manually edited backup.

## Limits

This is manual file recovery, not a durable pre-broadcast journal. A crash before the user exports a current backup can still lose pending material. In particular, an older file exported before the network attempt cannot record its later start: never use an older backup's false flag as proof of no submission. The combined flow does not yet retain per-attempt transaction identifiers or reconcile pending report effects. Use the independent role workspace for its stronger encrypted pre-wallet checkpoint and journal; a combined backup contains both actors and must not be shared as a role disclosure.

The existing submission/finality wait behavior is unchanged. A blocked unknown attempt requires wallet/ledger investigation; no automatic unlock or resubmission is provided. Later workflow actions are outside this preparation change. Neither successful ciphertext storage nor a restored local history proves a payment, authenticates deployed code, or guarantees storage retention. Binary attachment delivery remains separate work.
