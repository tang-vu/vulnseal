# ADR-0002: Browser AES-GCM and ciphertext-addressed storage

- Status: accepted
- Date: 2026-09-01

## Context

Compact commitments do not encrypt or make large reports available. The storage service must never receive plaintext.

## Decision

Canonicalize a versioned report schema, encrypt its UTF-8 bytes locally with Web Crypto AES-256-GCM, a random 96-bit IV, and program-bound AAD, then store only the versioned envelope under its SHA-256 digest.

## Consequences

Authenticated encryption rejects modification and the digest binds the public record to one envelope. Key exchange, durable availability, padding, and recovery are intentionally not solved in Wave 1. The contract and encryption claims remain separate.
