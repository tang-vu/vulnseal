# ADR-0024: Encrypted vendor program drafts

Status: Accepted for local recovery; native deployment validation remains open.

## Problem

Vendor deployment fields previously lived in uncontrolled form elements. Switching workspace tabs reset them, and encrypted role backups/browser autosave omitted their text. A saved identity therefore did not preserve an unfinished program configuration.

## Decision

Role-vault v11 adds required `programDraft`, either null or seven raw string fields: name, primary/additional scope, reward policy, response days and disclosure days. Each field is bounded to 64 KiB UTF-8. Text is preserved without trimming, normalization or requiring completed fields; deployment still uses the existing `readProgramForm` validation and constructor digest calculation. Non-null program drafts belong only to vendor vaults.

New vendor identities contain the displayed defaults as their initial draft. Editing an older vendor workspace upgrades its vault and preserves existing reports, journal/finalization records and private notes. Journal updates retain v11 and existing retest-patch metadata; they do not fabricate missing historical evidence. The form now reads and updates vault state, so encrypted autosave, file export, leave warnings and the existing latest-backup transaction gate apply to policy edits too. Wait for a successful save after editing.

The encrypted envelope and IndexedDB row format are unchanged. Current code still reads v1-v10; absent legacy policy text is not reconstructed as historical configuration. Older application releases cannot read v11 vaults, so retain a compatible application release when planning rollback/recovery. Receiving keys remain separately backed up. The wallet-free journal projection does not include program drafts.

## Limits and evidence

A working draft is not an authenticated copy of deployed policy or a per-transaction argument snapshot. No contract update, new ledger field, wallet transaction or public deployment is introduced. Keep independent deployment/policy evidence. Only confirmed encrypted saves survive closing the tab; interrupted saves and browser eviction retain their existing limits.

Unit tests cover encrypted round-trip, incomplete text, field bounds, role/schema rejection and preservation through journal operations. Chrome desktop/mobile tests verify tab switching, autosave, fresh browser-copy unlock and actual downloaded-file restoration with no POST/PUT requests. Researcher draft recovery remains covered. Exact outcomes are in [validation-report.md](../validation-report.md).
