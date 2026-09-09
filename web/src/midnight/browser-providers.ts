// Provider wiring follows the current official example-bboard browser pattern.
// SPDX-License-Identifier: Apache-2.0
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { fromHex, toHex } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/midnight-js-protocol/ledger";
import type { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import type {
  VulnSealCircuitKeys,
  VulnSealPrivateStateId,
  VulnSealProviders,
} from "@vulnseal/api/types";
import type { VulnSealPrivateState } from "@vulnseal/contract";
import { inMemoryPrivateStateProvider } from "./in-memory-private-state-provider.js";
import { submitIdentifiedTransaction } from "./submission.js";

declare global {
  interface Window {
    midnight?: { [key: string]: InitialAPI };
  }
}

const connectorMajor = 4;

const compatibleWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find((candidate): candidate is InitialAPI => {
    if (candidate === null || typeof candidate !== "object" || typeof candidate.apiVersion !== "string" || typeof candidate.connect !== "function") return false;
    const version = /^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(candidate.apiVersion);
    return version !== null && version[1] === String(connectorMajor);
  });

const waitForWallet = async (timeoutMs = 1_500): Promise<InitialAPI> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const wallet = compatibleWallet();
    if (wallet) return wallet;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Compatible Midnight Lace wallet not found");
};

const assertConnection = async (connected: ConnectedAPI, networkId: string): Promise<void> => {
  const status = await connected.getConnectionStatus();
  if (status.status !== "connected") throw new Error("Wallet authorization was not granted");
  if (status.networkId !== networkId) throw new Error("Wallet is connected to a different Midnight network");
};

const connect = async (networkId: string): Promise<ConnectedAPI> => {
  const connected = await (await waitForWallet()).connect(networkId);
  await assertConnection(connected, networkId);
  return connected;
};

export const initializeBrowserProviders = async (
  networkId: string,
  beforeSubmit?: (transactionId: TransactionId) => Promise<void>,
): Promise<VulnSealProviders> => {
  const connected = await connect(networkId);
  const config = await connected.getConfiguration();
  if (!config.proverServerUri) throw new Error("Wallet has no proof-server configuration");
  if (config.networkId !== networkId) throw new Error("Wallet configuration does not match the requested Midnight network");
  const addresses = await connected.getShieldedAddresses();
  setNetworkId(networkId);
  const zkConfigProvider = new FetchZkConfigProvider<VulnSealCircuitKeys>(
    new URL(".", window.location.href).href,
    window.fetch.bind(window),
  );
  return {
    privateStateProvider: inMemoryPrivateStateProvider<
      VulnSealPrivateStateId,
      VulnSealPrivateState
    >(),
    publicDataProvider: indexerPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri,
      window.WebSocket as unknown as Parameters<typeof indexerPublicDataProvider>[2],
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (
        transaction: UnboundTransaction,
        ttl?: Date,
      ): Promise<FinalizedTransaction> => {
        void ttl;
        await assertConnection(connected, networkId);
        const balanced = await connected.balanceUnsealedTransaction(
          toHex(transaction.serialize()),
        );
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          "signature",
          "proof",
          "binding",
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (transaction: FinalizedTransaction): Promise<TransactionId> => {
        await assertConnection(connected, networkId);
        return submitIdentifiedTransaction(transaction, async (serialized, signal) => {
          await assertConnection(connected, networkId);
          signal.throwIfAborted();
          return connected.submitTransaction(serialized);
        }, beforeSubmit);
      },
    },
  };
};
