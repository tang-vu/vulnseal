// SPDX-License-Identifier: Apache-2.0
import { parseInvitation, type ProgramInvitation } from "./role-recovery.js";

export function programInvitationLink(base: string, invitation: ProgramInvitation): string {
  const value = parseInvitation(JSON.stringify(invitation));
  const url = new URL(base);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invitation links require HTTP or HTTPS");
  url.username = ""; url.password = ""; url.search = "";
  url.hash = `roles?${new URLSearchParams({ network: value.network, contract: value.contractAddress, program: value.programId })}`;
  return url.href;
}

export function parseProgramInvitationLink(input: string): ProgramInvitation {
  if (input.length > 4096) throw new Error("Program invitation link is too large");
  const url = new URL(input);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || !url.hash.startsWith("#roles?")) throw new Error("Not a public program invitation link");
  const params = new URLSearchParams(url.hash.slice(7));
  if (JSON.stringify([...params.keys()].sort()) !== JSON.stringify(["contract", "network", "program"])) throw new Error("Unsupported program invitation link fields");
  return parseInvitation(JSON.stringify({ format: "vulnseal-program-invitation", version: 1, network: params.get("network"), contractAddress: params.get("contract"), programId: params.get("program") }));
}
