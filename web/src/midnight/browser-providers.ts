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
import { walletDeadline } from "./wallet-deadline.js";
import { submitIdentifiedTransaction } from "./submission.js";
import { fetchZkArtifact } from "./fetch-zk-artifact.js";
import { boundedProofProvider } from "./bounded-proof-provider.js";

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

const waitForWallet = async (assertActive: () => void, timeoutMs = 1_500): Promise<InitialAPI> => {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    assertActive();
    const wallet = compatibleWallet();
    if (wallet) return wallet;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Compatible Midnight Lace wallet not found. Install or enable Midnight Lace in this browser profile and allow access to this site. If it is already enabled, update the extension. Then reload this page and try again.");
};

const assertConnection = async (connected: ConnectedAPI, networkId: string): Promise<void> => {
  const status = await connected.getConnectionStatus();
  if (status.status !== "connected") throw new Error("Wallet authorization was not granted");
  if (status.networkId !== networkId) throw new Error("Wallet is connected to a different Midnight network");
};

export const WALLET_SETUP_TIMEOUT_MS = 120_000;
export const WALLET_AUTHORIZATION_TIMEOUT_MS = 120_000;
export const WALLET_BALANCING_TIMEOUT_MS = 300_000;

const balanceWithDeadline = (connected: ConnectedAPI, serialized: string) => walletDeadline(
  WALLET_BALANCING_TIMEOUT_MS,
  "Wallet balancing timed out. Lace may still show or complete its request; review it before starting another attempt. VulnSeal will not submit a late result.",
  async () => connected.balanceUnsealedTransaction(serialized),
);

const assertConnectionBeforeTransaction = (connected: ConnectedAPI, networkId: string) => walletDeadline(
  WALLET_AUTHORIZATION_TIMEOUT_MS,
  "Wallet authorization check timed out. This check did not submit a transaction.",
  async () => assertConnection(connected, networkId),
);

const prepareConnection = (networkId: string) => walletDeadline(
  WALLET_SETUP_TIMEOUT_MS,
  "Wallet setup timed out. Lace may still show a connection request; review it before reconnecting. No transaction was submitted by this setup.",
  async assertActive => {
    const wallet = await waitForWallet(assertActive); assertActive();
    const connected = await wallet.connect(networkId); assertActive();
    await assertConnection(connected, networkId); assertActive();
    const config = await connected.getConfiguration(); assertActive();
    if (!config.proverServerUri) throw new Error("Wallet has no proof-server configuration");
    if (config.networkId !== networkId) throw new Error("Wallet configuration does not match the requested Midnight network");
    const addresses = await connected.getShieldedAddresses(); assertActive();
    return { connected, config: { ...config, proverServerUri: config.proverServerUri }, addresses };
  },
);

export const initializeBrowserProviders = async (
  networkId: string,
  beforeSubmit?: (transactionId: TransactionId) => Promise<void>,
): Promise<VulnSealProviders> => {
  const { connected, config, addresses } = await prepareConnection(networkId);
  setNetworkId(networkId);
  const zkConfigProvider = new FetchZkConfigProvider<VulnSealCircuitKeys>(
    new URL(".", window.location.href).href,
    fetchZkArtifact,
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
    proofProvider: boundedProofProvider(httpClientProofProvider(config.proverServerUri, zkConfigProvider)),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (
        transaction: UnboundTransaction,
        ttl?: Date,
      ): Promise<FinalizedTransaction> => {
        void ttl;
        await assertConnectionBeforeTransaction(connected, networkId);
        const balanced = await balanceWithDeadline(connected,
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
        await assertConnectionBeforeTransaction(connected, networkId);
        return submitIdentifiedTransaction(transaction, async (serialized, _signal, assertActive) => {
          await assertConnection(connected, networkId);
          assertActive();
          return connected.submitTransaction(serialized);
        }, beforeSubmit);
      },
    },
  };
};
