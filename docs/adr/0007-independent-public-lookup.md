# ADR-0007: Independent public lookup and shareable receipts

Status: accepted, 2026-09-09.

The session timeline records actions observed by one browser. An outside observer needs a separate way to read the current public ledger without that session, its wallet, or its private recovery file.

The independent verifier queries the configured indexer's latest contract action, requires a successful transaction, and decodes its state using the generated VulnSeal ledger schema. It checks the action's block height against the RPC finalized head and requires the RPC canonical block hash to match the indexer. Requests omit credentials and referrers, time out after 20 seconds, and are cancelled when inputs change or the screen closes. Missing contracts (including test-network resets), unavailable services, mismatched blocks/digests and incompatible state produce errors rather than successful verification.

This is a source-trusting current-state check. A matching finalized block does not independently authenticate the indexer's serialized state, authenticate the deployed circuit code, or reconstruct a historical timeline. Exploit validity and funds transfer are not proven. Preprod remains resettable.

Public receipts have an exact versioned allowlist: kind, version, network, contract address, report commitment and ciphertext digest. They contain no plaintext, actor secrets, salts, encryption keys or recovery payload. Network sessions can download them; the independent verifier imports them or accepts equivalent URL fragment parameters. A verified report produces a selectable share link. Query parameters and URL credentials are removed when generating links. Fragments are not sent as HTTP request targets, but anyone receiving the link can see and correlate its public identifiers.

Receipts never choose arbitrary service endpoints. Preprod uses the official indexer/RPC; local uses configured local endpoints; other networks require matching build-time configuration. Lookup requires an explicit button click. It does not fetch ciphertext, connect a wallet, request proofs or submit transactions. A private recovery file is rejected by the receipt parser and must not be used for sharing.

Validation uses a captured public Preprod state with deterministic service mocks, actual runtime deserialization, negative finality/digest/schema cases, and fresh-browser receipt/link journeys on desktop and mobile. Separate live browser evidence is recorded in the validation report; mock tests alone are not described as live network verification.
