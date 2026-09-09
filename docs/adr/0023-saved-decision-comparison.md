# ADR-0023: Compare saved decision context with replayed public values

Status: implemented for saved ciphertext, acceptance, rejection, patch anchoring, retest context and payout authorization; partial reconciliation.

The role journal retains an immutable-per-attempt local note snapshot in v8 backups. Existing report replay verifies one successful call's data-state changes against supplied historical states, then binds the changed program/report to the journal intent. It previously displayed only status transitions, leaving even the saved decision digest and tier unchecked.

The production replay worker now returns the changed report's public decision digest, severity and reward tier as strings. The role workspace compares these locally against the note snapshot attached to that attempt:

| Operation | Compared values |
| --- | --- |
| `submitReport` | SHA-256 of the exact saved ciphertext envelope versus the replayed record's ciphertext digest |
| `acceptReport` | SHA-256 of exact UTF-8 note text, including whitespace; severity tier |
| `rejectReport` | SHA-256 of exact UTF-8 note text; severity is not compared |
| `anchorPatch` | Compact persistent hash of the patch domain, report ID and SHA-256 of exact saved note text |
| `submitRetest` | Explicit v9 Pass/Fail choice and retest commitment derived from exact saved notes, report ID, saved v10 patch commitment and saved choice (v9 uses the replayed patch with an explicit partial-comparison notice) |
| `authorizePayout` | Reward tier; unrelated working text is not compared |

The hashing matches the existing role command preparation. It uses the saved attempt context rather than current editable notes. Private text and its locally calculated digest are not added to worker messages or remote requests. A discrepancy produces a visible alert and investigation guidance. Missing older snapshots and unsupported operations receive explicit non-comparison messages. Comparisons are discarded when inputs change or the component unmounts.

For report submission, the role workspace selects the saved disclosure by the attempt's report ID. Its envelope is hashed locally and compared with the digest returned from the source-replayed report. The existing vault validator binds that disclosure to the program/report before restoration. Neither envelope nor decryption key is sent to the worker. This comparison verifies byte equality with a public content address; it does not fetch storage or prove remote retention. Missing ciphertext/digest and invalid evidence never produce a successful match.

Patch comparison uses the Compact runtime's persistent hash and the exact domain/vector layout of the retained contract's private `derivePatchCommitment` helper. A simulator regression executes the compiled `anchorPatch` circuit and compares its result, including report binding and whitespace sensitivity. Missing or malformed replayed commitments cannot produce a match. Notes and calculated patch inputs remain local; only the public commitment is returned by the worker.

Retest comparison requires both the immutable note snapshot and explicit v9 choice, including `false`. It never infers a missing old choice from public state. The Compact runtime calculation is checked against the generated retest circuit for both outcomes. New v10 attempts retain the actual command?s selected patch before the encrypted checkpoint. Comparison checks that saved patch against the replayed value and uses the saved patch when deriving the expected retest commitment. Older v9 entries use the replayed patch only and display an explicit partial-comparison notice; migration never invents a historical patch. Missing/malformed evidence or report mismatch cannot produce a match. Saved notes and choice stay outside the worker payload.

This is a comparison with source-replayed public report fields, not proof that a backup is authentic or that the transaction was authored with the original user's complete intended arguments. Indexer/RPC trust and deployed-code authentication limits remain. For legacy entries the intended retest patch remains unknown. Report preimages, actor authority and complete transaction arguments are not covered by this comparison. No recovery journal field is rewritten, no attempt is marked terminal, and no retry or wallet action is enabled. Payout authorization still does not establish a token transfer.

Component regressions cover exact-text hashing, mismatched text/tier, operation-specific fields, missing snapshots, report mismatch and unsupported calls. The existing worker-message boundary test includes private notes and requires the outgoing payload to remain public-only. The browser replay regression checks the historical synthetic `accepted:p2` digest and tiers of 3 from the captured Preprod lifecycle.
