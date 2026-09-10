# Share a public program policy

A vendor workspace with a saved contract address offers **Share program policy** under Reports. The backup must contain its original program policy draft; older backups without that text cannot reconstruct it from digests and do not substitute example defaults.

1. Choose **Check public policy for sharing**. This explicitly reads the configured public indexer/RPC without connecting Lace or sending a transaction. An offline-restored backup can use this public lookup too.
2. The saved draft is trimmed and normalized using the same form rules as deployment. The check requires the observed program ID to match the workspace, then compares four policy digests and both windows.
3. Review the displayed JSON. A mismatch identifies the differing fields and keeps download disabled. Recover the exact original policy rather than claiming the current draft is the deployed policy.
4. If all six fields match, choose **Download public program policy**. The JSON contains only name, primaryScope, additionalScope, responseDays, disclosureDays and rewardPolicy. Authority, report notes, disclosure material and recovery fields are not included.
5. Share the file through the program's agreed channel. In a separate browser, the recipient selects the intended contract/network in the public verifier, loads its public state and imports the downloaded file through **Compare public program policy**.

The preview identifies the observed block and check time. Draft/program/network/address changes discard it and cancel an outstanding read; cancellation or a late result cannot enable downloading an old selection. A download callback failure retains the reviewed file for an explicit retry without another lookup.

Public reads and state decoding run in a dedicated worker with a 30-second outer deadline. Canceling or changing the selected inputs terminates that worker; a stalled decoder cannot continue to enable the export after timeout. Exact policy hashing and review rendering remain local UI work.

Name is uncommitted display metadata. These comparisons trust the selected public sources and do not authenticate ownership, testing permission or deployment code. The file describes policy content and contains no network/contract binding or signature; recipients must establish the intended program separately. Nothing automatically publishes or messages the file. [Exact policy format and hashing](program-policy-sdk.md).
