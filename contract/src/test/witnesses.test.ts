// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { createVulnSealPrivateState, witnesses, type VulnSealPrivateState } from "../witnesses.js";

const fields = ["actorSecret", "report.programId", "report.canonicalDigest", "report.salt", "patch.reportId", "patch.patchDigest", "retest.reportId", "retest.patchCommitment", "retest.evidenceDigest"] as const;
const bytes = () => new Uint8Array(32).fill(7);
const assign = (state: VulnSealPrivateState, field: string, value: unknown) => {
  const [group, name] = field.split(".");
  if (name) Object.assign(state[group as "report" | "patch" | "retest"], { [name]: value });
  else Object.assign(state, { actorSecret: value });
};
const construct = (state: VulnSealPrivateState) => createVulnSealPrivateState(state.actorSecret, state.report, state.patch, state.retest);
const read = (state: VulnSealPrivateState) => {
  const context = { privateState: state } as Parameters<typeof witnesses.actorSecret>[0];
  return [witnesses.actorSecret(context)[1], ...witnesses.reportPreimage(context)[1], ...witnesses.patchEvidence(context)[1], ...witnesses.retestEvidence(context)[1]];
};

it.each(fields)("rejects malformed %s at construction and witness read", field => {
  for (const value of [new ArrayBuffer(32), new DataView(new ArrayBuffer(32)), new Uint16Array(16), new Int8Array(32), new Uint8ClampedArray(32), { byteLength: 32, length: 32 }, new Uint8Array(31), new Uint8Array(33)]) {
    const state = createVulnSealPrivateState(bytes());
    assign(state, field, value);
    expect(() => construct(state)).toThrow(`${field} must be exactly 32 bytes`);
    expect(() => read(state)).toThrow(`${field} must be exactly 32 bytes`);
  }
});

it.each(["Uint8Array", "Buffer"])("copies %s offset views at construction and witness read", kind => {
  const owner = kind === "Buffer" ? Buffer.alloc(64, 9) : new Uint8Array(64).fill(9);
  const input = owner.subarray(16, 48); input.fill(7);
  const source = createVulnSealPrivateState(bytes());
  for (const field of fields) assign(source, field, input);
  const state = construct(source);
  owner.fill(0);
  const outputs = read(state);
  for (const value of outputs) expect(value).toEqual(bytes());
  state.actorSecret.fill(0);
  for (const group of [state.report, state.patch, state.retest]) for (const value of Object.values(group)) value.fill(0);
  for (const value of outputs) expect(value).toEqual(bytes());
  outputs[0]!.fill(0);
  for (const value of outputs.slice(1)) expect(value).toEqual(bytes());
});

it("retains zero defaults for omitted evidence and rejects missing actor secrets", () => {
  const state = createVulnSealPrivateState(bytes());
  for (const value of read(state).slice(1)) expect(value).toEqual(new Uint8Array(32));
  for (const value of [null, undefined]) expect(() => createVulnSealPrivateState(value as unknown as Uint8Array)).toThrow("actorSecret must be exactly 32 bytes");
});
