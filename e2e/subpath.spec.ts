// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "@playwright/test";
import { createServer, request as upstreamRequest, type Server } from "node:http";
import { readdir } from "node:fs/promises";
import fixture from "./fixtures/preprod-public-state.json" with { type: "json" };

let server: Server, base: string;
const prefix = "/releases/test-v1/";
test.beforeAll(async () => {
  // A real HTTP mount that strips only the release prefix, like an ingress route.
  server = createServer((request, response) => {
    if (!request.url?.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    const upstream = upstreamRequest({ hostname: "127.0.0.1", port: 4173, method: request.method, path: "/" + request.url.slice(prefix.length), headers: { ...request.headers, host: "127.0.0.1:4173" } }, (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
    });
    upstream.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
    response.on("close", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No prefix listener");
  base = `http://127.0.0.1:${address.port}${prefix}`;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });

test("a release subdirectory keeps navigation, SDK/WASM and workers inside its mount", async ({ page, context }) => {
  const action = fixture.data.contractAction;
  const localRequests: string[] = [], pageErrors: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith(new URL(base).origin)) localRequests.push(new URL(request.url()).pathname); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("https://indexer.preprod.midnight.network/**", (route) => route.fulfill({ json: fixture }));
  await context.route("https://rpc.preprod.midnight.network/**", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: `0x${(action.transaction.block.height + 100).toString(16)}` } : `0x${action.transaction.block.hash}` } });
  });
  await page.goto(`${base}#verify?network=preprod&contract=${action.address}`);
  await page.getByRole("button", { name: "Load public state" }).click();
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toBeVisible();
  expect(await page.getByRole("link", { name: "Open role workspace" }).evaluate((element) => (element as HTMLAnchorElement).href)).toBe(`${base}#roles`);
  const workerFile = (await readdir("web/dist/assets")).find((name) => /^report-replay\.worker-.*\.js$/.test(name))!;
  const result = await page.evaluate((workerFile) => new Promise<{ error?: string }>((resolve, reject) => {
    const worker = new Worker(new URL(`assets/${workerFile}`, window.location.href), { type: "module" });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error("Nested worker did not answer")); }, 30_000);
    worker.onmessage = (event) => { clearTimeout(timeout); worker.terminate(); resolve(event.data); };
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(new Error("Nested worker failed to load")); };
    worker.postMessage({ contractAddress: "invalid", programId: "invalid", reportId: "invalid", circuit: "constructor" });
  }), workerFile);
  expect(result.error).toContain("saved report and report-operation intent");
  const opened = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open role workspace" }).click();
  const rolePage = await opened;
  await expect(rolePage.getByRole("heading", { name: "Inspect recovery journal without a wallet" })).toBeVisible();
  expect(rolePage.url()).toBe(`${base}#roles`);
  expect(await rolePage.getByRole("link", { name: "Open demo / public verifier" }).evaluate((element) => (element as HTMLAnchorElement).href)).toBe(base);
  expect(localRequests.length).toBeGreaterThan(5);
  expect(localRequests.every((pathname) => pathname.startsWith(prefix))).toBe(true);
  expect(pageErrors).toEqual([]);
});
