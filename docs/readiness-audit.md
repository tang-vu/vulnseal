# End-to-end readiness audit

Audit started 2026-09-09 from the current worktree. The goal is a complete, polished project; passing the existing Wave 1 tests alone does not establish that outcome. The September 2 Preprod deployment was independently reverified on September 9: all eight recorded identifiers remain successful and finalized. That recheck is not a new deployment or a production readiness claim.

## Verified implementation improvements

- Browser network mode requires both wallet connection and program deployment. Guided reports cannot silently become network reports.
- Wallet connection/configuration must match the requested network; the SDK network ID is updated on connection, and authorization is rechecked before balancing or submitting. Mobile exposes the wallet control.
- Program form values determine the displayed policy and deployment digests. Severity and private rationale drive the actual acceptance call.
- Vendor and researcher authorization secrets and program identifiers use cryptographic randomness rather than public fixed constants. Both roles still live in the same experimental tab.
- Browser transitions follow contract prerequisites, reject duplicate in-flight actions, expose closure, and retain rejected/failed-retest history.
- Verifier statements describe the actual stage. Transaction identifiers and heights are associated with report events, excluding the deployment transaction. The view explicitly identifies itself as session evidence, not an independent current-state query.
- A failed public-state read after finalization preserves the transaction and offers a read-only retry instead of resubmitting it.
- The ciphertext service publishes complete, flushed files atomically with no overwrite. Concurrent identical uploads are idempotent. Corrupt stored blobs, invalid encodings, missing authentication tags, and storage failures have explicit responses.
- Canonicalization handles Unicode-normalized object keys deterministically, rejects collisions, preserves special object keys, and validates attachment digests and sizes. Decrypted report documents undergo schema normalization before rendering.
- The UI no longer requests external fonts. Production browser journeys are included in CI configuration.
- Private recovery exports password-encrypted session snapshots and restores incomplete drafts or sealed reports. Current network authority/state is checked before restoring; backup history does not become transaction finality evidence. The recovered ciphertext copy permits decryption when storage is unavailable.

See [validation-report.md](validation-report.md) for executed commands and their results. Mocked wallet tests do not establish that the native Lace integration works end-to-end.

## Work still required

| Requirement | Current evidence / gap | Completion evidence needed |
| --- | --- | --- |
| Durable ownership and report recovery | Explicit password-encrypted export/import implemented; schema/report binding and ledger authority checks; fresh-tab recovery and store-unavailable decryption tested; network rejoin tested with mocked providers | Real Lace network recovery, pending-transaction reconciliation, automatic encrypted persistence and backup lifecycle management |
| Independent researcher/vendor operation | Both roles are held by one tab; vendor decrypts using the in-memory researcher key | Separate browser/profile journeys with deliberate encrypted key sharing and no disclosure of actor secrets |
| Public verification from a shareable receipt | UI only knows the current session; independent CLI verification exists for recorded Preprod evidence | Public receipt export/import or shareable URL, contract/report lookup without wallet or private keys, live-state/error/reset handling |
| Multiple reports and program discovery | One report slot; starting another clears its local session state | Persisted scoped program/report selection, independent histories, no loss of earlier ownership material |
| Complete report authoring | Attachment metadata exists in the schema but cannot be entered in the UI; binary uploads remain deferred | Usable attachment-digest input and validation, explicit binary-file handling, draft/reload recovery |
| Native wallet UX | Mocked component tests and separate headless Preprod lifecycle | Real browser deployment/join/submission on a funded test wallet, cancellation/disconnect/wrong-network/refresh recovery, mobile affordances |
| Production ciphertext operations | Local filesystem adapter only; atomic writes and digest checks are tested | Configured deployment, quotas/abuse controls, retention/deletion policy, backup/restore drills, replication and operational health checks |
| Release quality | Expanded unit/browser suites; production build; CI changes only locally validated | Fresh CI run, production artifact inspection, dependency audit, current network re-verification, updated operator and recovery documentation |
| Resolution and adoption roadmap | Wave 2/3 plans are plans, not shipped features | Implement and verify planned escrow/disputes/rotation/update chain/SDK/integrations in their intended scope; real transfers required for payment claims |
| External evidence and publication | Historical Preprod transactions; no evidence of an independent audit or consented pilot in this checkout | Actual review/pilot findings, resolved issues, release hosting, demo artifact and public-link verification; never invent audit, user, or adoption claims |

No overall completion or production-readiness claim is made. Manual encrypted recovery is now implemented, with native-wallet verification and pending-transaction recovery still open. Next priorities are separate-role operation and independent public verification.
