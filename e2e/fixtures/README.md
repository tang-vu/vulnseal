# Public ledger fixture

`preprod-public-state.json` is a read-only GraphQL response captured on 2026-09-09 from `https://indexer.preprod.midnight.network/api/v4/graphql` for contract `83c5aa340bd149b447c873fc2eecc4a9dadd183e5b26f9c3784e4c9acdaba9eb`.

It contains the serialized public contract state and latest successful action at block 2371914, hash `71acb36d1d46364ca4fca5b6f30ed9bf5f4538fd262dabc772adafa02a5e5585`. The query is in `web/src/public-verification.ts`. No private witness, report plaintext, wallet secret or recovery file is included.

Unit and browser tests replay this response with mocked RPC replies. They exercise the real ledger deserializer but do not establish live network availability. The independent live check is separately documented in `docs/validation-report.md`.
