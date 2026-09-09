# Raw transaction evidence for report reconciliation

Inspected on 2026-09-09 using the installed Midnight protocol ledger SDK and the official Preprod indexer. A conditional report-effect check is now available in browser recovery journals; it does not establish retry safety or authenticate source history.

## Reproducible collector

Run `npm run preprod:inspect-transactions -w @vulnseal/integration` to query the historical contract lifecycle identifiers from `docs/evidence/preprod-indexer-verification.json`. It is read-only and needs no wallet credentials. Add `-- --write-fixture` to replace `docs/evidence/preprod-raw-transactions.json` after every requested transaction passes the checks. The default invocation only prints a summary. It skips the separate NIGHT-to-DUST registration because that is not a VulnSeal contract operation.

The collector checks exact indexer identifier matches, the retained transaction hashes, SDK deserialization with signature/proof/binding markers, the hash recomputed from the raw transaction and its recomputed identifiers. It records public serialized bytes and a projection of call addresses, entry points, segment IDs and transcript operation counts. Decode input is limited to 2 MiB. It does not verify signatures, zero-knowledge proofs, Merkle inclusion or live finality; existing independent indexer/RPC observations cover their explicitly documented scope. The constructor has zero `ContractCall` entries, as expected for a deployment; this projection does not verify its deployed program definition.

The captured fixture has seven transactions: constructor, submitReport, beginTriage, acceptReport, anchorPatch, submitRetest and authorizePayout. Six contain one contract call. The fixture is public testnet data, not a private role backup or report payload. Its synthetic report ceremony is described in the original lifecycle evidence.

## Findings

`ContractCall` exposes guaranteed/fallible transcript programs through the installed ledger API. In the captured authorizePayout transaction, the guaranteed transcript reads a report record and writes its replacement. The generated VulnSeal ledger accessor maps `reports` to root slot 9. The observed map key and record commitment are `9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db`. The corresponding read/write record has 14 aligned values, including the public status transition from 5 to 7 and the changed sequence/payout fields.

This establishes that relevant data is available; searching for those bytes anywhere in a transcript would not prove the intended report was updated. Byte occurrences may be reads, unrelated values or data in another contract/segment. Current-state lookup alone also cannot attribute a change to one transaction when other transactions intervene.

## SDK replay implemented for the captured successful calls

`npm run preprod:replay-transactions -w @vulnseal/integration` now retrieves the historical contract state at each known transaction identifier and replays the next captured call with `QueryContext.runTranscript`. Add `-- --write-fixture` to retain the checked states/results in `docs/evidence/preprod-transcript-replay.json`. The default command only prints results. Both commands are read-only on the network.

The implementation binds raw bytes to the retained hash/identifier, requires exactly one contract action with the requested address/circuit, and requires SUCCESS metadata. The official SDK maps SUCCESS to `SucceedEntirely`; the indexer schema supplies segment details for partial success, so a null segment list on SUCCESS is supported. If a segment list is supplied, the target segment must appear once with success. Partial or failed transactions are currently rejected rather than partially replayed.

The VM executes the guaranteed/fallible transcripts against the supplied prior state using the initial cost model. Its complete resulting contract **data** state must equal the supplied subsequent data state. Only then are both states decoded with the generated VulnSeal ledger schema and changed report records returned. Ledger and onchain-runtime WASM objects are bridged through their encoded state representation; passing their classes interchangeably fails.

Raw decoding and replay now live in the exported API subpaths `transaction-content` and `replay-report-transaction`. The integration modules re-export them, so the collectors and browser worker share one implementation. The core uses Uint8Array encoding helpers instead of Node Buffer. Data-state comparison uses the SDK's canonical serialization: serialize the supplied post-state, replace only its data with the replay result in that local container, then compare the serialized bytes. Other container fields are held fixed in both serializations, not authenticated by this comparison. Report comparison checks each generated field, comparing byte arrays by contents and scalar fields by value; Node's `util` module is no longer required. A test runs the shared replay with the global Buffer removed; the production browser worker is exercised separately below.

All six captured calls replayed successfully. Each changed one report, with status transitions absent → COMMITTED → TRIAGED → ACCEPTED → PATCH_READY → RETEST_PASSED → PAYOUT_AUTHORIZED. This replay does not transfer tokens or prove a payout. It verifies transcript execution conditional on the supplied source data, not signatures, proofs, authenticated block inclusion, deployed code identity, or the provenance of the previous state. It compares contract data, not maintenance authority, verifier definitions or token balances.

