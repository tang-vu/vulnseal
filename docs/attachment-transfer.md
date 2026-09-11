# Send original attachments securely

VulnSeal can include original files in a disclosure encrypted for one recipient. This works in both the guided demo and role workspaces through **Private exchange**.

1. Before sealing, use **Hash a local attachment** to add each original file to the report. Keep those originals.
2. Have the recipient create a receiving key, save its password-encrypted backup and export its public receiving key.
3. Open the sealed report's **Private exchange** panel. Load the recipient public key and confirm its fingerprint through your agreed channel.
4. Select **Original attachment files to include**. The filenames and bytes must match the sealed report. Up to 50 files and 8 MiB total are supported per package; a large report may reduce available space within the 20 MiB package limit.
5. Choose **Download encrypted disclosure**. Retain the downloaded file and deliver it to the verified recipient. It contains the report and selected originals, encrypted for that receiving key.
6. In their own browser, the recipient restores their receiving key, selects the encrypted disclosure and chooses **Decrypt received disclosure**.
7. Under **Verified original files in this package**, download each original. VulnSeal checks its SHA-256 and size against the sealed report before making it available.

A package may include only some report attachments. Check the included-file count; missing originals still need separate delivery. Wrong or renamed files are refused during packaging. A damaged or mismatched package is refused when opening.

Keep the encrypted package and the separate receiving-key backup if you need to reopen the originals later. Ordinary workspace backups and **Add report to vendor workspace** retain metadata, not file bytes. Clearing the decrypted preview or closing the tab removes access to its in-memory originals until you reopen the package.

No actor secret or wallet key is sent. Decryption verifies the report commitment and included files; it does not establish sender identity or ledger finality. Metadata-only packages remain compatible with version 1. Attachment-bearing version 2 packages require this updated reader.
