// SPDX-License-Identifier: Apache-2.0
import { RoleSession } from "@vulnseal/api/role-session";
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import { pureCircuits } from "@vulnseal/contract";
import { initializeBrowserProviders } from "./midnight/browser-providers.js";
import { validateDisclosure } from "./handoff.js";
import type { RoleVault } from "./role-recovery.js";
import { submissionReceipt } from "./submission-receipt.js";

export const joinRoleVault = async (input: RoleVault, beforeSubmit?: Parameters<typeof initializeBrowserProviders>[1], assertCurrent: () => void = () => {}) => {
  // Keep the selected identity, reports and saved claims fixed across wallet waits.
  assertCurrent();
  const vault = structuredClone(input);
  if (!vault.contractAddress) throw new Error("The role backup has no deployed contract address");
  const providers = beforeSubmit ? await initializeBrowserProviders(vault.network, beforeSubmit) : await initializeBrowserProviders(vault.network);
  assertCurrent();
  const session = await RoleSession.join(providers, vault.contractAddress, { role: vault.role, programId: hexToBytes(vault.programId), actorSecret: hexToBytes(vault.actorSecret) });
  assertCurrent();
  const snapshot = await session.readPublicState();
  assertCurrent();
  for (const item of vault.reports) {
    const opened = await validateDisclosure(item);
    assertCurrent();
    const id = hexToBytes(item.reportId);
    if (!snapshot.ledger.reports.member(id)) {
      if (vault.submissionAttempts?.some((attempt) => attempt.intent?.reportId === item.reportId && attempt.finalization)) {
        throw new Error("Saved finalization conflicts with an absent ledger report. Open the backup offline and investigate its journal before reconnecting; do not resubmit based on this absence.");
      }
      continue; // A prepared or uncertain report may not have been submitted yet.
    }
    const record = snapshot.ledger.reports.lookup(id);
    if (bytesToHex(record.commitment) !== item.reportId) throw new Error("Saved report commitment does not match the ledger record");
    if (bytesToHex(record.ciphertextDigest) !== opened.ciphertextDigest) throw new Error("Saved report ciphertext does not match the ledger");
    if (vault.role === "researcher" && bytesToHex(record.researcherKey) !== bytesToHex(pureCircuits.deriveResearcherKey(hexToBytes(vault.programId), id, hexToBytes(vault.actorSecret)))) throw new Error("Saved report belongs to another researcher authority");
    if (bytesToHex(record.submissionReceipt) !== bytesToHex(submissionReceipt(id, record.ciphertextDigest, record.researcherKey))) throw new Error("Ledger submission receipt is inconsistent with the saved report");
  }
  assertCurrent();
  return { session, snapshot };
};
