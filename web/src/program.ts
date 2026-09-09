// SPDX-License-Identifier: Apache-2.0
import { sha256, utf8 } from "@vulnseal/shared";
import type { ProgramConstructor } from "@vulnseal/api/types";

export const defaultProgram = {
  name: "Acme Security Program",
  primaryScope: "api.acme.test",
  additionalScope: "*.acme.test",
  responseDays: 7,
  disclosureDays: 90,
  rewardPolicy: "P1 · Critical — Tier 4\nP2 · High — Tier 3\nP3 · Medium — Tier 2\nP4 · Low — Tier 1",
};

export type ProgramPolicy = typeof defaultProgram;

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

export const programConstructor = async (programId: Uint8Array, policy: ProgramPolicy): Promise<ProgramConstructor> => {
  const digest = (value: unknown) => sha256(utf8(JSON.stringify(value)));
  const [scopeDigest, responsePolicyDigest, rewardPolicyDigest, disclosurePolicyDigest] = await Promise.all([
    digest({ primaryScope: policy.primaryScope, additionalScope: policy.additionalScope }),
    digest({ responseDays: policy.responseDays }),
    digest({ rewardPolicy: policy.rewardPolicy }),
    digest({ disclosureDays: policy.disclosureDays }),
  ]);
  return { programId, scopeDigest, responsePolicyDigest, rewardPolicyDigest, disclosurePolicyDigest, responseDays: BigInt(policy.responseDays), disclosureDelayDays: BigInt(policy.disclosureDays) };
};

export const severityLabel = (tier: number): string => `P${5 - tier}`;
