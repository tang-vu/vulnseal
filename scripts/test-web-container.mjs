// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, devices, expect } from "@playwright/test";
import { checkWebRelease } from "./check-web-release.mjs";
import { checkWebHost } from "./check-web-host.mjs";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { ledger } from "@vulnseal/contract";
import { bytesToHex, hexToBytes } from "@vulnseal/shared";
import { programInvitationLink } from "@vulnseal/api/program-invitation";

if (process.argv.slice(2).some((arg) => arg !== "--write-evidence")) throw new Error("Usage: test-web-container.mjs [--write-evidence]");
const manifest = await checkWebRelease();
const id = randomUUID(), name = `vulnseal-web-test-${id}`, image = "vulnseal-web:local";
const distro = process.env.VULNSEAL_DOCKER_WSL_DISTRO;
const docker = (...args) => execFileSync(distro ? "wsl.exe" : process.platform === "win32" ? "docker.exe" : "docker", [...(distro ? ["--distribution", distro, "--exec", "docker"] : []), ...args], { encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const request = (origin, pathname, options = {}) => fetch(origin + pathname, { ...options, redirect: "error", signal: AbortSignal.timeout(5000) });
let created = false, result;
try {
  docker("run", "--detach", "--name", name, "--label", `vulnseal.web-test=${id}`, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--memory", "256m", "--pids-limit", "64", "--publish", "127.0.0.1::8080", image);
  created = true;
  let origin = `http://${docker("port", name, "8080/tcp")}`;
  async function ready() {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try { const response = await request(origin, "/"); await response.arrayBuffer(); if (response.ok) return; } catch {}
      await delay(250);
    }
    throw new Error("Web container did not become ready");
  }
  await ready();
  const inspection = JSON.parse(docker("inspect", name))[0];
  assert.equal(inspection.Config.User, "65532:65532");
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.equal(docker("exec", name, "id", "-u"), "65532");
  docker("exec", name, "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/index.html");
  const hosted = await checkWebHost({ origin, manifest });
  const widgetModules = manifest.files.filter(file => /^assets\/(?:submission-widget|program-invitation-[A-Za-z0-9_-]+)\.js$/.test(file.path));
  assert.equal(widgetModules.length, 2, "Expected the widget and its public invitation module");
  for (const module of widgetModules) {
    const response = await request(origin, `/${module.path}`, { method: "HEAD", headers: { origin: "https://program.example.test" } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }
  assert.equal((await request(origin, "/", { method: "HEAD", headers: { origin: "https://program.example.test" } })).headers.get("access-control-allow-origin"), null);
  for (const pathname of ["/", `/keys/${manifest.circuits[0]}.prover`, "/release-manifest.json"]) {
    const response = await request(origin, pathname, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  }
  for (const pathname of ["/keys/missing.prover", "/assets/missing.js", "/.env", "/keys/"]) {
    const response = await request(origin, pathname);
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  }
  const fixture = JSON.parse(await readFile(new URL("../e2e/fixtures/preprod-public-state.json", import.meta.url), "utf8"));
  const action = fixture.data.contractAction;
  const deploymentFixture = JSON.parse(await readFile(new URL("../e2e/fixtures/preprod-deployment-state.json", import.meta.url), "utf8"));
  const deployment = deploymentFixture.data.transactions[0], deployAction = deployment.contractActions[0];
  const state = ledger(ContractState.deserialize(hexToBytes(deployAction.state)).data);
  const saved = Object.fromEntries(["programId", "scopeDigest", "responsePolicyDigest", "rewardPolicyDigest", "disclosurePolicyDigest", "responseDays", "disclosureDelayDays"].map((field) => [field, typeof state[field] === "bigint" ? state[field].toString() : bytesToHex(state[field])]));
  const workerAssets = manifest.files.filter((file) => /^assets\/deployment-policy\.worker-[^/]+\.js$/.test(file.path));
  assert.equal(workerAssets.length, 1, "Expected exactly one packaged deployment policy worker");
  const invitation = programInvitationLink(`${origin}/`, { format: "vulnseal-program-invitation", version: 1, network: "preprod", contractAddress: action.address, programId: saved.programId });
  const publisher = createServer((_request, response) => { response.setHeader("content-type", "text/html"); response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Widget container drill</title></head><body><script type="module" src="${origin}/assets/submission-widget.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script><vulnseal-submission invitation="${invitation.replaceAll("&", "&amp;")}"></vulnseal-submission></body></html>`); });
  await new Promise((resolve, reject) => { publisher.once("error", reject); publisher.listen(0, "127.0.0.1", resolve); });
  const publisherOrigin = `http://127.0.0.1:${publisher.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
    for (const device of [null, devices["Pixel 7"]]) {
      const context = await browser.newContext(device ?? {});
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", (route) => {
          const url = new URL(route.request().url());
          if (url.origin === origin) return route.continue();
          if (url.hostname === "indexer.preprod.midnight.network") return route.fulfill({ json: route.request().postDataJSON().query.includes("PublicVulnSeal") ? fixture : deploymentFixture });
          if (url.hostname === "rpc.preprod.midnight.network") {
            const body = route.request().postDataJSON();
            const blockHash = body.method === "chain_getBlockHash" && body.params[0] === deployment.block.height ? deployment.block.hash : action.transaction.block.hash;
            return route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: body.method === "chain_getHeader" ? { number: `0x${(action.transaction.block.height + 100).toString(16)}` } : `0x${blockHash}` } });
          }
          return route.abort();
        });
        await page.goto(`${origin}/#verify?network=preprod&contract=${action.address}`, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "Verify without private keys" })).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Load public state" }).click();
        await expect(page.getByRole("heading", { name: "Finalized public state" })).toBeVisible({ timeout: 30_000 });
        for (const mismatch of [false, true]) {
          const result = await page.evaluate(({ path, input }) => new Promise((resolve, reject) => {
            const worker = new Worker(path, { type: "module" });
            const finish = (error, value) => { clearTimeout(timer); worker.terminate(); error ? reject(new Error(error)) : resolve(value); };
            const timer = setTimeout(() => finish("Packaged deployment worker timed out"), 35_000);
            worker.onerror = () => finish("Packaged deployment worker failed");
            worker.onmessage = event => finish(event.data.error, event.data.result);
            worker.postMessage(input);
          }), { path: `/${workerAssets[0].path}`, input: { transactionId: deployment.identifiers[0], saved: mismatch ? { ...saved, rewardPolicyDigest: "ff".repeat(32) } : saved, endpoints: { indexerUrl: "https://indexer.preprod.midnight.network/api/v4/graphql", rpcUrl: "https://rpc.preprod.midnight.network" } } });
          assert.equal(result.address, deployAction.address);
          assert.equal(result.blockHeight, deployment.block.height);
          assert.deepEqual(result.mismatches, mismatch ? ["rewardPolicyDigest"] : []);
        }
        assert.deepEqual(errors, []);
        const embedded = await context.newPage(), requests = [];
        embedded.on("request", request => requests.push(request.url()));
        embedded.on("pageerror", error => errors.push(error.message));
        await embedded.goto(publisherOrigin, { timeout: 30_000 });
        const widget = embedded.locator("vulnseal-submission");
        await expect(widget.getByRole("heading", { name: "Report a vulnerability" })).toBeVisible();
        const loaded = requests.filter(url => new URL(url).origin === origin);
        assert.equal(loaded.length, 2);
        assert.ok(loaded.every(url => widgetModules.some(module => new URL(url).pathname === `/${module.path}`)));
        const popupPromise = embedded.waitForEvent("popup"); await widget.getByRole("link", { name: "Start a private report" }).click();
        const popup = await popupPromise;
        try {
          await expect(popup.getByRole("heading", { name: "Review program invitation" })).toBeVisible({ timeout: 30_000 });
          await expect(popup.getByRole("region", { name: "Review public program invitation" })).toContainText(saved.programId);
          assert.equal(await popup.evaluate(() => window.opener === null), true);
        } finally { await popup.close(); }
        assert.deepEqual(errors, []);
        // Confirm the injected worker reached its handler before testing the outer deadline.
        await page.clock.install();
        let enteredLoops = 0;
        page.on("console", message => { if (message.text() === "vulnseal-test: public worker entered loop") enteredLoops++; });
        await page.route("**/public-lookup.worker-*.js", route => route.fulfill({ contentType: "text/javascript", body: "self.onmessage = () => { console.log('vulnseal-test: public worker entered loop'); while (true) {} };" }));
        const lookup = page.getByRole("button", { name: "Load public state" });
        await lookup.click(); await expect.poll(() => enteredLoops).toBe(1);
        await page.clock.fastForward(30_000);
        await expect(page.getByRole("alert")).toContainText("Public lookup timed out. No verification result was accepted.");
        await expect(lookup).toBeEnabled();
        await expect(page.getByRole("heading", { name: "Finalized public state" })).toHaveCount(0);
        await lookup.click(); await expect.poll(() => enteredLoops).toBe(2);
        await page.getByRole("button", { name: "Cancel public lookup" }).click();
        await page.clock.fastForward(30_000);
        await expect(lookup).toBeEnabled(); await expect(page.getByRole("alert")).toHaveCount(0);
      } finally { await context.close(); }
    }
  } finally {
    try { if (browser) await browser.close(); }
    finally { await new Promise((resolve, reject) => { publisher.close(error => error ? reject(error) : resolve()); publisher.closeAllConnections(); }); }
  }
  docker("stop", "--time", "10", name);
  assert.equal(JSON.parse(docker("inspect", name))[0].State.ExitCode, 0);
  docker("start", name);
  origin = `http://${docker("port", name, "8080/tcp")}`;
  await ready();
  const restarted = await request(origin, "/");
  assert.equal(createHash("sha256").update(new Uint8Array(await restarted.arrayBuffer())).digest("hex"), manifest.files.find((file) => file.path === "index.html").sha256);
  result = { capturedAt: new Date().toISOString(), imageId: inspection.Image, ...hosted, nonRoot: true, readOnlyRoot: true, headersChecked: true, missingFilesReturn404: true, desktopAndMobilePublicLookup: "passed against captured fixture; no wallet or live network", desktopAndMobilePublicWorkerDeadline: "injected busy worker reached its handler; packaged UI timed out, restarted and canceled without accepting a result", desktopAndMobileDeploymentWorker: "packaged worker decoded captured raw deployment and reported matching and mismatched policy; mocked indexer/RPC", desktopAndMobileSubmissionWidget: "real second HTTP origin loaded only two public modules from the image and opened isolated invitation review", widgetCorsChecked: true, gracefulRestart: true };
} catch (error) {
  if (created) process.stderr.write(docker("logs", "--tail", "30", name) + "\n");
  throw error;
} finally {
  if (created) {
    const found = JSON.parse(docker("inspect", name))[0];
    assert.equal(found.Config.Labels["vulnseal.web-test"], id, "Refusing to remove an unowned container");
    docker("rm", "--force", "--volumes", name);
  }
}
// Publish successful drill evidence only after owned-container cleanup also succeeded.
if (process.argv.includes("--write-evidence")) await writeFile(new URL("../docs/evidence/web-container-drill.json", import.meta.url), JSON.stringify({ ...result, cleanupCompleted: true }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ ...result, cleanupCompleted: true }) + "\n");
