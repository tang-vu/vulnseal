// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { bytesToHex } from "@vulnseal/shared";
import { compareProgramPolicy, programConstructor, validateProgramPolicy } from "./program-policy.js";
const policy = { name: "Example", primaryScope: "api.example.test", additionalScope: "", responseDays: 7, disclosureDays: 90, rewardPolicy: "Critical: tier 4" };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const observed = { programId: "01".repeat(32), scopeDigest: hash('{"primaryScope":"api.example.test","additionalScope":""}'), responsePolicyDigest: hash('{"responseDays":7}'), rewardPolicyDigest: hash('{"rewardPolicy":"Critical: tier 4"}'), disclosurePolicyDigest: hash('{"disclosureDays":90}'), responseDays: "7", disclosureDays: "90" };
it("compares all six fields while excluding the uncommitted display name", async () => {
  const result = await compareProgramPolicy({ ...policy, name: "Different display name" }, observed);
  expect(result.matches).toBe(true); expect(result.fields).toHaveLength(6);
});
it.each(["scopeDigest", "responsePolicyDigest", "rewardPolicyDigest", "disclosurePolicyDigest", "responseDays", "disclosureDays"] as const)("reports independent %s mismatches", async field => {
  const result = await compareProgramPolicy(policy, { ...observed, [field]: "different" });
  expect(result.matches).toBe(false); expect(result.fields.filter(item => !item.matches).map(item => item.field)).toEqual([field]);
});
it("captures observed fields before asynchronous comparison", async () => {
  const input = { ...observed }; const pending = compareProgramPolicy(policy, input);
  input.scopeDigest = "changed";
  expect((await pending).matches).toBe(true);
});
it("retains the existing JSON digest format for all four policy commitments", async () => {
  const result = await programConstructor(new Uint8Array(32).fill(1), policy);
  expect(bytesToHex(result.scopeDigest)).toBe(hash('{"primaryScope":"api.example.test","additionalScope":""}'));
  expect(bytesToHex(result.responsePolicyDigest)).toBe(hash('{"responseDays":7}'));
  expect(bytesToHex(result.rewardPolicyDigest)).toBe(hash('{"rewardPolicy":"Critical: tier 4"}'));
  expect(bytesToHex(result.disclosurePolicyDigest)).toBe(hash('{"disclosureDays":90}'));
  expect(result.responseDays).toBe(7n); expect(result.disclosureDelayDays).toBe(90n);
});
it("copies identifier and policy before hashing and retains exact text semantics", async () => {
  const id = new Uint8Array(32).fill(1), input = { ...policy, primaryScope: " api.example.test " };
  const pending = programConstructor(id, input);
  id.fill(9); input.primaryScope = "changed"; input.responseDays = 14;
  const result = await pending;
  expect(bytesToHex(result.programId)).toBe("01".repeat(32)); expect(result.responseDays).toBe(7n);
  expect(bytesToHex(result.scopeDigest)).toBe(hash('{"primaryScope":" api.example.test ","additionalScope":""}'));
});
it.each([{ ...policy, actorSecret: "private" }, { ...policy, name: " " }, { ...policy, primaryScope: "" }, { ...policy, rewardPolicy: "x".repeat(65537) }, { ...policy, responseDays: "7" }, { ...policy, disclosureDays: 91 }, { ...policy, additionalScope: null }])("rejects invalid runtime policy: %#", input => {
  expect(() => validateProgramPolicy(input)).toThrow();
});
it.each([new Uint8Array(31), new ArrayBuffer(32), Array(32).fill(1)])("rejects invalid identifier input: %#", async input => {
  await expect(programConstructor(input as Uint8Array, policy)).rejects.toThrow("32");
});
