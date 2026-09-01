# Preprod evidence

Status: **not deployed** as of 2026-09-01.

No Preprod contract address, transaction ID, block reference, wallet, token balance, or public verifier link is claimed. The real evidence currently stored in this repository is from an ephemeral local Midnight network and is labeled accordingly.

## Required human-assisted procedure

1. Install/configure the currently supported Lace version for Midnight Preprod.
2. Create or select an authorized test account; do not share its seed with scripts, logs, or maintainers.
3. Obtain test assets through the official faucet. Any captcha/login is completed by the human.
4. Verify current Preprod node, indexer, proof-server, network ID, and token APIs against official documentation at deployment time.
5. Build from a clean commit and full Compact key generation.
6. Have the human approve contract deployment and each lifecycle transaction in Lace.
7. Record contract address, transaction IDs, block heights/references, network ID, commit SHA, tool versions, and public-state query output containing no secrets.
8. Independently open/query each reference, then update this file and the README.

## Evidence acceptance checklist

- [ ] Contract address is present and independently queryable.
- [ ] Deployment transaction is present.
- [ ] Submission, triage, patch, retest, and payout-authorization transactions are present.
- [ ] Public fields match the documented privacy allowlist.
- [ ] No plaintext, salt, actor secret, AES key, seed, or private request body appears.
- [ ] Payout wording remains “authorization” unless a separate verifiable transfer exists.
- [ ] Logged-out links work.

Until every relevant item is checked, submission material must say “local Midnight evidence; Preprod pending.”
