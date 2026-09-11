// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ledger: vi.fn((data: unknown) => data) }));
vi.mock("@vulnseal/contract", () => ({ compiledVulnSealContract: {}, ledger: mocks.ledger }));
import { PUBLIC_STATE_TIMEOUT_MS, VulnSealApi } from "./api.js";

const makeApi = (queryContractState: ReturnType<typeof vi.fn>) => Reflect.construct(VulnSealApi, [
  { deployTxData: { public: { contractAddress: "ab".repeat(32) } } },
  { privateStateProvider: { setContractAddress: vi.fn() }, publicDataProvider: { queryContractState } },
]) as VulnSealApi;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.ledger.mockReset().mockImplementation((data: unknown) => data); });

it("times out once and never decodes a late response, while allowing an explicit fresh read", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  const query = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const api = makeApi(query);
  const failed = expect(api.readPublicState()).rejects.toThrow("Public state read timed out");
  await vi.advanceTimersByTimeAsync(PUBLIC_STATE_TIMEOUT_MS);
  await failed;
  expect(query).toHaveBeenCalledExactlyOnceWith(api.contractAddress);
  finish({ data: "stale" });
  await Promise.resolve();
  expect(mocks.ledger).not.toHaveBeenCalled();
  query.mockResolvedValue({ data: "fresh" });
  await expect(api.readPublicState()).resolves.toEqual({ contractAddress: api.contractAddress, ledger: "fresh" });
  expect(mocks.ledger).toHaveBeenCalledExactlyOnceWith("fresh");
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["missing", "provider error"])("preserves %s failures and clears the deadline", async (kind) => {
  vi.useFakeTimers();
  const query = kind === "missing" ? vi.fn().mockResolvedValue(null) : vi.fn().mockRejectedValue(new Error("Indexer disconnected"));
  await expect(makeApi(query).readPublicState()).rejects.toThrow(kind === "missing" ? "unavailable from the indexer" : "Indexer disconnected");
  expect(mocks.ledger).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["wall", "monotonic", "monotonic with backwards wall"])("rejects an expired %s read before decoding even without timer dispatch", async clock => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let wall = 1_000, monotonic = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  for (const outcome of ["resolved", "missing", "rejected"]) {
    let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
    const query = vi.fn(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
    const api = makeApi(query);
    const pending = expect(api.readPublicState()).rejects.toThrow("Public state read timed out");
    if (clock === "wall") wall += PUBLIC_STATE_TIMEOUT_MS;
    else { monotonic += PUBLIC_STATE_TIMEOUT_MS; if (clock.includes("backwards")) wall -= 60_000; }
    if (outcome === "rejected") reject(new Error("Late provider error"));
    else resolve(outcome === "missing" ? null : { data: "expired" });
    await pending;
    expect(mocks.ledger).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
  const query = vi.fn().mockResolvedValue({ data: "fresh" });
  await expect(makeApi(query).readPublicState()).resolves.toMatchObject({ ledger: "fresh" });
});

it.each(["return", "throw"])("rejects a decoder that crosses the deadline before %s", async outcome => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let now = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  mocks.ledger.mockImplementationOnce(() => {
    now += PUBLIC_STATE_TIMEOUT_MS;
    if (outcome === "throw") throw new Error("Late decode error");
    return "expired";
  });
  const query = vi.fn().mockResolvedValue({ data: "slow" });
  await expect(makeApi(query).readPublicState()).rejects.toThrow("Public state read timed out");
  expect(mocks.ledger).toHaveBeenCalledExactlyOnceWith("slow");
  expect(vi.getTimerCount()).toBe(0);
});
