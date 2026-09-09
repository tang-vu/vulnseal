// SPDX-License-Identifier: Apache-2.0
import { RoleSession } from "@vulnseal/api/role-session";
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import { pureCircuits } from "@vulnseal/contract";
import { initializeBrowserProviders } from "./midnight/browser-providers.js";
import { validateDisclosure } from "./handoff.js";
import type { RoleVault } from "./role-recovery.js";

export const joinRoleVault = async (vault: RoleVault, beforeSubmit?: Parameters<typeof initializeBrowserProviders>[1]) => {
  if (!vault.contractAddress) throw new Error("The role backup has no deployed contract address");
  const providers = beforeSubmit ? await initializeBrowserProviders(vault.network, beforeSubmit) : await initializeBrowserProviders(vault.network);
  const session = await RoleSession.join(providers, vault.contractAddress, { role: vault.role, programId: hexToBytes(vault.programId), actorSecret: hexToBytes(vault.actorSecret) });
  const snapshot = await session.readPublicState();
  for (const item of vault.reports) {
    const opened = await validateDisclosure(item);
    const id = hexToBytes(item.reportId);
    if (!snapshot.ledger.reports.member(id)) continue; // A prepared report may not have been submitted yet.
    const record = snapshot.ledger.reports.lookup(id);
    if (bytesToHex(record.ciphertextDigest) !== opened.ciphertextDigest) throw new Error("Saved report ciphertext does not match the ledger");
    if (vault.role === "researcher" && bytesToHex(record.researcherKey) !== bytesToHex(pureCircuits.deriveResearcherKey(hexToBytes(vault.programId), id, hexToBytes(vault.actorSecret)))) throw new Error("Saved report belongs to another researcher authority");
  }
  return { session, snapshot };
};