A query at block 2371913 returned no contract action, even though there had been an earlier call. The original collector therefore uses the known previous transaction identifier; it does not assume a block-offset lookup returns the latest earlier state. Current cost-model selection and partial/multiple actions remain open. Later discovery and browser integration are described below.

## Bounded predecessor discovery

The API's `findPreviousContractAction` subscribes to `contractActions` from the deployment **block** offset. Unlike the HTTP state query, this subscription accepts `BlockOffset`, not `ContractActionOffset`. It retains only the preceding action and stops when the exact requested identifier appears. It requires a deployment at the requested start height, the expected contract, strictly increasing block heights and successful action results. Same-block/unordered histories are refused pending more precise ordering support. Missing, failed, foreign, excessive or interrupted streams do not return a guessed predecessor.

The default limits are 20 seconds, 1,000 actions and 65,536 characters per message; the caller can cancel. The scan closes its subscription/socket on completion or error, and sends no wallet or private report data. It uses standard WebSocket APIs and is exported independently of the ledger SDK. These are client scan limits, not a whole-process network-buffer ceiling. The stream's ordering/completeness is still trusted metadata, not cryptographically authenticated history.

`npm run preprod:discover-replay -w @vulnseal/integration` selects the recorded historical payout-authorization target, obtains its deployment height through the indexer's call/deployment relationship, discovers its predecessor through the stream, fetches that predecessor's state by transaction hash, and replays the target. It does not select the predecessor from the stored lifecycle list. Add `-- --write-evidence` to retain the resulting metadata/report change. The live run consumed seven actions, discovered submitRetest at block 2371904 before authorizePayout at block 2371914, and reproduced the report's 5 → 7 transition. Evidence is in `docs/evidence/preprod-discovered-replay.json`. This command does not independently verify finality or history completeness and does not authorize retry.

## Browser recovery journal check

Entries containing a contract address and saved report-operation intent expose **Reconcile this report operation → Check report effects** in both the active role workspace and wallet-free journal inspector. Only an explicit click starts retrieval. A dedicated module worker receives public identifiers and endpoints, checks successful finalization with the existing observer, retrieves the raw target and deployment height, discovers the predecessor, cross-checks history against target metadata and RPC block hashes, and invokes the shared SDK replay. It requires the exact saved program ID and exactly one changed report with the recorded report ID. No wallet, actor secret, backup password, ciphertext or report key is passed to the worker.

New evidence fetches have a 20-second deadline and a streamed 16 MiB response cap. The history scan retains its own limits. The UI terminates the worker on cancellation, identity change, unmount or a 90-second overall deadline, including during synchronous WASM work. These bounds are not a whole-process memory guarantee; the initial transaction observer retains its existing JSON response handling. Results are ephemeral and do not update journal entries or authorize another transaction.

The production worker replays the captured authorization transaction on desktop Chrome and Pixel 7 emulation, reaching RETEST_PASSED → PAYOUT_AUTHORIZED, and rejects a different report. The full encrypted-journal UI test uses a valid synthetic role backup and verifies rejection of a different program and cancellation. The historical headless lifecycle used a digest that is not a canonical browser report document, so it cannot honestly supply a positive valid-role-backup fixture. Native Lace recovery with a real browser-authored report remains required.

Production bundling initially omitted the ledger WASM initializer while retaining its deserializer. An explicit dynamic import of the ledger package before the replay module fixes this; the browser test executes the emitted worker and actual WASM rather than mocking replay. The check retains the initial cost-model assumption, source-trust limits and single successful-call restrictions described above.

## Remaining implementation and evidence

- Extend the SDK replay beyond the captured successful single-call chain; no heuristic byte matching is needed for the implemented replay.
- Bind the write path, map key, record commitment and contract/schema together; account for multiple calls and transaction segments.
- Preserve distinctions between guaranteed/fallible effects and per-segment success. Matching a circuit name or decoding a proof-bearing object is not proof verification.
- Exercise negative cases with unrelated report reads, changed map paths, duplicate writes/calls, partial failures and incompatible contract layouts.
- Add rejection, closure and failed-retest/replacement-patch coverage. These branches are absent from this captured network fixture and must not be described as live-verified.
- Exercise the browser check with a valid native-wallet role backup and extend intended-argument matching before designing recovery decisions. Neither the browser check nor the collectors make a retry decision.
