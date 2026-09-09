// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ledger: vi.fn((data: unknown) => data) }));
vi.mock("@vulnseal/contract", () => ({ compiledVulnSealContract: {}, ledger: mocks.ledger }));
import { PUBLIC_STATE_TIMEOUT_MS, VulnSealApi } from "./api.js";

const makeApi = (queryContractState: ReturnType<typeof vi.fn>) => Reflect.construct(VulnSealApi, [
  { deployTxData: { public: { contractAddress: "ab".repeat(32) } } },
  { privateStateProvider: { setContractAddress: vi.fn() }, publicDataProvider: { queryContractState } },
]) as VulnSealApi;

afterEach(() => { vi.useRealTimers(); mocks.ledger.mockClear(); });

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
