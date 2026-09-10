// SPDX-License-Identifier: Apache-2.0
export type ProgramInvitation = { readonly format: "vulnseal-program-invitation"; readonly version: 1; readonly network: string; readonly contractAddress: string; readonly programId: string };
export function parseInvitation(serialized: string): ProgramInvitation {
  if (new TextEncoder().encode(serialized).length > 4096) throw new Error("Program invitation is too large");
  const value = JSON.parse(serialized);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== ["format", "version", "network", "contractAddress", "programId"].sort().join()) throw new Error("Unsupported role document");
  if (value.format !== "vulnseal-program-invitation" || value.version !== 1) throw new Error("Not a public program invitation");
  if (!["local", "preview", "preprod", "mainnet"].includes(value.network)) throw new Error("Invalid role network");
  if ([value.contractAddress, value.programId].some(field => typeof field !== "string" || !/^[a-f0-9]{64}$/.test(field))) throw new Error("Invalid role identifier");
  return { format: "vulnseal-program-invitation", version: 1, network: value.network, contractAddress: value.contractAddress, programId: value.programId };
}

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
