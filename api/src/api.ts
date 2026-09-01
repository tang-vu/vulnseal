// SPDX-License-Identifier: Apache-2.0
import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import type { ContractAddress } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import {
  compiledVulnSealContract,
  ledger,
  type VulnSealPrivateState,
} from "@vulnseal/contract";
import { redactForLog } from "@vulnseal/shared";
import type {
  DeployedVulnSealContract,
  ProgramConstructor,
  PublicContractSnapshot,
  TransactionEvidence,
  VulnSealCircuitKeys,
  VulnSealProviders,
} from "./types.js";
import { vulnSealPrivateStateKey } from "./types.js";

export type SafeLogger = {
  info(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
};

const evidence = (
  circuit: VulnSealCircuitKeys | "constructor",
  publicData: unknown,
): TransactionEvidence => {
  const data = publicData as Record<string, unknown>;
  const txId = data.txId ?? data.txHash;
  if (typeof txId !== "string") throw new Error("Midnight result did not include a transaction id");
  const blockHeight = data.blockHeight;
  if (typeof blockHeight !== "bigint" && typeof blockHeight !== "number" && typeof blockHeight !== "string") {
    throw new Error("Midnight result did not include a block height");
  }
  return { circuit, txId, blockHeight: String(blockHeight) };
};

/** Adapter over real Midnight.js deployment, proof, indexer, and wallet providers. */
export class VulnSealApi {
  private constructor(
    readonly deployedContract: DeployedVulnSealContract,
    private readonly providers: VulnSealProviders,
    private readonly logger?: SafeLogger,
  ) {
    providers.privateStateProvider.setContractAddress(this.contractAddress);
  }

  get contractAddress(): ContractAddress {
    return this.deployedContract.deployTxData.public.contractAddress;
  }

  static async deploy(
    providers: VulnSealProviders,
    privateState: VulnSealPrivateState,
    program: ProgramConstructor,
    logger?: SafeLogger,
  ): Promise<{ api: VulnSealApi; evidence: TransactionEvidence }> {
    logger?.info("Deploying VulnSeal program", redactForLog({ program }));
    const deployed = await deployContract(providers, {
      compiledContract: compiledVulnSealContract,
      privateStateId: vulnSealPrivateStateKey,
      initialPrivateState: privateState,
      args: [
        program.programId,
        program.scopeDigest,
        program.responsePolicyDigest,
        program.responseDays,
        program.rewardPolicyDigest,
        program.disclosurePolicyDigest,
        program.disclosureDelayDays,
      ],
    });
    const api = new VulnSealApi(deployed, providers, logger);
    return { api, evidence: evidence("constructor", deployed.deployTxData.public) };
  }

  static async join(
    providers: VulnSealProviders,
    contractAddress: ContractAddress,
    privateState: VulnSealPrivateState,
    logger?: SafeLogger,
  ): Promise<VulnSealApi> {
    const deployed = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: compiledVulnSealContract,
      privateStateId: vulnSealPrivateStateKey,
      initialPrivateState: privateState,
    });
    return new VulnSealApi(deployed, providers, logger);
  }

  async usePrivateState(privateState: VulnSealPrivateState): Promise<void> {
    this.providers.privateStateProvider.setContractAddress(this.contractAddress);
    await this.providers.privateStateProvider.set(vulnSealPrivateStateKey, privateState);
  }

  async readPublicState(): Promise<PublicContractSnapshot> {
    const state = await this.providers.publicDataProvider.queryContractState(this.contractAddress);
    if (state === null) throw new Error("Contract state is unavailable from the indexer");
    return { contractAddress: this.contractAddress, ledger: ledger(state.data) };
  }

  private async call(
    circuit: VulnSealCircuitKeys,
    invoke: () => Promise<{ public: unknown }>,
  ): Promise<TransactionEvidence> {
    this.logger?.info("Submitting authorized contract transition", { circuit });
    try {
      const result = await invoke();
      const transaction = evidence(circuit, result.public);
      this.logger?.info("Contract transition finalized", transaction);
      return transaction;
    } catch (error) {
      this.logger?.error("Contract transition failed", {
        circuit,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  submitReport(ciphertextDigest: Uint8Array): Promise<TransactionEvidence> {
    return this.call("submitReport", () => this.deployedContract.callTx.submitReport(ciphertextDigest));
  }

  beginTriage(reportId: Uint8Array): Promise<TransactionEvidence> {
    return this.call("beginTriage", () => this.deployedContract.callTx.beginTriage(reportId));
  }

  acceptReport(
    reportId: Uint8Array,
    severity: bigint,
    decisionDigest: Uint8Array,
  ): Promise<TransactionEvidence> {
    return this.call("acceptReport", () =>
      this.deployedContract.callTx.acceptReport(reportId, severity, decisionDigest),
    );
  }

  rejectReport(reportId: Uint8Array, decisionDigest: Uint8Array): Promise<TransactionEvidence> {
    return this.call("rejectReport", () =>
      this.deployedContract.callTx.rejectReport(reportId, decisionDigest),
    );
  }

  anchorPatch(reportId: Uint8Array): Promise<TransactionEvidence> {
    return this.call("anchorPatch", () => this.deployedContract.callTx.anchorPatch(reportId));
  }

  submitRetest(reportId: Uint8Array, passed: boolean): Promise<TransactionEvidence> {
    return this.call("submitRetest", () =>
      this.deployedContract.callTx.submitRetest(reportId, passed),
    );
  }

  authorizePayout(reportId: Uint8Array, rewardTier: bigint): Promise<TransactionEvidence> {
    return this.call("authorizePayout", () =>
      this.deployedContract.callTx.authorizePayout(reportId, rewardTier),
    );
  }

  closeReport(reportId: Uint8Array): Promise<TransactionEvidence> {
    return this.call("closeReport", () => this.deployedContract.callTx.closeReport(reportId));
  }
}
