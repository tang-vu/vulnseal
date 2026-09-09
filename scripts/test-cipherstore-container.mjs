// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";

const image = "vulnseal-cipherstore:local";
const id = randomUUID(), name = `vulnseal-container-test-${id}`, volume = `${name}-data`;
const label = `vulnseal.container-test=${id}`;
const distro = process.env.VULNSEAL_DOCKER_WSL_DISTRO;
const executable = distro ? "wsl.exe" : process.platform === "win32" ? "docker.exe" : "docker";
const docker = (...args) => execFileSync(executable, [...(distro ? ["--distribution", distro, "--exec", "docker"] : []), ...args], { encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const failed = (...args) => { try { docker(...args); return false; } catch (error) { if (error.status === 1) return true; throw error; } };
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
const baseUrl = () => `http://${docker("port", name, "8787/tcp")}`;
async function live() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await request(`${baseUrl()}/healthz`)).ok) return; } catch {}
    await delay(250);
  }
  throw new Error("Container did not become live within 30 seconds");
}
function removeOwned(kind, target) {
  let found;
  try { found = docker(kind, "inspect", "--format", kind === "volume" ? '{{index .Labels "vulnseal.container-test"}}' : '{{index .Config.Labels "vulnseal.container-test"}}', target); }
  catch { return; }
  assert.equal(found, id, "Refusing to remove a resource not owned by this drill");
  docker(kind, "rm", ...(kind === "container" ? ["--force"] : []), target);
}
try {
  docker("volume", "create", "--label", label, volume);
  docker("run", "--detach", "--name", name, "--label", label, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--memory", "512m", "--pids-limit", "64", "--mount", `type=volume,source=${volume},target=/data`, "--publish", "127.0.0.1::8787", "--env", "CIPHERSTORE_METRICS_ENABLED=1", "--env", "CIPHERSTORE_MAX_STORED_BLOBS=1", "--env", "CIPHERSTORE_REQUEST_TIMEOUT_MS=1000", image);
  await live();
  const metrics = await request(`${baseUrl()}/metrics`);
  assert.equal(metrics.status, 200);
  assert.equal(metrics.headers.get("content-type"), "text/plain; version=0.0.4; charset=utf-8");
  assert.match(await metrics.text(), /vulnseal_http_responses_total/);
  const inspection = JSON.parse(docker("inspect", name))[0];
  assert.equal(inspection.Config.User, "node");
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.match(docker("exec", name, "id", "-u"), /^[1-9][0-9]*$/);
  assert.equal(docker("exec", name, "node", "healthcheck.mjs"), "");
  // Continuous progress must not extend the complete-request receipt deadline.
  const endpoint = new URL(baseUrl());
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: endpoint.hostname, port: Number(endpoint.port) });
    let sent = 0, drip;
    const deadline = setTimeout(() => { socket.destroy(); reject(new Error("Trickled container upload outlived its deadline")); }, 4000);
    socket.resume(); socket.on("error", () => {});
    socket.on("connect", () => {
      socket.write(`PUT /v1/blobs/sha256:${"ab".repeat(32)} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/vnd.vulnseal.ciphertext+json\r\nContent-Length: 10000\r\n\r\n`);
      drip = setInterval(() => { if (!socket.destroyed) { socket.write("x"); sent++; } }, 50);
    });
    socket.on("close", () => { clearTimeout(deadline); clearInterval(drip); sent > 1 ? resolve() : reject(new Error("Container upload never began trickling")); });
  });
  assert.equal(docker("exec", name, "node", "-e", "const fs=require('node:fs');if(fs.existsSync('/app/node_modules')||fs.existsSync('/app/.env'))process.exit(1)"), "");
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const plaintext = new TextEncoder().encode("Synthetic container persistence drill");
  const aad = `vulnseal:ciphertext:v1:${"12".repeat(32)}`;
  const seal = async () => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, plaintext);
    return JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad, iv: Buffer.from(iv).toString("base64url"), ciphertext: Buffer.from(ciphertext).toString("base64url") });
  };
  const body = await seal(), digest = createHash("sha256").update(body).digest("hex");
  const put = (content) => request(`${baseUrl()}/v1/blobs/sha256:${createHash("sha256").update(content).digest("hex")}`, { method: "PUT", headers: { "content-type": "application/vnd.vulnseal.ciphertext+json", origin: "http://127.0.0.1:5173" }, body: content });
  assert.equal((await put(body)).status, 201);
  assert.equal((await put(body)).status, 200);
  assert.equal((await put(await seal())).status, 507);
  assert.equal((await request(`${baseUrl()}/readyz`)).status, 503);
  assert.equal((await request(`${baseUrl()}/healthz`)).status, 200);
  assert.equal(failed("exec", name, "node", "healthcheck.mjs"), true);
  assert.equal(failed("exec", name, "node", "dist/index.js"), true, "Second writer must refuse the leased directory");
  docker("stop", "--time", "20", name);
  assert.equal(JSON.parse(docker("inspect", name))[0].State.ExitCode, 0, "Graceful stop must release the lease");
  docker("start", name);
  await live();
  const response = await request(`${baseUrl()}/v1/blobs/sha256:${digest}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), body);
  const envelope = JSON.parse(body);
  const decrypted = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(envelope.iv, "base64url"), additionalData: new TextEncoder().encode(envelope.aad) }, key, Buffer.from(envelope.ciphertext, "base64url"));
  assert.deepEqual(new Uint8Array(decrypted), plaintext);
  docker("stop", "--time", "20", name);
  process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), imageId: docker("image", "inspect", image, "--format", "{{.Id}}"), nonRoot: true, readOnlyRoot: true, metricsEnabled: true, readyBeforeUpload: true, trickledUploadTerminated: true, quotaRejectsNewBlob: true, fullStoreRemainsReadable: true, secondWriterRefused: true, gracefulRestart: true, persistedCiphertextDecrypted: true }) + "\n");
} finally {
  removeOwned("container", name);
  removeOwned("volume", volume);
}
