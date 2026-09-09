# ADR-0013: Observe journal transaction status through indexer and RPC

Status: accepted, 2026-09-09.

Each journal entry offers an explicit read-only status check. It queries `transactions(offset: {identifier})` and selects the exact identifier, rejecting ambiguous matches. Transaction/block hashes and block heights are validated. The RPC finalized head and canonical block hash are then checked. Results distinguish missing data, inclusion before finality and finalized inclusion; the indexer's result status is displayed verbatim from a constrained status field.

Missing data is unknown, not rejection. A failed or partial indexer result is not relabeled success. A canonical-block mismatch, malformed evidence or service failure produces an error. Every refresh clears the preceding observation; cancellation prevents an obsolete response from replacing newer state. Queries include only the public identifier and no role secrets or report contents. No lookup happens until the user requests it.

Network endpoints are shared with public contract lookup. The observation trusts these indexer/RPC sources; it does not cryptographically authenticate state, bind the transaction to a particular circuit/report/program, prove transferred funds or authorize a retry. Results are timestamped live observations and are not persisted as trusted recovery receipts. There is no background polling or automatic resubmission.

The live Preprod check exposed a schema defect in the preceding journal implementation: transaction identifiers are 33 bytes in the recorded deployment, while block and transaction hashes are 32 bytes. The journal and lookup now accept real 33-byte identifiers, retaining 32-byte compatibility for earlier synthetic backups. Tests exercise a real public identifier; the initial live probe rejected it before any request, and the corrected probe confirmed finalized SUCCESS. Evidence is saved in `docs/evidence/preprod-transaction-observation.json`.

Complete recovery still needs circuit/report association, terminal outcome history, safe semantic retry decisions and native Lace interruption drills. Deployed-role restoration still requires the normal wallet/authority checks before displaying the workspace; an independent offline journal inspector remains future work.
