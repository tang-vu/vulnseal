# Preprod evidence

Status: **deployed and independently verified on Midnight Preprod** on 2026-09-02.

- Contract: [`83c5aa34…a9eb`](https://preprod.midnightexplorer.com/contracts/0x83c5aa340bd149b447c873fc2eecc4a9dadd183e5b26f9c3784e4c9acdaba9eb)
- Final public status: `PAYOUT_AUTHORIZED`
- Lifecycle evidence: [preprod-lifecycle.json](evidence/preprod-lifecycle.json)
- Independent indexer/RPC snapshot: [preprod-indexer-verification.json](evidence/preprod-indexer-verification.json)

The ceremony used Compact-generated proof material and the official proof server `8.1.0`. The host ran that official image under ARM64 QEMU because its older x86 CPU cannot execute the published amd64 binary. Emulation changes performance, not the proof or transaction semantics.

## Transaction trail

Midnight.js returns a contract-action identifier, while Midnight Explorer routes use the enclosing transaction hash. Both values were obtained from the official Preprod indexer and are recorded in the JSON verification snapshot.

| Action | SDK identifier | Block | Explorer transaction |
| --- | --- | ---: | --- |
| NIGHT→DUST registration | `00aa501c…263ca` | 2371834 | [`270c93a6…6e8a`](https://preprod.midnightexplorer.com/transactions/0x270c93a6ac5abbeb218f651cc79fca2b8f395b91645294c1229de246ce9e6e8a) |
| `constructor` | `00b43beb…60c0c` | 2371845 | [`8e5cad79…7957`](https://preprod.midnightexplorer.com/transactions/0x8e5cad796ba2eeb7f6e07424d8478ce95a0428a916c492e6e689a5ce09bc7957) |
| `submitReport` | `0000aff5…8c94b` | 2371859 | [`884d714a…c66f`](https://preprod.midnightexplorer.com/transactions/0x884d714ad8891fbfc2c445631460f140c3e9f24918877e15fc9745947245c66f) |
| `beginTriage` | `00858bca…79a45b` | 2371867 | [`ba647038…1f5d`](https://preprod.midnightexplorer.com/transactions/0xba647038b8a4bd0d39ee5430010181fe4f5983d1c4c2de37206b6ca35aab1f5d) |
| `acceptReport` | `00b7332a…90186` | 2371877 | [`950fec84…6f6b`](https://preprod.midnightexplorer.com/transactions/0x950fec84cb4c1b856d74020e4ceac81cbce5fefaf63ecbc13495429cc05b6f6b) |
| `anchorPatch` | `00cd6f76…d6e3d1` | 2371889 | [`707bc0e6…5363`](https://preprod.midnightexplorer.com/transactions/0x707bc0e666a752c195527360718d9a54d2f1290330f30a6e5fd1c19468875363) |
| `submitRetest` | `006d248e…cac204` | 2371904 | [`a6dd702b…333c`](https://preprod.midnightexplorer.com/transactions/0xa6dd702be56efb240d6c7eeab572495067d4d0493342bdb32eec1f1d9d38333c) |
| `authorizePayout` | `00315eaa…de2c19` | 2371914 | [`8e02f5bd…d3a271`](https://preprod.midnightexplorer.com/transactions/0x8e02f5bd2405c40e7fc0e6577dda80c8a8d23c2f6667ea0de3fdfb3599d3a271) |

Every row returned `SUCCESS`. The latest indexed action for the contract was the payout-authorization call at block 2371914. At independent verification time, the official RPC reported finalized head 2371964, so the complete lifecycle was below the finalized head.

## Privacy and claim checks

The final report record exposed only:

`ciphertextDigest`, `commitment`, `createdSequence`, `decisionDigest`, `patchCommitment`, `payoutReceipt`, `researcherKey`, `retestCommitment`, `retestPassed`, `rewardTier`, `severity`, `status`, `submissionReceipt`, and `updatedSequence`.

The runner rejected the result if any plaintext report field, contact, reproduction step, impact text, or report salt appeared in that public shape. The synthetic test payload contained no real vulnerability. Wallet seed, private-state password, witnesses, report salt, and wallet checkpoint remain Git-ignored and are absent from the evidence files.

`PAYOUT_AUTHORIZED` is only a workflow authorization receipt. No token escrow or funds transfer occurred or is claimed.

## Independent verification method

Run `npm run preprod:verify` from a clean checkout. It requires no seed, wallet, faucet balance, or proof server and fails if any recorded identifier/hash/block/status no longer matches or if the lifecycle tip is above the current finalized head.

1. Query each SDK identifier with `transactions(offset: { identifier })` at `https://indexer.preprod.midnight.network/api/v4/graphql`.
2. Confirm `transactionResult.status = SUCCESS`, the identifier is present, and the block height/hash matches the snapshot.
3. Query `contractAction(address: ...)` and confirm the latest action is at block 2371914 and includes the payout identifier.
4. Query `chain_getFinalizedHead`, then `chain_getHeader` at `https://rpc.preprod.midnight.network`; confirm the finalized height is at least 2371914.
5. Open the public contract and transaction links above without authentication.

Preprod is a production-like test network, not mainnet, and its history may be reset. The deployment is evidence of the implemented workflow under current Preprod conditions, not a production-security guarantee.
