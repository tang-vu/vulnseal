// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createConstructorContext } from "@midnight-ntwrk/compact-runtime";
import { Contract, createVulnSealPrivateState, ledger, pureCircuits, witnesses } from "@vulnseal/contract";
import { bytesToHex, randomBytes } from "@vulnseal/shared";
import { programConstructor } from "@vulnseal/api/program-policy";

// Local constructor execution only. No provider, wallet, proof or transaction is created.
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("This constructor example must not use the network"); };
try {
  const secret = randomBytes(32);
  const program = await programConstructor(randomBytes(32), {
    name: "Example disclosure program", primaryScope: "api.example.test", additionalScope: "",
    responseDays: 7, disclosureDays: 90, rewardPolicy: "Critical: tier 4; high: tier 3; medium: tier 2; low: tier 1",
  });
  const contract = new Contract(witnesses);
  const initial = contract.initialState(createConstructorContext(createVulnSealPrivateState(secret), "0".repeat(64)),
    program.programId, program.scopeDigest, program.responsePolicyDigest, program.responseDays,
    program.rewardPolicyDigest, program.disclosurePolicyDigest, program.disclosureDelayDays);
  const state = ledger(initial.currentContractState.data);
  for (const field of Object.keys(program)) assert.deepEqual(state[field], program[field], field);
  assert.deepEqual(state.ownerKey, pureCircuits.deriveVendorKey(program.programId, secret));
  assert.equal([...state.reports].length, 0);
  console.log(JSON.stringify({ mode: "offline compiled constructor; no deployment", programId: bytesToHex(state.programId), responseDays: String(state.responseDays), disclosureDelayDays: String(state.disclosureDelayDays), verifiedConstructorFields: Object.keys(program).length, reports: 0 }, null, 2));
} finally { globalThis.fetch = previousFetch; }
