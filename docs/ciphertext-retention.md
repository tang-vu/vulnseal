# Ciphertext retention and removal policy

Status: repository policy for the current experimental service. A production operator must adopt an explicit service agreement and implement the removal controls below before advertising expiry or deletion guarantees. This document does not enable deletion or change a running store.

## Current retention behavior

Committed ciphertext has no automatic expiry. Neither quota exhaustion, report rejection/closure, wallet disconnection nor a failed health check authorizes eviction. A full store refuses new unique blobs while preserving reads and identical reuploads. Filesystem and SQLite follow the same policy. Their quotas measure logical ciphertext, not all physical storage usage.

The service has no report-owner account, tenant identifier, consent record or expiry timestamp. A SHA-256 address identifies bytes; possession of that address, ciphertext, a receiving key or a public report receipt does not authenticate a deletion request. The browser's three-endpoint limit does not mean that only three copies exist.

The default offers no minimum availability period, regional independence, secure erasure or deletion deadline. A successful PUT, replicated upload or verified backup is not such a promise. Users should keep separately protected report keys and recoverable encrypted copies for as long as they need the report.

## Data locations and responsibility

| Data | Current location and behavior | Removal responsibility |
| --- | --- | --- |
| Ciphertext blobs | Filesystem files or SQLite rows; immutable while present | Each store operator; no HTTP DELETE endpoint exists |
| Portable store backups | Ciphertext plus digest/size inventory and creation time; no report keys | Each backup custodian, including copied archives and storage snapshots |
| Role and demo backups | Encrypted actor authority, report keys, salts, drafts and ciphertext may be included | Each participant controlling browser copies and downloaded files |
| Recipient handoffs and receiving-key backups | Files exchanged outside the app | Each sender/recipient; possession is not vendor authority |
| Public ledger records | Commitments, workflow metadata and public receipts | Store deletion does not remove or rewrite these records |
| HTTP/metrics/log metadata | Fixed-cardinality application metrics; host/proxy logs depend on deployment | Each infrastructure operator must define access and expiry |

Deleting a browser catalog entry affects that entry at that origin. It does not delete downloads, another profile, replicas, recipient copies or public ledger history. Locking a workspace does not delete persisted copies.

## Handling a removal request

1. Record an opaque case ID and exact ciphertext digests in a restricted operator record. Keep requestor authentication and authorization evidence in the operator's established private channel. Do not request actor secrets, report keys, salts or plaintext to authorize removal. Keep digests and case details out of public issues, metrics labels and CI artifacts.
2. Establish the authorized operator, covered copies, request purpose and agreed retention commitments. Distinguish availability maintenance with a retained recovery backup from removal of all operator-controlled recoverable copies. Receiving keys and public transactions alone are insufficient authority. If authority or scope is unresolved, keep the request pending and preserve the data.
3. Inventory every controlled primary, replica, portable backup, volume snapshot and export containing the selected bytes. Keep locations private. Independent custodians require separate action through the agreed channel; the app does not contact them. Mark outside copies unverified rather than claiming deletion.
4. Prevent uploads, replication/backfill and restore jobs from reintroducing selected digests during the operation. Stop affected writers and confirm they have drained before offline changes; respect the directory lease. Follow the operator's service agreement for maintenance. Configure the retirement policy below on every covered service and restore command before resuming; an unconfigured replica or restore remains able to reintroduce data.
5. Perform only separately authorized, backend-specific removal against the exact inventory. There is currently no supported selective-removal CLI. Do not improvise live SQLite edits, delete a whole volume to remove one report, or treat quota pressure as approval. Availability maintenance should retain a verified recovery backup; a removal request must explicitly account for that backup instead of silently creating a new indefinite copy.
6. Check each covered location. GET absence is an availability check, not physical-erasure evidence. Verify unrelated reports still return their original digests and decrypt with separately held test keys; check readiness against remaining quota. Verify rewritten/restored inventories before serving them. Do not restore an old archive directly into service if it contains digests approved for removal.
7. Record actual removals, retained copies, failures and outside scope, with timestamps, tool/version and private evidence references. Return that bounded result through the agreed private channel. Keep failed replicas and unresolved backups open. This repository performs no automatic retry or public notification.

## Preventing reintroduction

