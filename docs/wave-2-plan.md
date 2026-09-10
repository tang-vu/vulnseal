# Wave 2 plan — Proof of Resolution

Wave 2 begins only after Wave 1 is stable and its baseline is tagged. Every submission should show a real diff from Wave 1.

## Outcomes

An isolated [escrow compatibility experiment](../experiments/escrow/README.md) compiles with the pinned toolchain and tests token effects and authorization/release separation locally. It has no report binding or network payment evidence and does not satisfy the baseline/start gate or the exit evidence below.

- Maintain the Wave 1 Preprod deployment runner and add migration/redeployment evidence if the resettable network changes.
- Add test-token escrow using only currently supported token/contract APIs researched at implementation time.
- Separate payout authorization from escrow release and prove both independently.
- Add a bounded dispute state, encrypted evidence additions, and an explicitly authorized mediator policy.
- Add secret rotation/recovery and stronger vendor authorization (supported multisig/delegation pattern, not invented primitives).
- Add encrypted, append-only report updates and a replacement-patch/retest chain.
- Replicate ciphertext across at least two adapters and test withholding/corruption behavior.
- Expand property/state-model tests and adversarial integration cases.

The Wave 1 simulator suite now also runs three deterministic interleavings of five reports, including two failed-retest/replacement cycles before payout authorization, rejected-report closure, wrong-participant and stale-patch attempts, and terminal replay rejection. These strengthen the existing baseline's isolation/history invariants; they do not implement the expanded Wave 2 contract, payment, dispute or append-only update features.

## Exit evidence

A new Preprod contract address and transaction references for the expanded workflow, independently queryable final state, test-token balance deltas, all Wave 1 regression checks, dispute/escrow negative tests, threat-model delta, and an explicit Wave 1 → Wave 2 comparison. No payment claim without a verifiable transfer.

## Deliberately deferred

Production funds, permissionless mediator networks, AI scanning, social login, broad analytics, and enterprise organization administration.
