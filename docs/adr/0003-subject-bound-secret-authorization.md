# ADR-0003: Subject-bound secret authorization

- Status: accepted for Wave 1
- Date: 2026-09-01

## Context

`ownPublicKey()` or a wallet-returned key is not sufficient application authorization. Researcher identity should not be globally public.

## Decision

Derive the public vendor key as `H(domain, programId, ownerSecret)` and the report-specific researcher key as `H(domain, programId, reportCommitment, researcherSecret)`. Each transition recomputes the appropriate key inside the circuit. No general status update circuit exists.

## Consequences

Authorization proves knowledge of a scoped secret and reduces direct cross-report linkability. It is not legal identity, has no rotation/recovery, and does not protect against stolen secrets. Production vendor authority should evaluate current supported multisignature/rotation patterns.
