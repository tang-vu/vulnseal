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

export const PUBLIC_STATE_TIMEOUT_MS = 20_000;

export type SafeLogger = {
  info(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
};

// Logging is observational: a sink failure or mutation must not change transaction outcomes.
const logSafely = (logger: SafeLogger | undefined, level: keyof SafeLogger, message: string, context: unknown): void => {
  if (!logger) return;
  try {
    const result = logger[level](message, structuredClone(context));
    void Promise.resolve(result).catch(() => {});
  } catch { /* Preserve the SDK outcome when an optional log sink fails. */ }
};

const evidence = (
  circuit: VulnSealCircuitKeys | "constructor",
  publicData: unknown,
): TransactionEvidence => {
  const invalid = () => new Error("Invalid Midnight transaction evidence: expected a transaction identifier and non-negative integer block height");
  if (!publicData || typeof publicData !== "object" || Array.isArray(publicData)) throw invalid();
  const data = publicData as Record<string, unknown>;
  const txId = data.txId ?? data.txHash;
  if (typeof txId !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{66})$/.test(txId)) throw invalid();
  const blockHeight = data.blockHeight;
  const validHeight = typeof blockHeight === "bigint" ? blockHeight >= 0n
    : typeof blockHeight === "number" ? Number.isSafeInteger(blockHeight) && blockHeight >= 0
    : typeof blockHeight === "string" && /^(?:0|[1-9][0-9]*)$/.test(blockHeight);
  if (!validHeight) throw invalid();
  return { circuit, txId, blockHeight: String(blockHeight) };
};

/** Adapter over real Midnight.js deployment, proof, indexer, and wallet providers. */
export class VulnSealApi {
  private static readonly privateStateQueues = new WeakMap<object, Promise<void>>();
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
    logSafely(logger, "info", "Deploying VulnSeal program", redactForLog({ program }));
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

  /** Keep a role's witness installation and transaction together, even across contracts sharing a provider. */
  async withPrivateState<T>(privateState: VulnSealPrivateState, invoke: () => Promise<T>): Promise<T> {
    // Copy before acquiring the queue: malformed input must not leave a locked provider.
    const snapshot = structuredClone(privateState);
    const provider = this.providers.privateStateProvider;
    const previous = VulnSealApi.privateStateQueues.get(provider) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    VulnSealApi.privateStateQueues.set(provider, current);
    await previous;
    try {
      await this.usePrivateState(snapshot);
      return await invoke();
    } finally {
      release();
      if (VulnSealApi.privateStateQueues.get(provider) === current) VulnSealApi.privateStateQueues.delete(provider);
    }
  }

  async readPublicState(): Promise<PublicContractSnapshot> {
    const deadlineError = new Error("Public state read timed out. Retry the read when the indexer is available; this does not change transaction finality.");
    const wallDeadline = Date.now() + PUBLIC_STATE_TIMEOUT_MS;
    const monotonicDeadline = performance.now() + PUBLIC_STATE_TIMEOUT_MS;
    const assertActive = () => {
      if (Date.now() >= wallDeadline || performance.now() >= monotonicDeadline) throw deadlineError;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(deadlineError), PUBLIC_STATE_TIMEOUT_MS);
    });
    try {
      const state = await Promise.race([
        this.providers.publicDataProvider.queryContractState(this.contractAddress),
        timeout,
      ]);
      assertActive();
      if (state === null) throw new Error("Contract state is unavailable from the indexer");
      const decoded = ledger(state.data);
      assertActive();
      return { contractAddress: this.contractAddress, ledger: decoded };
    } catch (error) { assertActive(); throw error; }
    finally { clearTimeout(timer); }
  }

  private async call(
    circuit: VulnSealCircuitKeys,
    invoke: () => Promise<{ public: unknown }>,
  ): Promise<TransactionEvidence> {
    logSafely(this.logger, "info", "Submitting authorized contract transition", { circuit });
    try {
      const result = await invoke();
      const transaction = evidence(circuit, result.public);
      logSafely(this.logger, "info", "Contract transition finalized", transaction);
      return transaction;
    } catch (error) {
      logSafely(this.logger, "error", "Contract transition failed", {
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
