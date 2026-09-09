# ADR-0016: Locking and switching active role workspaces

Status: accepted, 2026-09-09.

Encrypted browser copies can represent different roles or programs, but opening another copy previously required a new tab. The role entry point now supports one active workspace at a time with an explicit lock action returning to the copy picker.

## Transition and recovery gate

The current vault must match a successfully saved vault before locking. Unsaved identities, report drafts, notes or disclosures keep the action disabled, as do active parent workflow operations such as contract submissions. A loaded receiving key requires acknowledgment that its separate encrypted backup/password were retained. The acknowledgment is bound to that key object; replacing the key cannot reuse it.

Locking remounts the active component tree with a new React key. Identity, reports, working notes, passwords, receiving keys, selected report, public snapshot and in-memory receipts are no longer rendered or carried into the new workspace. Child cleanup stops the old autosave writer and removes leave listeners; transaction-observation requests and guarded disclosure callbacks use their existing unmount cleanup. Focus returns to the entry heading. The new picker reloads the existing encrypted catalog and requires a password to unlock any copy, including the previously active one.

No encrypted file or browser row is deleted. A write that already entered IndexedDB may finish against its original row; it cannot be redirected into a newly selected row. Old revisions continue to use the existing compare-and-swap conflict checks. A backup download satisfies the same saved-vault gate used for transactions; users must actually retain that download. Restoring deployed copies still defaults to authority/ledger verification, with the existing explicit offline option available.

## Limits

This is manual application locking, not wallet revocation or secure memory erasure. Lace authorization, other tabs, downloaded files and public records remain independent. JavaScript garbage collection and third-party provider internals do not establish forensic destruction of secret bytes. Only one role is active in this tab, and roles belonging to different participants should still use separate browser profiles. Native-wallet switching between deployed programs requires a separate live ceremony.
