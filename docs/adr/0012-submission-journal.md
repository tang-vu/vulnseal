# ADR-0012: Persist role submission identifiers before calling the wallet

Status: accepted, 2026-09-09.

A connector can broadcast a transaction and then lose its response. The SDK can also lose the later finality response. Keeping the identifier only in an error or component state does not survive a closed tab.

## Write ordering

The role workspace passes a submission checkpoint into its deployment and joined-session browser providers. The provider obtains the identifier and serialized transaction first, then awaits the checkpoint before invoking the connector. The checkpoint appends the identifier and local timestamp to the current role vault and awaits the existing encrypted IndexedDB writer. It uses the same password, authenticated encryption and atomic revision check as role autosave. Only after persistence succeeds does the wallet submission proceed; wallet authorization/network are checked again after this wait.

Missing autosave, quota errors, stale revisions, malformed identifiers, duplicate identifiers or journal-capacity errors prevent the connector submission call. The checkpoint never persists serialized transactions, witnesses, proof inputs or connector error objects. The vault already supplies the network and program context. The pre-deployment journal remains recoverable with the vendor identity even when the deployment address has not yet been returned. When deployment succeeds, the address update preserves the newly recorded entries.

This is enabled for the independent role workspace. The combined demo's legacy network mode does not register this checkpoint. A role file alone still supports restoration and reading, but real role submissions require active encrypted browser autosave. The check happens at the submission boundary; proving/balancing may already have occurred when autosave is unavailable.

## Backup compatibility

Existing payload version 1 is accepted unchanged. Recording the first attempt creates payload version 2 with the additional required `submissionAttempts` array. The encrypted envelope and its AAD/KDF remain version 1; the authenticated plaintext schema determines the payload version. Older app revisions reject payload version 2 rather than silently discarding the journal. Journal entries have an exact identifier/timestamp allowlist, unique 32-byte identifiers and a 200-entry bound. No automatic pruning or history deletion is implemented.

## Meaning and recovery limits

An entry means the app saved an intention to call the wallet. A crash between the save and the call can leave an entry for a transaction never broadcast. A saved entry is therefore neither a success receipt nor evidence of network rejection. The restored UI displays identifiers with an explicit reconciliation label and does not automatically resubmit them. Duplicate identifiers are rejected by the checkpoint; a newly constructed transaction may have a different identifier, so this is not complete semantic retry protection.

Users can reopen the encrypted browser copy or export its encrypted file and inspect identifiers in the wallet/indexer. Automatic transaction lookup, finality reconciliation, circuit/report association, terminal outcome records and safe resubmission policy are still required. A later failure cannot erase the already-persisted identifier. Clearing browser data, eviction or device loss still requires an independent downloaded backup, which may predate the most recent attempt. Native Lace interruption/recovery has not been established by mocked provider tests.
