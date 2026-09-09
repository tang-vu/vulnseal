# Raw transaction evidence for report reconciliation

Inspected on 2026-09-09 using the installed Midnight protocol ledger SDK and the official Preprod indexer. This is implementation groundwork for report-effect reconciliation, not a shipped report verifier.

## Reproducible collector

Run `npm run preprod:inspect-transactions -w @vulnseal/integration` to query the historical contract lifecycle identifiers from `docs/evidence/preprod-indexer-verification.json`. It is read-only and needs no wallet credentials. Add `-- --write-fixture` to replace `docs/evidence/preprod-raw-transactions.json` after every requested transaction passes the checks. The default invocation only prints a summary. It skips the separate NIGHT-to-DUST registration because that is not a VulnSeal contract operation.

The collector checks exact indexer identifier matches, the retained transaction hashes, SDK deserialization with signature/proof/binding markers, the hash recomputed from the raw transaction and its recomputed identifiers. It records public serialized bytes and a projection of call addresses, entry points, segment IDs and transcript operation counts. Decode input is limited to 2 MiB. It does not verify signatures, zero-knowledge proofs, Merkle inclusion or live finality; existing independent indexer/RPC observations cover their explicitly documented scope. The constructor has zero `ContractCall` entries, as expected for a deployment; this projection does not verify its deployed program definition.

The captured fixture has seven transactions: constructor, submitReport, beginTriage, acceptReport, anchorPatch, submitRetest and authorizePayout. Six contain one contract call. The fixture is public testnet data, not a private role backup or report payload. Its synthetic report ceremony is described in the original lifecycle evidence.

## Findings

`ContractCall` exposes guaranteed/fallible transcript programs through the installed ledger API. In the captured authorizePayout transaction, the guaranteed transcript reads a report record and writes its replacement. The generated VulnSeal ledger accessor maps `reports` to root slot 9. The observed map key and record commitment are `9532de6702d6c00cab759d61e7424340904065ae6c7bda44ff562fb248ca74db`. The corresponding read/write record has 14 aligned values, including the public status transition from 5 to 7 and the changed sequence/payout fields.

This establishes that relevant data is available; searching for those bytes anywhere in a transcript would not prove the intended report was updated. Byte occurrences may be reads, unrelated values or data in another contract/segment. Current-state lookup alone also cannot attribute a change to one transaction when other transactions intervene.

## Remaining implementation and evidence

- Interpret the relevant VM operations, or recognize a strictly specified supported transcript structure, and reject unsupported layouts rather than guessing from a byte match.
- Bind the write path, map key, record commitment and contract/schema together; account for multiple calls and transaction segments.
- Preserve distinctions between guaranteed/fallible effects and per-segment success. Matching a circuit name or decoding a proof-bearing object is not proof verification.
- Exercise negative cases with unrelated report reads, changed map paths, duplicate writes/calls, partial failures and incompatible contract layouts.
- Add rejection, closure and failed-retest/replacement-patch coverage. These branches are absent from this captured network fixture and must not be described as live-verified.
- Integrate a bounded, explicit browser check with clear source trust and outcome limits before using it for recovery decisions. This collector makes no retry decision and changes no browser flow.
