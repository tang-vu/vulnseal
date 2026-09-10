// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import fixture from "../../e2e/fixtures/preprod-deployment-state.json";
import referenceKeys from "../../e2e/fixtures/release-verifier-keys.json";
import { compareDeploymentVerifiers } from "./deployment-verifiers.js";
const state = fixture.data.transactions[0]!.contractActions[0]!.state;
const base = "https://release.example.test/releases/v1/keys/";
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());
const reference = (url: URL) => new Response(Uint8Array.from(hexToBytes(referenceKeys.keys[url.pathname.split("/").at(-1)!.replace(".verifier", "") as keyof typeof referenceKeys.keys])));
it("compares all captured deployment keys against captured retained verifier files", async () => {
  const fetcher = vi.fn(async (url: URL) => reference(url)); vi.stubGlobal("fetch", fetcher);
  const result = await compareDeploymentVerifiers(state, base, signal());
  expect(result.matched).toHaveLength(8);
  expect(result).toMatchObject({ mismatched: [], missing: [], unexpected: [] });
  expect(fetcher).toHaveBeenCalledTimes(8);
  expect(fetcher.mock.calls.every(([url]) => url.href.startsWith(base) && url.href.endsWith(".verifier"))).toBe(true);
});
it("reports changed key bytes separately from entrypoint inventory", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.href.endsWith("submitReport.verifier") ? new Response(new Uint8Array([1, 2])) : reference(url)));
  const result = await compareDeploymentVerifiers(state, base, signal());
  expect(result.mismatched).toEqual(["submitReport"]);
  expect(result.matched).toHaveLength(7);
});
it("never turns an unexpected operation name into a request path", async () => {
  const decoded = ContractState.deserialize(hexToBytes(state));
  decoded.setOperation("../../untrusted", decoded.operation("submitReport")!);
  const fetcher = vi.fn(async (url: URL) => reference(url)); vi.stubGlobal("fetch", fetcher);
  const result = await compareDeploymentVerifiers(bytesToHex(decoded.serialize()), base, signal());
  expect(result.unexpected).toEqual(["../../untrusted"]);
  expect(fetcher).toHaveBeenCalledTimes(8);
});
it("reports missing operations without downloading fabricated key names", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const result = await compareDeploymentVerifiers(bytesToHex(new ContractState().serialize()), base, signal());
  expect(result.missing).toHaveLength(8);
  expect(result.matched).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([404, "html", "oversized", "aborted"])("rejects unavailable or bounded key evidence: %s", async (mode) => {
  const controller = new AbortController(), cancel = vi.fn();
  const fetcher = vi.fn(async () => mode === 404 ? new Response(null, { status: 404 }) : mode === "html" ? new Response("wrong page", { headers: { "content-type": "text/html" } }) : new Response(new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array(65537)); }, cancel })));
  vi.stubGlobal("fetch", fetcher);
  if (mode === "aborted") controller.abort();
  await expect(compareDeploymentVerifiers(state, base, controller.signal)).rejects.toThrow();
  if (mode === "oversized") expect(cancel).toHaveBeenCalledOnce();
  if (mode === "aborted") expect(fetcher).not.toHaveBeenCalled();
});
