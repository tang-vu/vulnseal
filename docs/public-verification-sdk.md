# Public verification API

The workspace package exposes `@vulnseal/api/public-verification` with TypeScript declarations. Its implementation is shared with the web verifier; the web module re-exports it instead of maintaining another decoder. This is a local/private workspace package, not a published npm release. It depends on the pinned Midnight runtime and generated contract schema. Browser integrations still need the corresponding WASM/bundler setup; the repository's Vite application is the working reference.

Available functions:

| Function | Result |
| --- | --- |
| `parsePublicReceipt(text)` | Validate the public-only v1 schema and normalize 32-byte identifiers. Extra/private fields fail. |
| `publicReceiptLink(base, receipt)` | Validate the receipt and create an HTTP(S) verifier fragment, preserving the release path while removing credentials/query data. |
| `verifyPublicContract(address, endpoints, signal?)` | Query current contract state and compare its reported block with RPC finality; decode the public projection. |
| `verifyPublicReceipt(text, endpoints, signal?)` | Also require the receipt's report and ciphertext digest to match the observed contract; return `{ receipt, report, verification }`. |
| `projectPublicLedger(ledger)` | Project an already-decoded ledger without network access. |

The public projection includes `scopeDigest`, `responsePolicyDigest`, `rewardPolicyDigest` and `disclosurePolicyDigest` alongside program ID and windows. To compare supplied policy content locally:

```ts
import { compareProgramPolicy, validateProgramPolicy } from "@vulnseal/api/program-policy";
const policy = validateProgramPolicy(JSON.parse(publicPolicyText));
const comparison = await compareProgramPolicy(policy, observation);
```

Here `observation` is a `verifyPublicContract` result. This comparison makes no network request and leaves endpoint/identity trust unchanged. [Policy format and exact hashing](program-policy-sdk.md).

The browser's **Program policy commitments** panel displays the four digests and both windows after public lookup. **Compare public program policy** accepts a JSON file with exactly `name`, `primaryScope`, `additionalScope`, `responseDays`, `disclosureDays` and `rewardPolicy`. Obtain the public text from the program through an agreed channel; digests cannot recover it. The file is capped at 2 MiB before reading, and the policy validator applies its own field limits. File contents are processed locally, never uploaded. Replacing the input or observation discards the old comparison. Name is uncommitted display metadata; even an all-fields match does not establish ownership or permission.

For example, after building the workspace dependencies:

```js
import { readFile } from "node:fs/promises";
import { verifyPublicReceipt } from "@vulnseal/api/public-verification";

const text = await readFile("public-receipt.json", "utf8");
const { PUBLIC_INDEXER_URL: indexerUrl, PUBLIC_RPC_URL: rpcUrl } = process.env;
if (!indexerUrl || !rpcUrl) throw new Error("Configure public indexer and RPC URLs first");
const result = await verifyPublicReceipt(text, { indexerUrl, rpcUrl });
console.log(result.report.status, result.verification.blockHeight);
```

Configure and validate those endpoints for the receipt's expected network before calling. The API does not infer their network from the receipt, choose hosts, or authenticate an operator-provided endpoint. Only public contract/RPC parameters are sent; the helper does not fetch ciphertext, connect a wallet, prove or submit a transaction. The existing 20-second request signal and 16 MiB received-JSON limit apply. Browser suspension and synchronous decoding can delay application timers.

Finality lookup requires a full 32-byte hexadecimal finalized-head hash before requesting its header. Bare or prefixed hashes are normalized to lowercase with an `0x` prefix; null, non-string and malformed hashes fail before any follow-up RPC request.

The executable offline example is:

```sh
npm run build
node examples/public-verification-fixture.mjs
```

It imports the compiled package entrypoint in Node, decodes captured Preprod state, verifies a known public receipt against simulated RPC responses, and asserts four intercepted requests. It makes no network request and explicitly labels its output as fixture/simulated finality. CI runs it after the ordinary workspace validation.

These checks trust the supplied indexer/RPC for inclusion and state provenance. Matching a receipt's public digest does not verify ciphertext availability, private preimages, source/constructor identity, signatures, proof validity or remediation. `PAYOUT_AUTHORIZED` does not mean a token transfer. The projection describes current reported state, not a complete authenticated timeline. Program/provider setup, embeddable submission UX, public history and independently authenticated state remain separate SDK/product work.
