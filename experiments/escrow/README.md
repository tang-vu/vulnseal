# Escrow compatibility experiment

This is an isolated, owner-controlled, single-release Compact prototype. It is **not a deployed VulnSeal feature**, does not change the Wave 1 contract, and does not satisfy the Wave 2 start or exit gates.

Run from the repository root after `npm ci`, with Compact compiler **0.31.1** installed:

```sh
node experiments/escrow/check.mjs
```

On Windows the runner uses WSL; set `VULNSEAL_COMPACT_WSL_DISTRO=Ubuntu` if needed. The runner verifies the compiler version, compiles with `--skip-zk` into its own temporary directory, runs the tests against those fresh bindings, and removes only that directory after checking its canonical boundary. It prints source/binding/test hashes after cleanup succeeds. It generates no proving keys and never invokes a wallet or network transaction.

## Behavior verified locally

| Circuit | Simulator observation |
| --- | --- |
| `deposit` | Requires the owner witness and a positive amount; requests an input of the configured token; accumulates funding up to `2^64 - 1`. |
| `authorize` | Fixes the full funded amount and a nonzero user recipient; emits no external effects. |
| `release` | Requires the owner, a prior authorization, and sufficient balance for the configured token; authorizes the exact amount and user output once. |

The four test groups also reject wrong owners, empty deposits, partial/excess authorizations, empty recipients, recipient replacement, deposits after authorization, repeated release, aggregate overflow, missing funds, and balances belonging to a different token. A surplus balance does not increase the authorized output. Every call gets a new query context: effects are not accidentally accumulated across simulated transactions.

`receiveUnshielded`, `sendUnshielded`, and `unshieldedBalanceGte` are documented in the official [Compact standard-library exports](https://docs.midnight.network/compact/standard-library/exports); official [token transfer examples](https://docs.midnight.network/examples/contracts/token-transfers) illustrate their use. Current documentation can target newer compiler/runtime releases. Compatibility here is established by compilation with **0.31.1** and execution with the repository's **compact-runtime 0.16.0 / onchain-runtime-v3 3.0.0** pins, rather than assuming that newer documentation matches this repository.

## Limits and next integration gates

- The test injects balances explicitly into `QueryContext.block.balance`. Neither a deposit counter nor a simulated input/output effect proves funding, transaction acceptance, a recipient balance delta, or a payment.
- Token color, amounts, recipient, and authorization state are public. This is an unshielded-token experiment; it must not receive private report content.
- Zero color is excluded to avoid native NIGHT. A nonzero color does **not** authenticate a test token. Before any deployment, select an authenticated test-token issuer/network and verify funding provenance.
- The owner can authorize any nonzero recipient. There is no report/program commitment binding, accepted-report condition, independent vendor/researcher authorization, dispute mechanism, timeout, refund, or authority recovery.
- Deposits stop after authorization. Direct unsolicited transfers are outside the bookkeeping; surplus tokens have no recovery path in this prototype. It is not suitable for real funds.
- No proof generation, transaction balancing, wallet signing, ledger transaction application, concurrency replay, or network transfer has been tested here. Generated bindings/ZKIR stay ignored under `.compact`; this code is excluded from application exports and web release artifacts.

Before product integration: stabilize/tag the Wave 1 baseline; specify report-bound payout and refund authority/state transitions; test those adversarially; generate and verify proofs; then obtain authorized test-network deployment/funding and independently query transaction results and token balance deltas. Keep payout authorization and actual release evidence separate throughout.

The first fresh runner check passed on **2026-09-10T07:40:36.936Z**, Node **24.14.1**, four tests with no skips. See [recorded evidence](../../docs/evidence/escrow-compatibility.json).
