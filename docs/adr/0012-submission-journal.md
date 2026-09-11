# ADR-0012: Persist role submission identifiers before calling the wallet

Status: accepted, 2026-09-09.

A connector can broadcast a transaction and then lose its response. The SDK can also lose the later finality response. Keeping the identifier only in an error or component state does not survive a closed tab.

## Write ordering

The role workspace passes a submission checkpoint into its deployment and joined-session browser providers. The provider obtains the identifier and serialized transaction first, then awaits the checkpoint before invoking the connector. The checkpoint appends the identifier and local timestamp to the current role vault and awaits the existing encrypted IndexedDB writer. It uses the same password, authenticated encryption and atomic revision check as role autosave. Only after persistence succeeds does the wallet submission proceed; wallet authorization/network are checked again after this wait.

Missing autosave, quota errors, stale revisions, malformed identifiers, duplicate identifiers or journal-capacity errors prevent the connector submission call. The checkpoint never persists serialized transactions, witnesses, proof inputs or connector error objects. The vault already supplies the network and program context. The pre-deployment journal remains recoverable with the vendor identity even when the deployment address has not yet been returned. When deployment succeeds, the address update preserves the newly recorded entries.

This is enabled for the independent role workspace. The combined demo's legacy network mode does not register this checkpoint. A role file alone still supports restoration and reading, but real role submissions require active encrypted browser autosave. The workspace checks for an active writer before calling the transaction API and, for deployment, before connecting the wallet. Missing autosave therefore fails before proof work. Persistence is still awaited at the submission boundary because storage can fail or conflict after the initial check.

## Backup compatibility

Existing payload version 1 is accepted unchanged. Recording the first attempt creates payload version 2 with the additional required `submissionAttempts` array. The encrypted envelope and its AAD/KDF remain version 1; the authenticated plaintext schema determines the payload version. Older app revisions reject payload version 2 rather than silently discarding the journal. Journal entries have an exact identifier/timestamp allowlist, unique identifiers and a 200-entry bound. The real Preprod identifiers are 33 bytes; 32-byte identifiers from earlier synthetic fixtures remain accepted. Block and transaction hashes remain 32 bytes. No automatic pruning or history deletion is implemented.

## Meaning and recovery limits

An entry means the app saved an intention to call the wallet. A crash between the save and the call can leave an entry for a transaction never broadcast. A saved entry is therefore neither a success receipt nor evidence of network rejection. The restored UI displays identifiers with an explicit reconciliation label and does not automatically resubmit them. Duplicate identifiers are rejected by the checkpoint; a newly constructed transaction may have a different identifier, so this is not complete semantic retry protection.

Users can reopen the encrypted browser copy or export its encrypted file and inspect identifiers in the wallet/indexer. Automatic transaction lookup, finality reconciliation, circuit/report association, terminal outcome records and safe resubmission policy are still required. A later failure cannot erase the already-persisted identifier. Clearing browser data, eviction or device loss still requires an independent downloaded backup, which may predate the most recent attempt. Native Lace interruption/recovery has not been established by mocked provider tests.

## Errors after a checkpoint

The active role session disables further transactions when any submission action fails after its durable checkpoint, including an ordinary SDK/transport error as well as the confirmation deadline. The checkpoint identifier remains available after the wait closes. The workspace clears the connected session and ledger view while retaining the vault, journal and backup controls; it does not replace the original error or record a failed/finalized outcome. Reconnect and deployment-address shortcuts stay unavailable in that session.

Ordinary errors before the checkpoint do not trigger this uncertainty lock; expiry of the preparation deadline below is a conservative exception. In particular, a rejected encrypted save prevents the wallet callback from proceeding. A post-checkpoint error could also be a wallet rejection or a failed reauthorization before submission; the generic exception alone cannot establish that, so the same conservative lock applies. Reopening a workspace is not reconciliation or permission to retry. Durable cross-session retry policy and native-wallet interruption evidence remain open.

## Operation context extension

