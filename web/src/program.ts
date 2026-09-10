// SPDX-License-Identifier: Apache-2.0
import { bytesToHex, utf8 } from "@vulnseal/shared";
import type { ProgramConstructor } from "@vulnseal/api/types";

export const defaultProgram = {
  name: "Acme Security Program",
  primaryScope: "api.acme.test",
  additionalScope: "*.acme.test",
  responseDays: 7,
  disclosureDays: 90,
  rewardPolicy: "P1 · Critical — Tier 4\nP2 · High — Tier 3\nP3 · Medium — Tier 2\nP4 · Low — Tier 1",
};

import type { ProgramPolicy } from "@vulnseal/api/program-policy";
export { programConstructor, type ProgramPolicy } from "@vulnseal/api/program-policy";
export type SavedDeploymentInputs = { readonly [K in keyof ProgramConstructor]: string };
const deploymentFields = ["programId", "scopeDigest", "responsePolicyDigest", "responseDays", "rewardPolicyDigest", "disclosurePolicyDigest", "disclosureDelayDays"] as const;
export const validateDeploymentInputs = (input: unknown): SavedDeploymentInputs => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join() !== [...deploymentFields].sort().join()) throw new Error("Invalid saved deployment inputs");
  const value = input as SavedDeploymentInputs;
  for (const field of deploymentFields) {
    const text = value[field];
    if (typeof text !== "string") throw new Error("Invalid saved deployment input");
    if (field === "responseDays" || field === "disclosureDelayDays") {
      if (!/^(0|[1-9][0-9]{0,19})$/.test(text) || BigInt(text) > 18446744073709551615n) throw new Error("Invalid saved deployment window");
    } else if (!/^[a-f0-9]{64}$/.test(text)) throw new Error("Invalid saved deployment digest");
  }
  return { ...value };
};
export const captureDeploymentInputs = (input: ProgramConstructor): SavedDeploymentInputs => validateDeploymentInputs({
  programId: bytesToHex(input.programId), scopeDigest: bytesToHex(input.scopeDigest), responsePolicyDigest: bytesToHex(input.responsePolicyDigest), responseDays: input.responseDays.toString(),
  rewardPolicyDigest: bytesToHex(input.rewardPolicyDigest), disclosurePolicyDigest: bytesToHex(input.disclosurePolicyDigest), disclosureDelayDays: input.disclosureDelayDays.toString(),
});
export type ProgramDraft = { readonly [K in keyof ProgramPolicy]: string };
export const defaultProgramDraft: ProgramDraft = { ...defaultProgram, responseDays: String(defaultProgram.responseDays), disclosureDays: String(defaultProgram.disclosureDays) };
/** Preserve incomplete text exactly; deployment validation is a separate step. */
export const validateProgramDraft = (input: unknown): ProgramDraft => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join() !== Object.keys(defaultProgramDraft).sort().join()) throw new Error("Invalid vendor program draft");
  const draft = input as ProgramDraft;
  if (Object.values(draft).some((value) => typeof value !== "string" || utf8(value).length > 64 * 1024)) throw new Error("Program draft fields must be text of at most 64 KiB each");
  return { ...draft };
};

export const readProgramForm = (form: FormData): ProgramPolicy => {
  const field = (name: string, required = true): string => {
    const value = form.get(name);
    if (typeof value !== "string" || (required && !value.trim())) throw new Error(`Enter ${name}`);
    return value.trim().normalize("NFC");
  };
  const responseDays = Number(field("responseDays"));
  const disclosureDays = Number(field("disclosureDays"));
  if (![2, 7, 14].includes(responseDays) || ![30, 60, 90].includes(disclosureDays)) throw new Error("Choose a supported response and disclosure window");
  return {
    name: field("name"), primaryScope: field("primaryScope"), additionalScope: field("additionalScope", false),
    responseDays, disclosureDays, rewardPolicy: field("rewardPolicy"),
  };
};

export const severityLabel = (tier: number): string => `P${5 - tier}`;
