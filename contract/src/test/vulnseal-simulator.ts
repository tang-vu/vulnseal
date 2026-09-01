// SPDX-License-Identifier: Apache-2.0
import {
  type CircuitContext,
  CostModel,
  createConstructorContext,
  QueryContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
  pureCircuits,
  type ReportRecord,
} from "../managed/vulnseal/contract/index.js";
import {
  type VulnSealPrivateState,
  witnesses,
} from "../witnesses.js";

export type ProgramConfiguration = {
  programId: Uint8Array;
  scopeDigest: Uint8Array;
  responsePolicyDigest: Uint8Array;
  responseDays: bigint;
  rewardPolicyDigest: Uint8Array;
  disclosurePolicyDigest: Uint8Array;
  disclosureDelayDays: bigint;
};

export class VulnSealSimulator {
  readonly contract = new Contract<VulnSealPrivateState>(witnesses);
  circuitContext: CircuitContext<VulnSealPrivateState>;

  constructor(ownerState: VulnSealPrivateState, config: ProgramConfiguration) {
    const initial = this.contract.initialState(
      createConstructorContext(ownerState, "0".repeat(64)),
      config.programId,
      config.scopeDigest,
      config.responsePolicyDigest,
      config.responseDays,
      config.rewardPolicyDigest,
      config.disclosurePolicyDigest,
      config.disclosureDelayDays,
    );
    this.circuitContext = {
      currentPrivateState: initial.currentPrivateState,
      currentZswapLocalState: initial.currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        initial.currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  switchActor(privateState: VulnSealPrivateState): void {
    this.circuitContext.currentPrivateState = privateState;
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): VulnSealPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  report(reportId: Uint8Array): ReportRecord {
    return this.getLedger().reports.lookup(reportId);
  }

  deriveReportCommitment(
    programId: Uint8Array,
    reportDigest: Uint8Array,
    salt: Uint8Array,
  ): Uint8Array {
    return pureCircuits.deriveReportCommitment(programId, reportDigest, salt);
  }

  submitReport(ciphertextDigest: Uint8Array): Uint8Array {
    const result = this.contract.impureCircuits.submitReport(
      this.circuitContext,
      ciphertextDigest,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  beginTriage(reportId: Uint8Array): void {
    this.circuitContext = this.contract.impureCircuits.beginTriage(
      this.circuitContext,
      reportId,
    ).context;
  }

  acceptReport(
    reportId: Uint8Array,
    severity: bigint,
    decisionDigest: Uint8Array,
  ): void {
    this.circuitContext = this.contract.impureCircuits.acceptReport(
      this.circuitContext,
      reportId,
      severity,
      decisionDigest,
    ).context;
  }

  rejectReport(reportId: Uint8Array, decisionDigest: Uint8Array): void {
    this.circuitContext = this.contract.impureCircuits.rejectReport(
      this.circuitContext,
      reportId,
      decisionDigest,
    ).context;
  }

  anchorPatch(reportId: Uint8Array): Uint8Array {
    const result = this.contract.impureCircuits.anchorPatch(
      this.circuitContext,
      reportId,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  submitRetest(reportId: Uint8Array, passed: boolean): Uint8Array {
    const result = this.contract.impureCircuits.submitRetest(
      this.circuitContext,
      reportId,
      passed,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  authorizePayout(reportId: Uint8Array, rewardTier: bigint): Uint8Array {
    const result = this.contract.impureCircuits.authorizePayout(
      this.circuitContext,
      reportId,
      rewardTier,
    );
    this.circuitContext = result.context;
    return result.result;
  }
}
