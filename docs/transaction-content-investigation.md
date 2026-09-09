# Raw transaction evidence for report reconciliation

Inspected on 2026-09-09 using the installed Midnight protocol ledger SDK and the official Preprod indexer. This is implementation groundwork for report-effect reconciliation, not a shipped report verifier.

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

All six captured calls replayed successfully. Each changed one report, with status transitions absent → COMMITTED → TRIAGED → ACCEPTED → PATCH_READY → RETEST_PASSED → PAYOUT_AUTHORIZED. This replay does not transfer tokens or prove a payout. It verifies transcript execution conditional on the supplied source data, not signatures, proofs, authenticated block inclusion, deployed code identity, or the provenance of the previous state. It compares contract data, not maintenance authority, verifier definitions or token balances.

A query at block 2371913 returned no contract action, even though there had been an earlier call. The collector therefore uses the known previous transaction identifier; it does not assume a block-offset lookup returns the latest earlier state. General previous-action discovery, intervening transactions, partial/multiple actions, current cost-model selection and browser integration remain open.

## Remaining implementation and evidence

- Extend the SDK replay beyond the captured successful single-call chain; no heuristic byte matching is needed for the implemented replay.
- Bind the write path, map key, record commitment and contract/schema together; account for multiple calls and transaction segments.
- Preserve distinctions between guaranteed/fallible effects and per-segment success. Matching a circuit name or decoding a proof-bearing object is not proof verification.
- Exercise negative cases with unrelated report reads, changed map paths, duplicate writes/calls, partial failures and incompatible contract layouts.
- Add rejection, closure and failed-retest/replacement-patch coverage. These branches are absent from this captured network fixture and must not be described as live-verified.
- Integrate a bounded, explicit browser check with clear source trust and outcome limits before using it for recovery decisions. This collector makes no retry decision and changes no browser flow.
