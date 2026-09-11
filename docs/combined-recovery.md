# Recover a combined demo session

The combined demo holds both vendor and researcher secrets. Its recovery files contain both roles, private report material and working notes. Keep them private. For independent people acting as separate roles, use the [role workspace](role-workspace.md).

## Protect a new network deployment

After connecting Lace, **Create program** asks for a **Deployment backup password** and confirmation. Use at least 12 characters and retain the password separately. This is not a wallet seed backup.

The application confirms a new encrypted browser copy before calling the deployment SDK. It then saves the transaction identifier to that copy before allowing broadcast. If the initial copy cannot be saved, deployment does not start and the password fields remain available for an explicit retry. Once SDK work begins, an error or timeout leaves the attempt blocked for investigation.

After matching SDK confirmation, the application updates the same browser copy with the contract address. A message distinguishes a confirmed recovery update from an update that failed. A failed backup update does not undo the deployment: keep the tab open and download an updated encrypted file through **Private recovery**. A timed-out write may already have committed.

## Keep a file outside the browser

Open **Private recovery**. Choose the action that matches the data you want:

| Action | What it saves |
| --- | --- |
| **Download encrypted backup** | The current recoverable session, encrypted with the Backup password and confirmation entered above it. |
| **Save encrypted browser copy** | A new encrypted checkpoint of the current session on this browser and site. It does not replace earlier copies. |
| **Download selected browser copy** | The exact encrypted revision already stored in the selected browser copy. It may be older than live edits. Its existing password remains required for restore. |

To download an existing deployment copy, select **Refresh browser copies**, choose the `Combined deployment` entry and select **Download selected browser copy**. No password is needed to copy its encrypted bytes. The filename includes its copy ID and revision.

Confirm that the file was saved before removing a browser copy. The app can start a download but cannot confirm that you kept it. Store the file on another device or independent storage, and keep its password separately. Clearing site data, changing browser/profile/origin, eviction or device loss can remove or hide browser copies.

## Save later report edits

**Enable encrypted autosave** creates a separate copy after password confirmation. Edits are encrypted after a short pause. Wait for the visible saved confirmation before leaving; newer edits may still be pending.

Autosave stops after a storage error, conflicting revision, program/network change or reload. It does not automatically restart when you restore a copy. **Stop encrypted autosave** retains its saved copy. The active autosave copy cannot be removed through the panel until autosave stops.

After deployment or a network restore, enable encrypted autosave before submitting a report or changing its status. The application blocks these actions while the writer is unavailable. Each action temporarily owns the writer: it saves the report material and requested action before SDK/private-state work, then saves the transaction identifier before the wallet's broadcast call. Pending ordinary draft saves cannot overwrite these checkpoints.

A matching SDK result triggers another encrypted save with the resulting status. If that final save fails, the live session retains the matching SDK confirmation and asks for a fresh file backup; the browser copy may still describe an unknown attempt. Autosave stops on an interrupted attempt or storage error. Restoring never automatically enables it.

## Restore a saved session

After the panel reads the selected backup, decryption, wallet connection and ledger checks have a combined three-minute deadline. If it expires, the file and password remain available for an explicit retry. A response from an expired or closed application session cannot advance to another restore stage or install the session. An already-open wallet request or SDK operation may still finish independently.

To read a backup without connecting a wallet, use **Inspect a backup offline**. Choose **Backup to inspect** and enter its **Inspection password**, or select an existing browser copy and use **Inspect selected browser copy**. Inspection validates the encrypted backup locally and displays saved network/address, report identifiers, unresolved markers, draft notes and report journal inputs. It does not install a session, query transaction status or establish current ledger state. A prepared copy can predate later submissions.

Use **Read sealed report from backup** or **Read prepared report from backup** to read the report decrypted from its saved envelope and checked against its saved commitment. These sections show the report title, summary, impact, reproduction steps, remediation, contact and attachment metadata. The editable draft is separate and may have changed after sealing. Attachment bytes are not in this backup; separately received files can be checked locally against the saved metadata.

Use **Clear inspected backup** when finished. It clears the visible data, inspection password and selected inspection file, including when a read/decryption is still pending. Navigating between application screens retains the inspection in this tab; reloading discards it. A three-minute deadline covers local reading and decryption. This is application-level clearing, not a guarantee of memory erasure. Exporting and restoring still use their separate controls.

