# ADR-0005: Authenticated local checkpoint for Preprod wallet synchronization

- Status: accepted
- Date: 2026-09-02

## Context

A fresh headless Preprod wallet must scan a large current chain across shielded, unshielded, and DUST branches before it can transact. On the compatibility host this took multiple hours. Restarting from zero after a timeout would make the deployment ceremony fragile. The wallet SDK's serialized state is security-sensitive and must not be committed or stored as plaintext.

## Decision

Use each official wallet branch's `serializeState` and `restore` APIs, but wrap the combined checkpoint in an application-owned encrypted envelope:

- AES-256-GCM with a fresh 96-bit IV on every save;
- a 256-bit key derived with Node's `scrypt` from the Git-ignored private-state password and a fresh random salt;
- fixed versioned additional authenticated data;
- strict envelope, network, and expected-address validation;
- atomic temporary-file rename;
- a save every 30 seconds, after major readiness points, and during clean shutdown;
- generic authentication errors that do not reveal checkpoint contents.

The checkpoint lives at `integration/.wallet-state/preprod.json.enc`, which is ignored by Git. The seed and password remain in `integration/.env.preprod`, also ignored. A narrowly scoped `MIDNIGHT_RESET_UNSHIELDED_CHECKPOINT=1` recovery switch rebuilds only the public unshielded branch if a rejected registration recipe left pending wallet state; the expensive shielded and DUST scans remain restored.

## Consequences

Preprod synchronization can resume without persisting plaintext wallet state or logging secrets. Wrong passwords, address mismatches, and ciphertext tampering fail closed. Tests cover encrypted round trip, absence of fixture plaintext, wrong-password rejection, address binding, and authenticated-tamper rejection.

The local password and host remain trusted while the process is running. Checkpoint availability is not guaranteed, and deleting it forces a full rescan. This is deployment tooling, not a browser-wallet recovery format or a substitute for hardware-backed key storage.
