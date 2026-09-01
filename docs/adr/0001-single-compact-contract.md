# ADR-0001: One Compact contract for Wave 1

- Status: accepted
- Date: 2026-09-01

## Context

Program ownership, report authorization, patch binding, retesting, and payout authorization share state invariants. Splitting them would add cross-contract synchronization and deployment risk without a Wave 1 privacy benefit.

## Decision

Use one primary `VulnSeal` Compact contract with one program configuration, a report map, a payout-receipt set, and explicit circuits for each legal state edge.

## Consequences

Atomic invariant enforcement and a simple verifier model outweigh reduced modularity. A later multi-tenant design may deploy one instance per program or introduce a registry after current Midnight upgrade patterns are researched.
