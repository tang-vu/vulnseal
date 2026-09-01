// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it } from "vitest";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ReportStatus } from "../managed/vulnseal/contract/index.js";
import {
  createVulnSealPrivateState,
  type VulnSealPrivateState,
} from "../witnesses.js";
import {
  type ProgramConfiguration,
  VulnSealSimulator,
} from "./vulnseal-simulator.js";

setNetworkId("undeployed");

const bytes = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

const config: ProgramConfiguration = {
  programId: bytes(1),
  scopeDigest: bytes(2),
  responsePolicyDigest: bytes(3),
  responseDays: 7n,
  rewardPolicyDigest: bytes(4),
  disclosurePolicyDigest: bytes(5),
  disclosureDelayDays: 90n,
};

const vendorSecret = bytes(11);
const researcherSecret = bytes(22);
const canonicalDigest = bytes(33);
const salt = bytes(44);
const ciphertextDigest = bytes(55);
const decisionDigest = bytes(66);
const patchDigest = bytes(77);
const retestDigest = bytes(88);

const vendorState = (
  patch: Partial<VulnSealPrivateState["patch"]> = {},
): VulnSealPrivateState =>
  createVulnSealPrivateState(vendorSecret, undefined, patch);

const researcherState = (
  report: Partial<VulnSealPrivateState["report"]> = {},
  retest: Partial<VulnSealPrivateState["retest"]> = {},
): VulnSealPrivateState =>
  createVulnSealPrivateState(
    researcherSecret,
    {
      programId: config.programId,
      canonicalDigest,
      salt,
      ...report,
    },
    undefined,
    retest,
  );

type Submitted = {
  simulator: VulnSealSimulator;
  reportId: Uint8Array;
};

const submitted = (): Submitted => {
  const simulator = new VulnSealSimulator(vendorState(), config);
  simulator.switchActor(researcherState());
  const reportId = simulator.submitReport(ciphertextDigest);
  return { simulator, reportId };
};

const accepted = (): Submitted => {
  const state = submitted();
  state.simulator.switchActor(vendorState());
  state.simulator.beginTriage(state.reportId);
  state.simulator.acceptReport(state.reportId, 3n, decisionDigest);
  return state;
};

