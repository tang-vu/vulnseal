// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ReportStatus } from "../managed/vulnseal/contract/index.js";
import { createVulnSealPrivateState } from "../witnesses.js";
import { VulnSealSimulator } from "./vulnseal-simulator.js";

const bytes = (value: number) => new Uint8Array(32).fill(value);
type Command = "triage" | "accept" | "reject" | "patch" | "fail" | "pass" | "authorize" | "close";
const statusAfter: Record<Command, ReportStatus> = {
  triage: ReportStatus.TRIAGED, accept: ReportStatus.ACCEPTED, reject: ReportStatus.REJECTED,
  patch: ReportStatus.PATCH_READY, fail: ReportStatus.RETEST_FAILED, pass: ReportStatus.RETEST_PASSED,
  authorize: ReportStatus.PAYOUT_AUTHORIZED, close: ReportStatus.CLOSED,
};
const accepted: Command[] = ["triage", "accept", "patch", "fail", "patch", "fail", "patch", "pass", "authorize", "close"];
const rejected: Command[] = ["triage", "reject", "close"];
const changedFields: Record<Command, string[]> = {
  triage: [], accept: ["severity", "decisionDigest"], reject: ["decisionDigest"],
  patch: ["patchCommitment", "retestCommitment", "retestPassed"],
  fail: ["retestCommitment", "retestPassed"], pass: ["retestCommitment", "retestPassed"],
  authorize: ["payoutReceipt", "rewardTier"], close: [],
};

it.each([0x125af, 0x78bc1, 0xd3e91])("preserves report isolation through interleaved replacement-patch lifecycles (seed %i)", (seed) => {
  setNetworkId("undeployed");
  let random = seed;
  const next = (bound: number) => { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return (random >>> 0) % bound; };
  const config = { programId: bytes(1), scopeDigest: bytes(2), responsePolicyDigest: bytes(3), responseDays: 7n, rewardPolicyDigest: bytes(4), disclosurePolicyDigest: bytes(5), disclosureDelayDays: 90n };
  const sim = new VulnSealSimulator(createVulnSealPrivateState(bytes(11)), config);
  let sequence = 1n;
  const reports = Array.from({ length: 5 }, (_, index) => {
    const secret = bytes(20 + index);
    const preimage = { programId: config.programId, canonicalDigest: bytes(40 + index), salt: bytes(50 + index) };
    sim.switchActor(createVulnSealPrivateState(secret, preimage));
    const id = sim.submitReport(bytes(60 + index));
    expect(sim.report(id).createdSequence).toBe(sequence++);
    return { id, secret, preimage, plan: index % 2 === 0 ? accepted : rejected, cursor: 0, patches: [] as Uint8Array[] };
  });
  const snapshot = () => {
    const { reports: records, payoutReceipts, ...policy } = sim.getLedger();
    return structuredClone({ policy, records: [...records], receiptCount: payoutReceipts.size(), receiptMembership: [...records].map(([, record]) => payoutReceipts.member(record.payoutReceipt)) });
  };
  const initialPolicy = snapshot().policy;
  const receiptIds = new Set<string>();
  while (reports.some(report => report.cursor < report.plan.length)) {
    const unfinished = reports.filter(report => report.cursor < report.plan.length);
    const selected = unfinished[next(unfinished.length)]!;
    const command = selected.plan[selected.cursor]!;
    const label = `seed ${seed}, sequence ${sequence}, report ${reports.indexOf(selected)}, command ${command}`;
    const before = snapshot(), prior = structuredClone(sim.report(selected.id));
    const isRetest = command === "pass" || command === "fail";
    const patchDigest = bytes(100 + reports.indexOf(selected) * 10 + selected.patches.length);
    const actor = (secret: Uint8Array, patch = prior.patchCommitment) => sim.switchActor(createVulnSealPrivateState(secret, selected.preimage,
      { reportId: selected.id, patchDigest }, { reportId: selected.id, patchCommitment: patch, evidenceDigest: bytes(80 + selected.cursor) }));
    const invoke = () => {
      switch (command) {
        case "triage": return sim.beginTriage(selected.id);
        case "accept": return sim.acceptReport(selected.id, 3n, bytes(70));
        case "reject": return sim.rejectReport(selected.id, bytes(71));
        case "patch": return sim.anchorPatch(selected.id);
        case "fail": return sim.submitRetest(selected.id, false);
        case "pass": return sim.submitRetest(selected.id, true);
        case "authorize": return sim.authorizePayout(selected.id, 4n);
        case "close": return sim.closeReport(selected.id);
      }
    };
    // Use another actual participant, not just an arbitrary invalid witness.
    actor(isRetest ? reports[(reports.indexOf(selected) + 1) % reports.length]!.secret : selected.secret);
    expect(invoke, `${label}: wrong participant`).toThrow();
    expect(snapshot(), `${label}: rejected call changed state`).toEqual(before);
    if (isRetest && selected.patches.length > 1) {
      actor(selected.secret, selected.patches[selected.patches.length - 2]);
      expect(invoke, `${label}: stale patch`).toThrow("Retest evidence is bound to another patch");
      expect(snapshot(), `${label}: stale retest changed state`).toEqual(before);
    }
    actor(isRetest ? selected.secret : bytes(11)); invoke(); selected.cursor++;
    const after = snapshot(), record = sim.report(selected.id);
    expect(after.policy, label).toEqual({ ...initialPolicy, sequence: ++sequence });
    expect(record.status, label).toBe(statusAfter[command]);
    expect(record.updatedSequence, label).toBe(sequence - 1n);
    for (const field of Object.keys(prior) as (keyof typeof prior)[]) {
      if (!["status", "updatedSequence", ...changedFields[command]].includes(field)) expect(record[field], `${label}: preserved ${field}`).toEqual(prior[field]);
    }
    for (const other of reports.filter(report => report !== selected)) {
      expect(sim.report(other.id), `${label}: other report`).toEqual(before.records.find(([id]) => id.every((byte, index) => byte === other.id[index]))![1]);
    }
    if (command === "patch") {
      expect(selected.patches.some(patch => patch.every((byte, index) => byte === record.patchCommitment[index])), label).toBe(false);
      selected.patches.push(record.patchCommitment);
      expect(record.retestCommitment).toEqual(bytes(0)); expect(record.retestPassed).toBe(false);
    }
    if (command === "authorize") {
      const receipt = Array.from(record.payoutReceipt).join(",");
      expect(receiptIds.has(receipt), `${label}: reused receipt`).toBe(false); receiptIds.add(receipt);
      expect(sim.getLedger().payoutReceipts.member(record.payoutReceipt)).toBe(true);
    }
    expect(after.receiptCount, label).toBe(BigInt(receiptIds.size));
  }
  expect(receiptIds.size).toBe(3);
  for (const selected of reports) {
    expect(sim.report(selected.id).status).toBe(ReportStatus.CLOSED);
    const before = snapshot();
    sim.switchActor(createVulnSealPrivateState(bytes(11)));
    expect(() => sim.closeReport(selected.id)).toThrow();
    expect(() => sim.authorizePayout(selected.id, 4n)).toThrow();
    sim.switchActor(createVulnSealPrivateState(selected.secret, selected.preimage));
    expect(() => sim.submitReport(bytes(200))).toThrow();
    expect(snapshot()).toEqual(before);
  }
}, 30_000);
