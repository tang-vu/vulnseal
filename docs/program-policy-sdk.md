# Program policy SDK

`@vulnseal/api/program-policy` exposes `ProgramPolicy`, `validateProgramPolicy(input)` and asynchronous `programConstructor(programId, policy)`. The web application re-exports this constructor preparation instead of maintaining its own hashing implementation. The package remains private to this workspace and is not a published npm release.

`validateProgramPolicy` accepts exactly name, primaryScope, additionalScope, responseDays, disclosureDays and rewardPolicy. Text fields have a 64 KiB UTF-8 bound; only additionalScope may be blank. Response windows are 2, 7 or 14 days and disclosure windows are 30, 60 or 90 days, matching the current UI. These are the policy helper's supported choices; the low-level contract constructor has its own numeric constraints.

The helper preserves exact policy text. The web form trims and normalizes to NFC before calling it; a Node integration should make any desired normalization explicit before retaining its policy. Hash inputs retain the existing JSON key order and SHA-256 encoding:

| Constructor field | JSON input |
| --- | --- |
| scopeDigest | `{ primaryScope, additionalScope }` |
| responsePolicyDigest | `{ responseDays }` |
| rewardPolicyDigest | `{ rewardPolicy }` |
| disclosurePolicyDigest | `{ disclosureDays }` |

Name is display metadata and is **not committed by the current contract**. The constructor also receives the 32-byte program ID and the two windows as bigint. The helper validates and copies the ID and policy before hashing, so later caller edits cannot change an in-flight result. It does not generate authority, connect providers or submit a transaction.

An application can compose preparation with the existing deployment API:

```ts
import { programConstructor } from "@vulnseal/api/program-policy";
import { VulnSealApi } from "@vulnseal/api/api";
import { RoleSession } from "@vulnseal/api/role-session";
import { createVulnSealPrivateState } from "@vulnseal/contract";
import { randomBytes } from "@vulnseal/shared";

const programId = randomBytes(32), vendorSecret = randomBytes(32);
const policy = {
  name: "Example disclosure program", primaryScope: "api.example.test",
  additionalScope: "", responseDays: 7, disclosureDays: 90,
  rewardPolicy: "Critical: tier 4; high: tier 3; medium: tier 2; low: tier 1",
};
const program = await programConstructor(programId, policy);

// Application-provided encrypted persistence; retain authority BEFORE deploying.
await savePreparedProgram({ program, policy, vendorSecret });
// Application-provided Midnight providers for the chosen network, with a
// durable transaction-ID checkpoint before wallet submission.
const { api, evidence } = await VulnSealApi.deploy(
  providers, createVulnSealPrivateState(vendorSecret), program,
);
// Retain learned address/evidence before any fallible follow-up ledger read.
await saveDeploymentResult({ contractAddress: api.contractAddress, evidence });
const vendor = await RoleSession.attach(api, {
  role: "vendor", programId, actorSecret: vendorSecret,
});
const snapshot = await vendor.readPublicState();
```

`providers`, `savePreparedProgram` and `saveDeploymentResult` above are integration responsibilities, not supplied SDK exports. Persist exact bytes/bigints with an explicit encrypted encoding and retain policy text separately: a digest cannot recover it. The browser's role workspace supplies its own provider/checkpoint/backup integration. Deployment failure may be an unknown outcome; this helper does not reconcile or authorize retries. Provider setup, signing, proving, finality and native-wallet recovery still require their own validation. [Single-role API](role-session-api.md).

Run the checked-in local example after `npm run build`:

```sh
node examples/program-constructor.mjs
```

It generates ephemeral authority, prepares a policy using the built package export, executes the compiled Compact constructor locally, checks all seven constructor fields, checks the derived owner key and requires an empty reports map. Fetch is disabled during this example; its output excludes the secret and labels the run as offline with no deployment. CI invokes the example after workspace validation. It proves local constructor compatibility, not a transaction, fresh proving keys or a real deployed program.
