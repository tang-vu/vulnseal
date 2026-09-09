# Use a single-role transaction session

`RoleSession` keeps one actor secret and a fixed role. Use separate providers and encrypted authority storage for independent users. The dedicated [role workspace](role-workspace.md) uses this API; the original combined-role demo remains separate.

```ts
import { RoleSession } from "@vulnseal/api/role-session";

// Obtain these values from the intended program and your own private authority store.
const researcher = await RoleSession.join(researcherProviders, contractAddress, {
  role: "researcher",
  programId,
  actorSecret: researcherSecret,
});

const submission = await researcher.execute({
  kind: "submitReport",
  report: { programId, canonicalDigest: sealed.canonicalReportDigest, salt },
  ciphertextDigest: sealed.ciphertextDigest,
});
```

Encrypt and store the report before submission, and persist its salt, report key and researcher authority privately. The returned value is normal transaction evidence from the underlying Midnight API. A failure must be reconciled with network state before retrying a potentially submitted transaction; this adapter does not provide pending-transaction recovery.

The vendor independently joins with its own secret:

```ts
const vendor = await RoleSession.join(vendorProviders, contractAddress, {
  role: "vendor",
  programId,
  actorSecret: vendorSecret,
});
await vendor.execute({ kind: "beginTriage", reportId });
await vendor.execute({ kind: "acceptReport", reportId, severity: 3n, decisionDigest });
await vendor.execute({ kind: "anchorPatch", reportId, patchDigest });
```

After independently testing the fix, the researcher reads the current patch and submits its report-bound retest:

```ts
const snapshot = await researcher.readPublicState();
const record = snapshot.ledger.reports.lookup(reportId);
await researcher.execute({
  kind: "submitRetest",
  reportId,
  report: { programId, canonicalDigest: sealed.canonicalReportDigest, salt },
  patchCommitment: record.patchCommitment,
  evidenceDigest,
  passed: true,
});
await vendor.execute({ kind: "authorizePayout", reportId, rewardTier: 3n });
await vendor.execute({ kind: "closeReport", reportId });
```

Keep each example block in the corresponding user's context. Receiving keys from **Private exchange** are disclosure-decryption keys and cannot replace `actorSecret`. Payout authorization does not transfer funds. See [ADR-0009](adr/0009-fixed-role-api-sessions.md) for witness serialization, source trust and remaining integration limits.
