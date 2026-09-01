# Buildathon rubric mapping

## Engineering & Implementation — 40%

| Criterion | Repository evidence | Readiness |
| --- | --- | --- |
| Compiling Compact contract | `contract/src/vulnseal.compact`; Compact `0.31.1`, language `0.23`; eight generated ZKIR/key pairs | Ready locally |
| Meaningful private state | Four typed witnesses for actor secret, report preimage, patch evidence, retest evidence | Ready |
| Dual-ledger architecture | Explicit private/public table and encrypted artifact boundary | Ready |
| Secure authorization/state machine | Eight edge-specific circuits, domain/subject binding, no general setter, 13 tests | Ready for scoped Wave 1 |
| Compatible dependencies | Exact Midnight pins and lockfile; runtime-class pin documented | Ready |
| Real local proof/transaction evidence | Seven transaction IDs/blocks through payout authorization | Ready locally; Preprod pending |

## Quality Assurance & Reliability — 15%

Contract, shared crypto, ciphertext store, API, React, accessibility, failure-state, desktop/mobile E2E, and real integration checks exist. Quick start and exact environment are documented. CI runs deterministic checks; the expensive local Midnight lifecycle remains a documented manual job because it requires Docker/proof resources.

Readiness: **strong local coverage; independent CI run and Preprod remain**.

## Product & Vision — 15%

VulnSeal directly targets the Request for Startups “Provable Bug Bounty Board” opportunity. Privacy is required because vulnerability details and researcher identity are dangerous before remediation. Wave 1 deliberately stops at workflow/payout authorization; escrow, disputes, and integrations have later-wave plans.

Readiness: **ready**.

## User Experience & Design — 15%

Role-based researcher, vendor, and public-verifier flows are complete. The interface explains what is revealed at action time, distinguishes guided/local/finalized evidence, renders wallet/proof-service errors, and has desktop/mobile visual evidence.

Readiness: **ready locally; live Lace/Preprod polish pending**.

## Communication — 10%

README, diagrams, ADRs, threat/privacy model, evidence table, pitch deck, demo script, and three-wave roadmap are present. The demo script leads with working proof evidence and avoids claims that the circuit cannot support.

Readiness: **ready; video URL pending human recording/upload**.

## Business Development & Viability — 5%

Initial hypotheses: open-source maintainers, Web3 protocols, small security teams, audit firms, and ecosystem foundations need a neutral disclosure audit trail. Candidate model: free public program, paid private workspace, later escrow fee, API/SDK. These are hypotheses only; no users, revenue, partnerships, or traction are claimed.

Readiness: **credible hypothesis; validation planned**.
