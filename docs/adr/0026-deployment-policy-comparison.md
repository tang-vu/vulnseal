# ADR-0026: Compare saved deployment policy with historical state

Status: Accepted for conditional read-only comparison; authenticated deployment/retry reconciliation remains open.

## Decision

An active role workspace with a recorded constructor intent and v12 deployment snapshot offers **Compare saved deployment policy**. Nothing is fetched until the user clicks. The check requires a successful, finalized transaction with exactly one deployment action, using the existing indexer/RPC block comparison. It then requests the state from that transaction, requiring matching transaction hash, block height/hash, status, action kind and address. Missing or ambiguous evidence is refused.

The state query also requests raw transaction bytes. Before decoding policy, the SDK recomputes their transaction hash and identifiers, requires exactly one actual `ContractDeploy`, checks its address, and compares the complete canonical serialized initial state with the indexer's state. A valid later state of the same contract is therefore refused as deployment evidence. Raw transaction bytes have the existing 2 MiB bound; serialized state input is bounded to 8 MiB of hex text.

The protocol's Compact runtime adapter then decodes the state into the current VulnSeal ledger schema. All seven saved fields are compared locally: program ID, scope and policy digests, and response/disclosure windows. The result names differing fields or reports an exact match. It shows the observed deployment address, block and check time. It never uses the editable program draft as historical intent.

Requests contain the transaction identifier and public RPC parameters, not the saved digests, actor secret, report content or backup. Responses are bounded to 16 MiB for the state query, with a 20-second asynchronous network deadline. The browser runs loading, fetching and synchronous SDK decoding in a dedicated module worker, terminated by a separate 30-second UI deadline. Cancellation, changed inputs, errors and unmounting terminate that worker and discard late results. Browser suspension can delay UI timers; the limit is not a real-time guarantee. The wallet-free inspector does not expose this private-context action.

## Meaning and limits

This binds the compared state to the content of hash/identifier-checked transaction bytes. It still trusts indexer/RPC inclusion and finality and does not authenticate signatures, proofs, constructor execution/arguments, circuit/code identity, vendor authority or policy prose. The result is not persisted, does not save an address, unlock transactions or authorize retry. The separate existing candidate-address shortcut and wallet/authority checks retain their own requirements. No native-wallet transaction is performed by this feature.

The serialized state decoder must use `midnight-js-protocol/compact-runtime`; the ledger-v8 state wrapper is not interchangeable with Compact's charged-state type. Tests decode captured public state, exercise individual field mismatches and inconsistent/ambiguous evidence, and discard cancelled/stale results. A captured historical deployment fixture supports deterministic browser checks with mocked RPC finality. Its successful live GraphQL capture establishes query compatibility at capture time, not proof of inclusion or authenticated state.