Open a fresh tab on the application. In **Private recovery**, either choose a **Recovery file** or refresh and select a saved browser copy. Enter that copy's existing **Recovery password**, then select the corresponding restore button. Restoring replaces that tab's draft; the application blocks restoration over an active network program, prepared/submitted report, deployment attempt or autosave writer.

| Saved state | Restore behavior |
| --- | --- |
| Guided local session | Restores local data without claiming network transactions. |
| Network session with a contract address | Connects Lace on the saved network and checks the program/authority and applicable report bindings against the ledger. It does not deploy again. |
| Unconfirmed deployment without a contract address | Opens without Lace, retains the saved material and keeps creation blocked. A saved identifier is shown when available. |

For an unconfirmed deployment, **Check transaction status** performs a read-only observation when an identifier is present. Not found, a connection error or a status observation does not establish that retry is safe. Absence of an identifier in an earlier copy does not prove that no transaction was sent later.

With a saved deployment identifier, select **Compare saved deployment policy**. The worker checks the transaction hash and identifier against its bytes, binds the initial deployment state, and compares all seven saved policy fields and the eight verifier keys exposed by the SDK with this release. Only a matching result offers **Review recovery at this address**.

Enter and confirm a password for the new copy, then select **Connect, verify and save recovered deployment**. Lace must connect on the saved network. The application joins the checked address and verifies the current program identifier, derived vendor owner key, policy digests and windows. It saves a new encrypted browser copy named `Recovered combined deployment` before opening the report workflow. The original copy remains available; download the new copy through **Private recovery**. This process does not deploy or submit a transaction.

A verification or storage error keeps the deployment blocked. Recovery has a three-minute application deadline; after timeout or a closed tab, a late read cannot open the session. A browser save already in progress may still commit, so inspect saved copies before repeating the reconnect step. This explicit reconnect is not permission to retry deployment.

The comparison and recovery trust indexer/RPC inclusion and finality. Matching SDK-exposed verifier keys does not authenticate signatures, proofs, source-to-key generation, constructor arguments or other key versions. Current owner authority is checked separately during reconnect. Keep the original backup if evidence is missing or differs.

## Review report transaction records

In **Private recovery**, use **Saved report attempt** under **Report transaction journal** to inspect the action, report identifier, saved private inputs and transaction identifier. The journal retains the requested next state (including pass/fail retest), severity, rationale, patch reference and retest notes as they were when the action started. Later edits do not change that record. Its `sdk-confirmed` label records a matching SDK response, not independently authenticated finality.

**Check transaction status** is an explicit read-only lookup. A missing identifier, not-found response or current ledger state does not establish retry safety. An unresolved attempt remains blocked after restore. A submitted report already present on the ledger still needs investigation; its pending backup cannot currently be promoted automatically into a completed report.

Recovery v8 retains up to 1,000 report attempts. At capacity, further report actions stop before preparation, upload or SDK work, with a specific full-journal message. Export and retain the journal; the session cannot record another transaction. Reaching capacity does not create a new unknown-transaction marker or stop ordinary autosave. Existing unknown attempts remain blocked. Existing v1-v7 files remain readable, but do not acquire missing historical records. Older application versions cannot read v8. The current report's encryption material is retained with the snapshot; metadata for older reports is not a substitute for their separate file backups.

## Interrupted report uploads and transactions

In network mode, the application saves the prepared encrypted envelope, decryption key, salt and report identifier before upload. Wait for **Saving report preparation** to finish. If that save fails or times out, upload does not start; retain this tab and export a backup, then resolve storage and re-enable autosave before retrying. A storage write already in progress may still commit.

This prepared copy records that submission had not started when it was captured. Later submission can make it stale, so keep the latest committed revision and fresh file backups. Restoring an older unstarted marker does not prove that no later transaction was sent. Closing the tab while an upload is pending prevents its late response from starting SDK work in that closed session.

If ciphertext upload was interrupted before submission setup started, the combined demo keeps the prepared report. **Retry saved report upload** reuses its ciphertext, key, salt and report identifier. Back it up before closing. Once network submission setup starts, retry remains blocked because the transaction may still finalize. See [prepared-report recovery](adr/0022-pending-demo-preparation.md).

Private recovery does not include receiving keys from **Private exchange**, unfinished child-form passwords or a wallet seed. Retain the receiving-key backup separately. A leave warning is best effort and does not save data; crashes and mobile app termination may bypass it.

Format and validation details are recorded in [the recovery design](adr/0006-encrypted-browser-recovery.md).
