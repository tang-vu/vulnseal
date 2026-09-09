// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { initializeBrowserProviders } from "./browser-providers.js";

const wallet = () => {
  const connected = {
    getConnectionStatus: vi.fn().mockResolvedValue({ status: "connected", networkId: "preprod" }),
    getConfiguration: vi.fn().mockResolvedValue({ networkId: "preprod", proverServerUri: "http://127.0.0.1:6300", indexerUri: "https://indexer.example.test/graphql", indexerWsUri: "wss://indexer.example.test/graphql/ws" }),
    getShieldedAddresses: vi.fn().mockResolvedValue({ shieldedCoinPublicKey: "01".repeat(32), shieldedEncryptionPublicKey: "02".repeat(32) }),
    submitTransaction: vi.fn(),
    balanceUnsealedTransaction: vi.fn(),
  };
  window.midnight = { lace: { apiVersion: "4.0.1", connect: vi.fn().mockResolvedValue(connected) } as never };
  return connected;
};

describe("wallet network binding", () => {
  afterEach(() => { delete window.midnight; });

  it("changes the SDK network from undeployed to the connected network", async () => {
    wallet();
    setNetworkId("undeployed");
    await initializeBrowserProviders("preprod");
    expect(getNetworkId()).toBe("preprod");
  });

  it("rejects a different connection network before reading configuration", async () => {
    const connected = wallet();
    connected.getConnectionStatus.mockResolvedValue({ status: "connected", networkId: "preview" });
    await expect(initializeBrowserProviders("preprod")).rejects.toThrow("different Midnight network");
    expect(connected.getConfiguration).not.toHaveBeenCalled();
  });

  it("rejects configuration for a different network", async () => {
    const connected = wallet();
    connected.getConfiguration.mockResolvedValue({ networkId: "preview", proverServerUri: "http://127.0.0.1:6300" });
    await expect(initializeBrowserProviders("preprod")).rejects.toThrow("configuration does not match");
  });

  it("rechecks authorization before balancing and submitting", async () => {
    const connected = wallet();
    const providers = await initializeBrowserProviders("preprod");
    connected.getConnectionStatus.mockResolvedValue({ status: "disconnected" });
    await expect(providers.walletProvider.balanceTx({} as never)).rejects.toThrow("authorization was not granted");
    await expect(providers.midnightProvider.submitTx({} as never)).rejects.toThrow("authorization was not granted");
    expect(connected.balanceUnsealedTransaction).not.toHaveBeenCalled();
    expect(connected.submitTransaction).not.toHaveBeenCalled();
  });

  it("retains the transaction identifier through a connector submission error", async () => {
    const connected = wallet();
    connected.submitTransaction.mockRejectedValue(new Error("Connector response lost"));
    const providers = await initializeBrowserProviders("preprod");
    const txId = "12".repeat(32);
    const tx = { identifiers: () => [txId], serialize: () => Uint8Array.of(1, 2, 3) };
    await expect(providers.midnightProvider.submitTx(tx as never)).rejects.toMatchObject({
      name: "SubmissionOutcomeUnknown", transactionId: txId,
    });
    expect(connected.submitTransaction).toHaveBeenCalledExactlyOnceWith("010203");
  });
});
