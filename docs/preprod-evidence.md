# Preprod evidence

Status: **not deployed; ceremony prepared and awaiting faucet funding** as of 2026-09-02.

No Preprod contract address, transaction ID, block reference, wallet, token balance, or public verifier link is claimed. The real evidence currently stored in this repository is from an ephemeral local Midnight network and is labeled accordingly.

The current official endpoints were re-verified against the Midnight environments page last updated 2026-08-31. The Preprod RPC and GraphQL v4 indexer responded from this host, the full eight-circuit proving-key set is present, and the official proof server `8.1.0` is healthy locally under the documented ARM64 compatibility profile.

## Remaining ceremony

1. `npm run preprod:prepare` creates or reuses a Git-ignored headless test wallet and prints only its public Preprod address.
2. A human funds that address through the official faucet UI; the faucet has no public programmatic drip API.
3. `npm run midnight:proof:up` starts the official proof server. On this host, install ARM64 binfmt first as documented in the README.
4. `npm run preprod:lifecycle` synchronizes the wallet, registers received tNIGHT for DUST generation, deploys the contract, executes the complete lifecycle, checks the privacy allowlist, and writes redacted evidence only after success.
5. Independently query the contract and transaction references, then replace this pending status with the observed evidence.

The generated seed and private-state password stay in `integration/.env.preprod`, which is ignored by Git. They must never be pasted into an issue, log, README, or chat.

## Evidence acceptance checklist

- [ ] Contract address is present and independently queryable.
- [ ] Deployment transaction is present.
- [ ] Submission, triage, patch, retest, and payout-authorization transactions are present.
- [ ] Public fields match the documented privacy allowlist.
- [ ] No plaintext, salt, actor secret, AES key, seed, or private request body appears.
- [ ] Payout wording remains “authorization” unless a separate verifiable transfer exists.
- [ ] Logged-out links work.

Until every relevant item is checked, submission material must say “local Midnight evidence; Preprod pending.”
