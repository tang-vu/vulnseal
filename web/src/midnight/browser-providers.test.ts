// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { initializeBrowserProviders, WALLET_SETUP_TIMEOUT_MS, WALLET_AUTHORIZATION_TIMEOUT_MS } from "./browser-providers.js";
import { WALLET_SUBMISSION_TIMEOUT_MS } from "./submission.js";

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
  afterEach(() => { delete window.midnight; vi.useRealTimers(); });

  it.each(["balance", "submit"])("bounds authorization before %s without resuming after a late response", async (operation) => {
    vi.useFakeTimers();
    const connected = wallet();
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const providers = await initializeBrowserProviders("preprod", checkpoint);
    let authorize!: (status: { status: string; networkId: string }) => void;
    connected.getConnectionStatus.mockImplementationOnce(() => new Promise((resolve) => { authorize = resolve; }));
    const serialize = vi.fn(() => Uint8Array.of(1, 2, 3));
    const transaction = { identifiers: () => ["12".repeat(32)], serialize };
    const invoke = () => operation === "balance" ? providers.walletProvider.balanceTx(transaction as never) : providers.midnightProvider.submitTx(transaction as never);
    const result = invoke().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(WALLET_AUTHORIZATION_TIMEOUT_MS);
    expect(await result).toMatchObject({ message: expect.stringContaining("Wallet authorization check timed out") });
    authorize({ status: "connected", networkId: "preprod" });
    await vi.advanceTimersByTimeAsync(0);
    expect(serialize).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(connected.balanceUnsealedTransaction).not.toHaveBeenCalled();
    expect(connected.submitTransaction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    // Only a new explicit invocation rechecks authorization.
    connected.getConnectionStatus.mockResolvedValue({ status: "disconnected" });
    await expect(invoke()).rejects.toThrow("authorization was not granted");
    expect(connected.getConnectionStatus).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["connect", "status", "configuration", "addresses"])("bounds stalled %s setup and ignores late responses", async (stage) => {
    vi.useFakeTimers();
    const connected = wallet();
    setNetworkId("undeployed");
    let finish!: (value: any) => void;
    const pending = new Promise<any>((resolve) => { finish = resolve; });
    if (stage === "connect") vi.mocked(window.midnight!.lace!.connect).mockReturnValue(pending);
    if (stage === "status") connected.getConnectionStatus.mockReturnValue(pending);
    if (stage === "configuration") connected.getConfiguration.mockReturnValue(pending);
    if (stage === "addresses") connected.getShieldedAddresses.mockReturnValue(pending);
    const result = initializeBrowserProviders("preprod").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(WALLET_SETUP_TIMEOUT_MS);
    expect(await result).toMatchObject({ message: expect.stringContaining("Wallet setup timed out") });
    expect(getNetworkId()).toBe("undeployed");
    const calls = [connected.getConnectionStatus.mock.calls.length, connected.getConfiguration.mock.calls.length, connected.getShieldedAddresses.mock.calls.length];
    finish(stage === "connect" ? connected : stage === "status" ? { status: "connected", networkId: "preprod" } : stage === "configuration" ? { networkId: "preprod", proverServerUri: "http://127.0.0.1:6300" } : { shieldedCoinPublicKey: "01".repeat(32), shieldedEncryptionPublicKey: "02".repeat(32) });
    await vi.advanceTimersByTimeAsync(0);
    expect([connected.getConnectionStatus.mock.calls.length, connected.getConfiguration.mock.calls.length, connected.getShieldedAddresses.mock.calls.length]).toEqual(calls);
    expect(getNetworkId()).toBe("undeployed");
    expect(connected.submitTransaction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    wallet();
    await initializeBrowserProviders("preprod");
    expect(getNetworkId()).toBe("preprod");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("changes the SDK network from undeployed to the connected network", async () => {
    wallet();
    setNetworkId("undeployed");
    await initializeBrowserProviders("preprod");
    expect(getNetworkId()).toBe("preprod");
  });

  it("skips malformed or unsupported injected connectors before choosing a callable v4 wallet", async () => {
    const connected = wallet(), valid = window.midnight!.lace!;
    const invalidConnect = vi.fn();
    window.midnight = {
      empty: null,
      primitive: "not an API",
      malformedVersion: { apiVersion: "4invalid.0.0", connect: invalidConnect },
      incompleteVersion: { apiVersion: "4", connect: invalidConnect },
      oldVersion: { apiVersion: "3.0.0", connect: invalidConnect },
      missingConnect: { apiVersion: "4.0.1" },
      wrongConnect: { apiVersion: "4.0.1", connect: "not callable" },
      lace: valid,
    } as never;
    await initializeBrowserProviders("preprod");
    expect(valid.connect).toHaveBeenCalledExactlyOnceWith("preprod");
    expect(invalidConnect).not.toHaveBeenCalled();
    expect(connected.getConfiguration).toHaveBeenCalledOnce();
    expect(connected.submitTransaction).not.toHaveBeenCalled();
  });

  it("fetches proving material from the current release directory", async () => {
    const previous = window.location.href;
    const fetcher = vi.spyOn(window, "fetch").mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
    try {
      window.history.replaceState(null, "", "/releases/test-v1/index.html#roles");
      wallet();
      const providers = await initializeBrowserProviders("preprod");
      await providers.zkConfigProvider.getProverKey("submitReport");
      await providers.zkConfigProvider.getVerifierKey("submitReport");
      await providers.zkConfigProvider.getZKIR("submitReport");
      expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["keys/submitReport.prover", "keys/submitReport.verifier", "zkir/submitReport.bzkir"].map((file) => `${window.location.origin}/releases/test-v1/${file}`));
    } finally { fetcher.mockRestore(); window.history.replaceState(null, "", previous); }
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

  it("does not broadcast when a delayed authorization check finishes after the submission deadline", async () => {
    vi.useFakeTimers();
    const connected = wallet();
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const providers = await initializeBrowserProviders("preprod", checkpoint);
    let authorize!: (status: { status: string; networkId: string }) => void;
    connected.getConnectionStatus.mockResolvedValueOnce({ status: "connected", networkId: "preprod" }).mockImplementationOnce(() => new Promise((resolve) => { authorize = resolve; }));
    const txId = "12".repeat(32);
    const tx = { identifiers: () => [txId], serialize: () => Uint8Array.of(1, 2, 3) };
    const result = providers.midnightProvider.submitTx(tx as never).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(WALLET_SUBMISSION_TIMEOUT_MS);
    expect(await result).toMatchObject({ name: "SubmissionOutcomeUnknown", transactionId: txId });
    expect(checkpoint).toHaveBeenCalledExactlyOnceWith(txId);
    authorize({ status: "connected", networkId: "preprod" });
    await vi.advanceTimersByTimeAsync(0);
    expect(connected.submitTransaction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
