// SPDX-License-Identifier: Apache-2.0
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type { MidnightProvider, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import type {
  VulnSealCircuitKeys,
  VulnSealPrivateStateId,
  VulnSealProviders,
} from "./types.js";
import type { VulnSealPrivateState } from "@vulnseal/contract";

export type NodeProviderOptions = {
  readonly privateStateStoreName: string;
  readonly privateStoragePasswordProvider: () => string | Promise<string>;
  readonly accountId: string;
  readonly indexerHttpUrl: string;
  readonly indexerWsUrl: string;
  readonly proofServerUrl: string;
  readonly zkConfigPath: string;
  readonly walletProvider: WalletProvider;
  readonly midnightProvider: MidnightProvider;
};

/** Current Midnight.js 4.1.1 provider wiring, matching the official bboard. */
export const createNodeProviders = (options: NodeProviderOptions): VulnSealProviders => {
  const zkConfigProvider = new NodeZkConfigProvider<VulnSealCircuitKeys>(
    options.zkConfigPath,
  );
  return {
    privateStateProvider: levelPrivateStateProvider<
      VulnSealPrivateStateId,
      VulnSealPrivateState
    >({
      privateStateStoreName: options.privateStateStoreName,
      signingKeyStoreName: `${options.privateStateStoreName}-signing-keys`,
      privateStoragePasswordProvider: options.privateStoragePasswordProvider,
      accountId: options.accountId,
    }),
    publicDataProvider: indexerPublicDataProvider(
      options.indexerHttpUrl,
      options.indexerWsUrl,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(options.proofServerUrl, zkConfigProvider),
    walletProvider: options.walletProvider,
    midnightProvider: options.midnightProvider,
  };
};
