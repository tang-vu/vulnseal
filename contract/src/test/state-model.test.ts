// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ReportStatus } from "../managed/vulnseal/contract/index.js";
import { createVulnSealPrivateState } from "../witnesses.js";
import { VulnSealSimulator } from "./vulnseal-simulator.js";

const bytes = (n: number) => new Uint8Array(32).fill(n);
const config = { programId: bytes(1), scopeDigest: bytes(2), responsePolicyDigest: bytes(3), responseDays: 7n, rewardPolicyDigest: bytes(4), disclosurePolicyDigest: bytes(5), disclosureDelayDays: 90n };
const preimage = { programId: config.programId, canonicalDigest: bytes(33), salt: bytes(44) };
type Stage = "committed" | "triaged" | "accepted" | "rejected" | "patch" | "failed" | "passed" | "authorized" | "closedRejected" | "closedPaid";
type Operation = "triage" | "accept" | "reject" | "patch" | "pass" | "fail" | "authorize" | "close" | "duplicate";
type Actor = "owner" | "researcher" | "stranger";
const stages: Stage[] = ["committed", "triaged", "accepted", "rejected", "patch", "failed", "passed", "authorized", "closedRejected", "closedPaid"];
const operations: Operation[] = ["triage", "accept", "reject", "patch", "pass", "fail", "authorize", "close", "duplicate"];
// Independent workflow table: every absent edge must reject, even for the owner.
const allowed: Partial<Record<Stage, Partial<Record<Operation, ReportStatus>>>> = {
  committed: { triage: ReportStatus.TRIAGED },
  triaged: { accept: ReportStatus.ACCEPTED, reject: ReportStatus.REJECTED },
  accepted: { patch: ReportStatus.PATCH_READY },
  rejected: { close: ReportStatus.CLOSED },
  patch: { pass: ReportStatus.RETEST_PASSED, fail: ReportStatus.RETEST_FAILED },
  failed: { patch: ReportStatus.PATCH_READY },
  passed: { authorize: ReportStatus.PAYOUT_AUTHORIZED },
  authorized: { close: ReportStatus.CLOSED },
};

function fixture(stage: Stage) {
  const sim = new VulnSealSimulator(createVulnSealPrivateState(bytes(11)), config);
  sim.switchActor(createVulnSealPrivateState(bytes(23), { ...preimage, salt: bytes(45) }));
  const other = sim.submitReport(bytes(56));
  sim.switchActor(createVulnSealPrivateState(bytes(22), preimage));
  const id = sim.submitReport(bytes(55));
  const actor = (who: Actor) => sim.switchActor(createVulnSealPrivateState(bytes(who === "owner" ? 11 : who === "researcher" ? 22 : 99), preimage, { reportId: id, patchDigest: bytes(77) }, { reportId: id, patchCommitment: sim.report(id).patchCommitment, evidenceDigest: bytes(88) }));
  actor("owner");
  if (stage !== "committed") sim.beginTriage(id);
  if (["rejected", "closedRejected"].includes(stage)) {
    sim.rejectReport(id, bytes(66));
    if (stage === "closedRejected") sim.closeReport(id);
  } else if (!["committed", "triaged"].includes(stage)) {
    sim.acceptReport(id, 3n, bytes(66));
    if (stage !== "accepted") {
      sim.anchorPatch(id);
      if (stage !== "patch") {
        actor("researcher"); sim.submitRetest(id, stage !== "failed"); actor("owner");
        if (stage === "authorized" || stage === "closedPaid") sim.authorizePayout(id, 3n);
        if (stage === "closedPaid") sim.closeReport(id);
      }
    }
  }
  return { sim, id, other, actor };
}

function projection(sim: VulnSealSimulator) {
  const { reports, payoutReceipts, ...fields } = sim.getLedger();
  const records = [...reports];
  return structuredClone({ fields, records, receiptCount: payoutReceipts.size(), receiptMembership: records.map(([, record]) => payoutReceipts.member(record.payoutReceipt)) });
}

it.each(stages)("enforces the transition/actor matrix and report isolation from %s", (stage) => {
  setNetworkId("undeployed");
  for (const who of ["owner", "researcher", "stranger"] as const) for (const operation of operations) {
    const { sim, id, other, actor } = fixture(stage);
    actor(who);
    const before = projection(sim), prior = sim.report(id), untouched = sim.report(other);
    const invoke = () => {
      switch (operation) {
        case "triage": return sim.beginTriage(id);
        case "accept": return sim.acceptReport(id, 4n, bytes(67));
        case "reject": return sim.rejectReport(id, bytes(67));
        case "patch": return sim.anchorPatch(id);
        case "pass": return sim.submitRetest(id, true);
        case "fail": return sim.submitRetest(id, false);
        case "authorize": return sim.authorizePayout(id, 4n);
        case "close": return sim.closeReport(id);
        case "duplicate": return sim.submitReport(bytes(57));
      }
    };
    const target = allowed[stage]?.[operation];
    const authorized = who === (operation === "pass" || operation === "fail" ? "researcher" : "owner");
    const context = `${stage}/${who}/${operation}`;
    if (target === undefined || !authorized) {
      expect(invoke, context).toThrow();
      expect(projection(sim), context).toEqual(before);
    } else {
      invoke();
      const record = sim.report(id), ledger = sim.getLedger();
      expect(record.status, context).toBe(target);
      expect(ledger.sequence, context).toBe(before.fields.sequence + 1n);
      expect(record.updatedSequence, context).toBe(before.fields.sequence);
      for (const field of ["commitment", "ciphertextDigest", "researcherKey", "submissionReceipt", "createdSequence"] as const) expect(record[field], `${context}/${field}`).toEqual(prior[field]);
      if (operation === "patch") { expect(record.retestCommitment).toEqual(bytes(0)); expect(record.retestPassed).toBe(false); }
      if (operation === "authorize") { expect(ledger.payoutReceipts.member(record.payoutReceipt)).toBe(true); expect(ledger.payoutReceipts.size()).toBe(before.receiptCount + 1n); }
      else expect(ledger.payoutReceipts.size()).toBe(before.receiptCount);
    }
    expect(sim.report(other), `${context}/unrelated report`).toEqual(untouched);
  }
}, 30_000);