describe("VulnSeal Compact contract", () => {
  beforeEach(() => setNetworkId("undeployed"));

  it("initializes a program with owner authorization and public policy", () => {
    const simulator = new VulnSealSimulator(vendorState(), config);
    const ledger = simulator.getLedger();
    expect(ledger.programId).toEqual(config.programId);
    expect(ledger.scopeDigest).toEqual(config.scopeDigest);
    expect(ledger.responseDays).toBe(7n);
    expect(ledger.disclosureDelayDays).toBe(90n);
    expect(ledger.sequence).toBe(1n);
    expect(ledger.reports.isEmpty()).toBe(true);
    expect(ledger.ownerKey).not.toEqual(vendorSecret);
  });

  it("commits a report with the Compact-derived commitment and receipt", () => {
    const { simulator, reportId } = submitted();
    const expected = simulator.deriveReportCommitment(
      config.programId,
      canonicalDigest,
      salt,
    );
    const report = simulator.report(reportId);
    expect(reportId).toEqual(expected);
    expect(report.commitment).toEqual(expected);
    expect(report.ciphertextDigest).toEqual(ciphertextDigest);
    expect(report.submissionReceipt).not.toEqual(new Uint8Array(32));
    expect(report.status).toBe(ReportStatus.COMMITTED);
  });

  it("rejects a different private report preimage during researcher authorization", () => {
    const { simulator, reportId } = accepted();
    simulator.switchActor(vendorState({ reportId, patchDigest }));
    const patch = simulator.anchorPatch(reportId);
    simulator.switchActor(
      researcherState(
        { canonicalDigest: bytes(99) },
        { reportId, patchCommitment: patch, evidenceDigest: retestDigest },
      ),
    );
    expect(() => simulator.submitRetest(reportId, true)).toThrow(
      "Report preimage does not match commitment",
    );
  });

  it("rejects a different researcher secret", () => {
    const { simulator, reportId } = accepted();
    simulator.switchActor(vendorState({ reportId, patchDigest }));
    const patch = simulator.anchorPatch(reportId);
    simulator.switchActor(
      createVulnSealPrivateState(
        bytes(100),
        { programId: config.programId, canonicalDigest, salt },
        undefined,
        { reportId, patchCommitment: patch, evidenceDigest: retestDigest },
      ),
    );
    expect(() => simulator.submitRetest(reportId, true)).toThrow(
      "Researcher secret does not authorize this report",
    );
  });

  it("rejects unauthorized vendor triage", () => {
    const { simulator, reportId } = submitted();
    expect(() => simulator.beginTriage(reportId)).toThrow(
      "Only the program owner may perform this transition",
    );
  });

  it("rejects illegal state transitions", () => {
    const { simulator, reportId } = submitted();
    simulator.switchActor(vendorState());
    expect(() => simulator.acceptReport(reportId, 2n, decisionDigest)).toThrow(
      "Only a triaged report can be accepted",
    );
  });

  it("rejects replay of the same sealed artifact", () => {
    const { simulator } = submitted();
    expect(() => simulator.submitReport(ciphertextDigest)).toThrow(
      "Report commitment already exists",
    );
  });

  it("rejects patch evidence bound to another report", () => {
    const { simulator, reportId } = accepted();
    simulator.switchActor(vendorState({ reportId: bytes(101), patchDigest }));
    expect(() => simulator.anchorPatch(reportId)).toThrow(
      "Patch evidence is bound to another report",
    );
  });

  it("rejects retest evidence bound to another patch", () => {
    const { simulator, reportId } = accepted();
    simulator.switchActor(vendorState({ reportId, patchDigest }));
    simulator.anchorPatch(reportId);
    simulator.switchActor(
      researcherState({}, {
        reportId,
        patchCommitment: bytes(102),
        evidenceDigest: retestDigest,
      }),
    );
    expect(() => simulator.submitRetest(reportId, true)).toThrow(
      "Retest evidence is bound to another patch",
    );
  });

  it("rejects payout authorization before acceptance", () => {
    const { simulator, reportId } = submitted();
    simulator.switchActor(vendorState());
    expect(() => simulator.authorizePayout(reportId, 2n)).toThrow(
      "Payout authorization requires a passing retest",
    );
  });

  it("rejects payout authorization before a passing retest", () => {
    const { simulator, reportId } = accepted();
    simulator.switchActor(vendorState({ reportId, patchDigest }));
    simulator.anchorPatch(reportId);
    expect(() => simulator.authorizePayout(reportId, 2n)).toThrow(
      "Payout authorization requires a passing retest",
    );
  });

  it("executes the complete accepted lifecycle", () => {
    const { simulator, reportId } = accepted();
    simulator.switchActor(vendorState({ reportId, patchDigest }));
    const patch = simulator.anchorPatch(reportId);
    simulator.switchActor(
      researcherState({}, {
        reportId,
        patchCommitment: patch,
        evidenceDigest: retestDigest,
      }),
    );
    const retest = simulator.submitRetest(reportId, true);
    simulator.switchActor(vendorState());
    const payout = simulator.authorizePayout(reportId, 3n);
    const report = simulator.report(reportId);
    expect(report.status).toBe(ReportStatus.PAYOUT_AUTHORIZED);
    expect(report.patchCommitment).toEqual(patch);
    expect(report.retestCommitment).toEqual(retest);
    expect(report.retestPassed).toBe(true);
    expect(report.payoutReceipt).toEqual(payout);
    expect(simulator.getLedger().payoutReceipts.member(payout)).toBe(true);
  });

  it("does not expose private report inputs in public ledger fields", () => {
    const { simulator, reportId } = submitted();
    const ledger = simulator.getLedger();
    const report = simulator.report(reportId);
    const publicByteFields = [
      ledger.programId,
      ledger.ownerKey,
      ledger.scopeDigest,
      ledger.responsePolicyDigest,
      ledger.rewardPolicyDigest,
      ledger.disclosurePolicyDigest,
      report.commitment,
      report.ciphertextDigest,
      report.researcherKey,
      report.submissionReceipt,
      report.decisionDigest,
      report.patchCommitment,
      report.retestCommitment,
      report.payoutReceipt,
    ];
    expect(publicByteFields).not.toContainEqual(canonicalDigest);
    expect(publicByteFields).not.toContainEqual(salt);
    expect(publicByteFields).not.toContainEqual(researcherSecret);
    expect(Object.keys(report)).toEqual([
      "commitment",
      "ciphertextDigest",
      "researcherKey",
      "submissionReceipt",
      "status",
      "severity",
      "decisionDigest",
      "patchCommitment",
      "retestCommitment",
      "retestPassed",
      "payoutReceipt",
      "rewardTier",
      "createdSequence",
      "updatedSequence",
    ]);
  });
});