Production removal needs a protected registry of retired digests, enforced by uploads, explicit backfill, migration and restore before serving data. Digests are correlation metadata: restrict registry access and specify its retention and recovery. Do not expose a public listing endpoint.

An optional operator-owned retirement file now enforces a fixed policy snapshot in the HTTP server and backup restoration. Registry administration, authenticated request handling, selective removal and cross-operator coordination are **not implemented**. Without the configured policy, a historical backup can restore all its ciphertext and an upload can recreate a missing blob. Manifest verification proves archive consistency, not compliance with a later removal request. The incomplete-restore marker is a separate control.

## Configure the retirement guard

Create a private UTF-8 JSON file outside the data directory and repository, readable by the service account and writable only by its authorized operator:

```json
{
  "format": "vulnseal-retired-ciphertext",
  "version": 1,
  "digests": ["abababababababababababababababababababababababababababababababab"]
}
```

The illustrated digest is synthetic; replace it with the separately approved inventory. The format accepts only these fields, version 1 and up to 100,000 unique lowercase 64-character hex digests. The regular file must be at most 8 MiB with valid UTF-8. Empty inventories are allowed. An explicitly configured missing, malformed, oversized or unreadable file prevents startup/restore; it never becomes an empty policy on error.

Build the current cipherstore, then set `CIPHERSTORE_RETIREMENT_FILE` to the absolute filename in the environment of both `node cipherstore/dist/index.js` and every `backup.js restore` / `restore-sqlite` invocation. The CLI does not automatically load the root `.env` file. Docker users can combine `infra/cipherstore.yml` with `infra/cipherstore-retirement.yml`; set that variable to the absolute host filename. The override binds the existing file read-only at `/run/vulnseal/retired-ciphertext.json`, alongside the data volume. It refuses to create a missing host path. Rebuild the image before using newly added policy support.

Policy is read once before startup or restoration and held as an immutable in-memory snapshot. Stop writers, replace the approved policy and restart/recreate services when changing it; there is no hot reload. Protect and back up the current policy independently of historical ciphertext archives. Configure the same approved inventory on every covered replica and restore runner. Omitting the environment variable disables this optional guard; removing configuration is not an authorized removal of the policy.

For listed digests, GET returns the ordinary 404 response and PUT returns 410 `blob_retired` without reading or writing the adapter. Explicit backfill and retries through that service are refused too. PUT's response reveals retirement of the requested digest; there is no inventory-listing endpoint. Other digests retain normal behavior. Listed data still exists, still consumes quota and can remain in backups; this is **access restriction, not deletion**. Local encrypted copies and unconfigured replicas remain readable to their holders.

Restore verifies the backup and rejects the entire operation if any entry is retired, before creating the destination. It never silently drops entries or reports a partial restore as complete. Backup creation and verification continue to preserve/check the original archive; they neither filter retired content nor bundle the current policy. Selective rewriting remains future work. Library embedders must explicitly supply a `RetirementPolicy` to `createCipherstoreServer` and as the fourth argument of `restoreCipherstoreBackup`; raw adapters do not enforce it themselves.

## Storage-specific limits

Unlinking a filesystem entry does not establish erasure from hard links, snapshots, journals, SSD media or other copies. Deleting a SQLite row does not establish erasure from free pages, journals, volume snapshots or backups, nor immediate space reclamation. No secure-erasure procedure has been validated here.

The service never owns report decryption keys and cannot promise that deleting a service-side key makes a report unreadable. Participants may retain keys and encrypted or decrypted copies. Public commitments and workflow metadata remain independent of ciphertext availability.

## Evidence required before production claims

A service agreement must identify its accountable operator, covered stores/regions, request authentication, retention duration and trigger, backup/snapshot expiry, response/completion targets, log retention and treatment of independent copies. These are deployment decisions; this repository has no values to infer for them.

Required implementation evidence includes authorized selective removal for both backends, a protected retired-digest registry enforced by upload/backfill/restore, interrupted-operation recovery, and a drill covering multiple stores plus an older backup. Show selected data absent at every covered location, reintroduction refused, unrelated ciphertext verified, and partial failures reported without a global success claim. Use synthetic reports. Independent operational review and actual configured service evidence remain necessary.

See [operations](cipherstore-operations.md), [backup/migration](cipherstore-adapters.md), [replication](cipherstore-replication.md) and the [readiness audit](readiness-audit.md).
