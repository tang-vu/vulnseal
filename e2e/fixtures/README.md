# Public ledger fixture

`preprod-deployment-state.json` is the response to the `DeploymentPolicy` query in `web/src/deployment-verification.ts`, captured read-only on 2026-09-10 from the same Preprod indexer. It contains the one deployment action for transaction identifier `00b43beb1f533b27d1c08a1aa0c229ed192c05cbc727486661d125f09e6e460c0c`, transaction hash `8e5cad796ba2eeb7f6e07424d8478ce95a0428a916c492e6e689a5ce09bc7957`, at block 2371845. This public state contains no saved vendor authority or private backup. Browser tests pair it with mocked RPC replies and synthetic local intent; they do not establish current finality or native-wallet execution.

`preprod-public-state.json` is a read-only GraphQL response captured on 2026-09-09 from `https://indexer.preprod.midnight.network/api/v4/graphql` for contract `83c5aa340bd149b447c873fc2eecc4a9dadd183e5b26f9c3784e4c9acdaba9eb`.

It contains the serialized public contract state and latest successful action at block 2371914, hash `71acb36d1d46364ca4fca5b6f30ed9bf5f4538fd262dabc772adafa02a5e5585`. The query is in `web/src/public-verification.ts`. No private witness, report plaintext, wallet secret or recovery file is included.

Unit and browser tests replay this response with mocked RPC replies. They exercise the real ledger deserializer but do not establish live network availability. The independent live check is separately documented in `docs/validation-report.md`.