[ADR 0017](0017-submission-intent-context.md) extends new entries with local circuit/report intent in payload version 5, while preserving unknown intent for older entries. This does not authenticate transaction contents or make retries safe.


## Preparation and checkpoint lifetime

Each `duringSubmission` action has a 15-minute preparation deadline from entry until its durable checkpoint. After the checkpoint, a separate 10-minute confirmation deadline begins. This bounds the wrapped SDK deployment/execute call, not earlier wallet connection, input construction or later public reads, which retain their own existing behavior. Expiry closes the wait immediately; the same wait cannot be reused. Workspace unmount also closes it.

The checkpoint captures its wait and operation context before asynchronous journal preparation, checks that wait before writing, and uses that captured wait after persistence. It cannot use an optional reference that may have been cleared or replaced. A checkpoint arriving after expiry/unmount cannot authorize the subsequent connector broadcast.

Preparation expiry disables transactions in the active session, clears its connected session/ledger view and remounts the local-storage panel to stop the old autosave writer. This blocks queued stale saves and late persistence continuations from reviving the old submission. The open vault and file-backup controls remain available. A storage transaction already started may still commit a journal entry; retain the latest browser copy and inspect it separately. No failed/successful on-chain outcome is inferred and no automatic retry is provided.

Local tests hold either the SDK before its checkpoint or the journal's storage completion, expire the preparation wait, then release that work. The broadcast continuation remains uncalled in both cases; the latter retains the committed encrypted identifier. These are mocked provider/storage boundary checks, not native Lace cancellation or proof that an already invoked wallet operation can be undone. Browser/OS scheduling can delay timer execution. The combined demo still does not register this durable identifier checkpoint.


### Check elapsed deadlines at continuations

The preparation/confirmation wait stores both monotonic (`performance.now`) and wall-clock (`Date.now`) deadlines when each phase starts. Reaching either deadline expires the phase. It checks them before accepting a checkpoint and before returning a resolved SDK result, in addition to the scheduled timer. A late SDK rejection is also classified as the expired phase. Thus a resumed promise cannot win merely because the timer callback has not been dispatched, and moving wall time backward does not extend a wait whose monotonic deadline has passed.

The same preparation-expiry session lock and writer stop apply when the checkpoint/result discovers expiry; confirmation expiry retains its saved identifier and unknown-outcome semantics. A forward wall-clock adjustment may expire a wait conservatively. Neither these checks nor a timer guarantee execution while the browser is suspended; they reject the late continuation when application code resumes. Tests control clocks/callback order rather than claiming a physical suspend/resume or native-wallet drill.


### Proof and wallet continuation deadlines

Browser proof generation, wallet setup, authorization, balancing and post-checkpoint submission share an elapsed-time guard (`continuationDeadline`). Proof generation retains its ten-minute limit, forwards the original transaction/configuration and rejects a late proof before returning it to SDK callers; the proof server may keep working because the SDK has no operation-wide cancellation signal. Each phase records wall and monotonic deadlines. It rechecks them before returning a result, when handling a rejection, and at each setup continuation. Reaching either clock expires the phase even if the timer callback has not run. Timely errors keep their original identity; late connector resolve/reject outcomes retain the transaction identifier as unknown.

The submission callback receives an explicit `assertActive` function alongside its abort signal. The browser provider invokes it after its final authorization read and immediately before `submitTransaction`, so a delayed timer cannot allow a late authorization to start broadcast. The connector deadline still starts after durable checkpoint persistence. A broadcast already invoked can continue; the guard cannot cancel it. Setup does not install a late network/configuration, and a late balance is not deserialized or forwarded to submission.

Wallet discovery uses monotonic elapsed time for its 1.5-second search window and checks the parent setup guard while polling. Wall time moving backward cannot extend that discovery window. A forward wall-clock adjustment may expire a wallet phase conservatively. These checks govern JavaScript continuations; physical suspend/resume, native-wallet behavior and a hard real-time bound remain unverified. No retry authorization is inferred from a timeout.
