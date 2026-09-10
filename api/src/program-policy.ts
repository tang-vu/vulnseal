// SPDX-License-Identifier: Apache-2.0
import { assertBytes32, bytesToHex, hexToBytes, sha256, utf8 } from "@vulnseal/shared";
import type { ProgramConstructor } from "./types.js";

export type ProgramPolicy = {
  readonly name: string;
  readonly primaryScope: string;
  readonly additionalScope: string;
  readonly responseDays: number;
  readonly disclosureDays: number;
  readonly rewardPolicy: string;
};
const fields = ["name", "primaryScope", "additionalScope", "responseDays", "disclosureDays", "rewardPolicy"] as const;

/** Validate and copy exact policy text. Normalization, if desired, precedes this call. */
export function validateProgramPolicy(input: unknown): ProgramPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join() !== [...fields].sort().join()) throw new Error("Invalid program policy fields");
  const value = input as ProgramPolicy;
  for (const field of ["name", "primaryScope", "additionalScope", "rewardPolicy"] as const) {
    const text = value[field];
    if (typeof text !== "string" || utf8(text).length > 64 * 1024 || (field !== "additionalScope" && !text.trim())) throw new Error(`Invalid program policy ${field}`);
  }
  if (![2, 7, 14].includes(value.responseDays) || ![30, 60, 90].includes(value.disclosureDays)) throw new Error("Choose a supported response and disclosure window");
  return { ...value };
}

/** Prepare the seven existing constructor inputs without providers or network access. */
export async function programConstructor(programId: Uint8Array, input: ProgramPolicy): Promise<ProgramConstructor> {
  if (!(programId instanceof Uint8Array)) throw new Error("programId must be a 32-byte Uint8Array");
  const id = assertBytes32(programId, "programId");
  const policy = validateProgramPolicy(input);
  const digest = (value: unknown) => sha256(utf8(JSON.stringify(value)));
  const [scopeDigest, responsePolicyDigest, rewardPolicyDigest, disclosurePolicyDigest] = await Promise.all([
    digest({ primaryScope: policy.primaryScope, additionalScope: policy.additionalScope }),
    digest({ responseDays: policy.responseDays }),
    digest({ rewardPolicy: policy.rewardPolicy }),
    digest({ disclosureDays: policy.disclosureDays }),
  ]);
  return { programId: id, scopeDigest, responsePolicyDigest, rewardPolicyDigest, disclosurePolicyDigest, responseDays: BigInt(policy.responseDays), disclosureDelayDays: BigInt(policy.disclosureDays) };
}

export type ObservedProgramPolicy = {
  readonly programId: string;
  readonly scopeDigest: string; readonly responsePolicyDigest: string;
  readonly rewardPolicyDigest: string; readonly disclosurePolicyDigest: string;
  readonly responseDays: string; readonly disclosureDays: string;
};

/** Compare exact policy content with an already observed program, without fetching. */
export async function compareProgramPolicy(input: ProgramPolicy, observed: ObservedProgramPolicy) {
  const snapshot = { ...observed };
  const expected = await programConstructor(hexToBytes(snapshot.programId), input);
  const expectedFields = {
    scopeDigest: bytesToHex(expected.scopeDigest), responsePolicyDigest: bytesToHex(expected.responsePolicyDigest),
    rewardPolicyDigest: bytesToHex(expected.rewardPolicyDigest), disclosurePolicyDigest: bytesToHex(expected.disclosurePolicyDigest),
    responseDays: String(expected.responseDays), disclosureDays: String(expected.disclosureDelayDays),
  };
  const fields = (Object.keys(expectedFields) as (keyof typeof expectedFields)[]).map(field => ({ field, expected: expectedFields[field], observed: snapshot[field], matches: expectedFields[field] === snapshot[field] }));
  return { programId: snapshot.programId, matches: fields.every(field => field.matches), fields };
}
