// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { initializeBrowserProviders, WALLET_SETUP_TIMEOUT_MS, WALLET_AUTHORIZATION_TIMEOUT_MS, WALLET_BALANCING_TIMEOUT_MS } from "./browser-providers.js";
import { WALLET_SUBMISSION_TIMEOUT_MS } from "./submission.js";
import { Transaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";

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
  afterEach(() => { delete window.midnight; vi.restoreAllMocks(); vi.useRealTimers(); });

  it("returns a timely balanced transaction to the SDK and clears its deadline", async () => {
    vi.useFakeTimers();
    const connected = wallet();
    const providers = await initializeBrowserProviders("preprod");
    const finalized = { identifiers: () => ["12".repeat(32)] };
    const deserialize = vi.spyOn(Transaction, "deserialize").mockReturnValue(finalized as never);
    try {
      connected.balanceUnsealedTransaction.mockResolvedValueOnce({ tx: "040506" });
      expect(await providers.walletProvider.balanceTx({ serialize: () => Uint8Array.of(1, 2, 3) } as never)).toBe(finalized);
      expect(connected.balanceUnsealedTransaction).toHaveBeenCalledExactlyOnceWith("010203");
      expect(deserialize).toHaveBeenCalledOnce();
      expect(deserialize.mock.calls[0]!.slice(0, 3)).toEqual(["signature", "proof", "binding"]);
      expect(Array.from(deserialize.mock.calls[0]![3])).toEqual([4, 5, 6]);
      expect(vi.getTimerCount()).toBe(0);
    } finally { deserialize.mockRestore(); }
  });

  it.each(["resolve", "reject"])("stops the submission pipeline when balancing times out and later %ss", async (outcome) => {
    vi.useFakeTimers();
    const connected = wallet();
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const providers = await initializeBrowserProviders("preprod", checkpoint);
    let finish!: (value: { tx: string }) => void;
    let fail!: (error: Error) => void;
    connected.balanceUnsealedTransaction.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    const transaction = { serialize: () => Uint8Array.of(1, 2, 3) };
    // Match the SDK's balance-then-submit order, including the downstream call.
    const result = providers.walletProvider.balanceTx(transaction as never)
      .then((balanced) => providers.midnightProvider.submitTx(balanced))
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(WALLET_BALANCING_TIMEOUT_MS - 1);
    expect(connected.balanceUnsealedTransaction).toHaveBeenCalledExactlyOnceWith("010203");
    let settled = false;
    void result.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ message: expect.stringContaining("Wallet balancing timed out") });
    const readTx = vi.fn(() => "invalid-late-transaction");
    if (outcome === "resolve") finish({ get tx() { return readTx(); } });
    else fail(new Error("Late wallet rejection"));
    await vi.advanceTimersByTimeAsync(0);
    expect(readTx).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(connected.submitTransaction).not.toHaveBeenCalled();
    expect(connected.balanceUnsealedTransaction).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a prompt wallet balancing error and clears its deadline", async () => {
    vi.useFakeTimers();
    const connected = wallet();
    const providers = await initializeBrowserProviders("preprod");
    const error = new Error("User declined balancing");
    connected.balanceUnsealedTransaction.mockRejectedValueOnce(error);
    await expect(providers.walletProvider.balanceTx({ serialize: () => Uint8Array.of(1) } as never)).rejects.toBe(error);
    expect(connected.submitTransaction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

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

  for (const clock of ["wall", "monotonic"] as const) it.each(["authorization", "balancing"])(`rejects expired %s when ${clock} time advances without timer dispatch`, async stage => {
    vi.useFakeTimers();
    const connected = wallet();
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const providers = await initializeBrowserProviders("preprod", checkpoint);
    let wall = 1_000_000, monotonic = 100;
    vi.spyOn(Date, "now").mockImplementation(() => wall);
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    let finish!: () => void;
    connected.balanceUnsealedTransaction.mockResolvedValue({ tx: "010203" });
    if (stage === "authorization") connected.getConnectionStatus.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ status: "connected", networkId: "preprod" }); }));
    else connected.balanceUnsealedTransaction.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ tx: "010203" }); }));
    const transaction = { identifiers: () => ["12".repeat(32)], serialize: () => Uint8Array.of(1, 2, 3) };
    const deserialize = vi.spyOn(Transaction, "deserialize").mockReturnValue(transaction as never);
    const result = providers.walletProvider.balanceTx(transaction as never).then(tx => providers.midnightProvider.submitTx(tx)).catch((cause: unknown) => cause);
    for (let n = 0; n < 12; n++) await Promise.resolve();
    expect(finish).toBeTypeOf("function");
    const duration = stage === "authorization" ? WALLET_AUTHORIZATION_TIMEOUT_MS : WALLET_BALANCING_TIMEOUT_MS;
    if (clock === "wall") wall += duration; else { monotonic += duration; wall -= duration; }
    finish();
    expect(await result).toMatchObject({ message: expect.stringContaining(stage === "authorization" ? "Wallet authorization check timed out" : "Wallet balancing timed out") });
    expect(deserialize).not.toHaveBeenCalled(); expect(checkpoint).not.toHaveBeenCalled(); expect(connected.submitTransaction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });


  for (const clock of ["wall", "monotonic"] as const) it.each(["connect", "status", "configuration", "addresses"])(`rejects expired %s setup on ${clock} time before starting its next step`, async stage => {
    vi.useFakeTimers();
    const connected = wallet();
    const config = await connected.getConfiguration(); connected.getConfiguration.mockClear();
    setNetworkId("undeployed");
    let wall = 1_000_000, monotonic = 100;
    vi.spyOn(Date, "now").mockImplementation(() => wall);
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    let finish!: () => void;
    const pending = new Promise<any>(resolve => { finish = () => resolve(stage === "connect" ? connected : stage === "status" ? { status: "connected", networkId: "preprod" } : stage === "configuration" ? config : { shieldedCoinPublicKey: "01".repeat(32), shieldedEncryptionPublicKey: "02".repeat(32) }); });
    if (stage === "connect") vi.mocked(window.midnight!.lace!.connect).mockReturnValueOnce(pending);
    else if (stage === "status") connected.getConnectionStatus.mockReturnValueOnce(pending);
    else if (stage === "configuration") connected.getConfiguration.mockReturnValueOnce(pending);
    else connected.getShieldedAddresses.mockReturnValueOnce(pending);
    const result = initializeBrowserProviders("preprod").catch((cause: unknown) => cause);
    for (let n = 0; n < 32; n++) await Promise.resolve();
    const calls = [connected.getConnectionStatus.mock.calls.length, connected.getConfiguration.mock.calls.length, connected.getShieldedAddresses.mock.calls.length];
    if (clock === "wall") wall += WALLET_SETUP_TIMEOUT_MS; else { monotonic += WALLET_SETUP_TIMEOUT_MS; wall -= WALLET_SETUP_TIMEOUT_MS; }
    finish();
    expect(await result).toMatchObject({ message: expect.stringContaining("Wallet setup timed out") });
    expect([connected.getConnectionStatus.mock.calls.length, connected.getConfiguration.mock.calls.length, connected.getShieldedAddresses.mock.calls.length]).toEqual(calls);
    expect(getNetworkId()).toBe("undeployed"); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["wall", "monotonic"])("rejects final pre-broadcast authorization after %s expiry without dispatching a timer", async clock => {
    vi.useFakeTimers();
    const connected = wallet(), checkpoint = vi.fn().mockResolvedValue(undefined);
    const providers = await initializeBrowserProviders("preprod", checkpoint);
    let wall = 1_000_000, monotonic = 100;
    vi.spyOn(Date, "now").mockImplementation(() => wall);
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    let finish!: () => void;
    connected.getConnectionStatus.mockResolvedValueOnce({ status: "connected", networkId: "preprod" }).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ status: "connected", networkId: "preprod" }); }));
    const id = "12".repeat(32), transaction = { identifiers: () => [id], serialize: () => Uint8Array.of(1, 2, 3) };
    const result = providers.midnightProvider.submitTx(transaction as never).catch((cause: unknown) => cause);
    for (let n = 0; n < 32; n++) await Promise.resolve();
    expect(finish).toBeTypeOf("function"); expect(checkpoint).toHaveBeenCalledExactlyOnceWith(id);
    if (clock === "wall") wall += WALLET_SUBMISSION_TIMEOUT_MS; else { monotonic += WALLET_SUBMISSION_TIMEOUT_MS; wall -= WALLET_SUBMISSION_TIMEOUT_MS; }
    finish();
    expect(await result).toMatchObject({ transactionId: id, cause: { message: expect.stringContaining("deadline exceeded") } });
    expect(connected.submitTransaction).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });


  it("bounds wallet discovery when wall time does not advance", async () => {
    vi.useFakeTimers(); delete window.midnight;
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const result = initializeBrowserProviders("preprod").catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toMatchObject({ message: expect.stringContaining("Compatible Midnight Lace wallet not found") });
    expect(vi.getTimerCount()).toBe(0);
  });

});
