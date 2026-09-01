// SPDX-License-Identifier: Apache-2.0
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import type {
  Contract,
  Ledger,
  VulnSealPrivateState,
  Witnesses,
} from "@vulnseal/contract";

export const vulnSealPrivateStateKey = "vulnSealPrivateState" as const;
export type VulnSealPrivateStateId = typeof vulnSealPrivateStateKey;
export type PrivateStates = {
  readonly vulnSealPrivateState: VulnSealPrivateState;
};
export type VulnSealContract = Contract<
  VulnSealPrivateState,
  Witnesses<VulnSealPrivateState>
>;
export type VulnSealCircuitKeys = Exclude<
  keyof VulnSealContract["impureCircuits"],
  number | symbol
>;
export type VulnSealProviders = MidnightProviders<
  VulnSealCircuitKeys,
  VulnSealPrivateStateId,
  VulnSealPrivateState
>;
export type DeployedVulnSealContract = FoundContract<VulnSealContract>;

export type ProgramConstructor = {
  readonly programId: Uint8Array;
  readonly scopeDigest: Uint8Array;
  readonly responsePolicyDigest: Uint8Array;
  readonly responseDays: bigint;
  readonly rewardPolicyDigest: Uint8Array;
  readonly disclosurePolicyDigest: Uint8Array;
  readonly disclosureDelayDays: bigint;
};

export type TransactionEvidence = {
  readonly circuit: VulnSealCircuitKeys | "constructor";
  readonly txId: string;
  readonly blockHeight: string;
};

export type PublicContractSnapshot = {
  readonly contractAddress: string;
  readonly ledger: Ledger;
};
