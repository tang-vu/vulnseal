// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";
import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args.some((arg) => !["--backend=filesystem", "--backend=sqlite", "--write-evidence"].includes(arg)) || args.filter((arg) => arg.startsWith("--backend=")).length > 1) throw new Error("Usage: test-cipherstore-container.mjs [--backend=filesystem|sqlite] [--write-evidence]");
const backend = args.includes("--backend=sqlite") ? "sqlite" : "filesystem";

const image = "vulnseal-cipherstore:local";
const id = randomUUID(), name = `vulnseal-container-test-${id}`, volume = `${name}-data`;
const label = `vulnseal.container-test=${id}`;
const distro = process.env.VULNSEAL_DOCKER_WSL_DISTRO;
const executable = distro ? "wsl.exe" : process.platform === "win32" ? "docker.exe" : "docker";
const execute = promisify(execFile);
// Keep the event loop available to observe HTTP socket closure during Docker work.
const docker = async (...args) => (await execute(executable, [...(distro ? ["--distribution", distro, "--exec", "docker"] : []), ...args], { encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout.trim();
const failed = async (...args) => { try { await docker(...args); return false; } catch (error) { if (error.code === 1) return true; throw error; } };
const imageId = await docker("image", "inspect", image, "--format", "{{.Id}}");
assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
let stage = "startup";
const request = (url, options = {}) => {
  stage = `${options.method ?? "GET"} ${new URL(url).pathname}`;
  return fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
};
const baseUrl = async () => `http://${await docker("port", name, "8787/tcp")}`;
async function live() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await request(`${await baseUrl()}/healthz`)).ok) return; } catch {}
    await delay(250);
  }
  throw new Error("Container did not become live within 30 seconds");
}
async function removeOwned(kind, target) {
  let found;
  try { found = await docker(kind, "inspect", "--format", kind === "volume" ? '{{index .Labels "vulnseal.container-test"}}' : '{{index .Config.Labels "vulnseal.container-test"}}', target); }
  catch { return; }
  assert.equal(found, id, "Refusing to remove a resource not owned by this drill");
  await docker(kind, "rm", ...(kind === "container" ? ["--force"] : []), target);
}
try {
  await docker("volume", "create", "--label", label, volume);
  await docker("run", "--detach", "--name", name, "--label", label, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--memory", "512m", "--pids-limit", "64", "--mount", `type=volume,source=${volume},target=/data`, "--publish", "127.0.0.1::8787", "--env", `CIPHERSTORE_BACKEND=${backend}`, "--env", "CIPHERSTORE_METRICS_ENABLED=1", "--env", "CIPHERSTORE_MAX_STORED_BLOBS=1", "--env", "CIPHERSTORE_REQUEST_TIMEOUT_MS=1000", imageId);
  await live();
  const metrics = await request(`${await baseUrl()}/metrics`);
  assert.equal(metrics.status, 200);
  assert.equal(metrics.headers.get("content-type"), "text/plain; version=0.0.4; charset=utf-8");
  assert.match(await metrics.text(), /vulnseal_http_responses_total/);
  const inspection = JSON.parse(await docker("inspect", name))[0];
  assert.equal(inspection.Image, imageId);
  assert.equal(inspection.Config.User, "node");
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.match(await docker("exec", name, "id", "-u"), /^[1-9][0-9]*$/);
  assert.equal(await docker("exec", name, "node", "healthcheck.mjs"), "");
  stage = "incomplete restoration CLI guard";
  assert.equal(await docker("exec", name, "node", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
    import { spawnSync } from 'node:child_process';
    const root = mkdtempSync('/data/incomplete-restore-');
    const marker = '.vulnseal-restore-incomplete';
    writeFileSync(root + '/' + marker, 'Controlled incomplete restoration');
    const invoke = (args) => spawnSync(process.execPath, args, {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, CIPHERSTORE_DATA_DIR: root }
    });
    const startup = invoke(['dist/index.js']);
    assert.equal(startup.error, undefined);
    assert.equal(startup.status, 1);
    assert.match(startup.stderr, /restore is incomplete/);
    assert.doesNotMatch(startup.stdout, /listening/);
    const backup = invoke(['dist/backup.js', 'create', root, root + '-backup']);
    assert.equal(backup.error, undefined);
    assert.equal(backup.status, 1);
    assert.match(backup.stderr, /restore is incomplete/);
    assert.equal(existsSync(root + '-backup'), false);
    assert.deepEqual(readdirSync(root), [marker]);
  `), "");
  // Continuous progress must not extend the complete-request receipt deadline.
  const endpoint = new URL(await baseUrl());
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
  assert.equal(await docker("exec", name, "node", "-e", "const fs=require('node:fs');if(fs.existsSync('/app/node_modules')||fs.existsSync('/app/.env'))process.exit(1)"), "");
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const plaintext = new TextEncoder().encode("Synthetic container persistence drill");
  const aad = `vulnseal:ciphertext:v1:${"12".repeat(32)}`;
  const seal = async () => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, plaintext);
    return JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad, iv: Buffer.from(iv).toString("base64url"), ciphertext: Buffer.from(ciphertext).toString("base64url") });
  };
  const body = await seal(), digest = createHash("sha256").update(body).digest("hex");
  const put = async (content) => request(`${await baseUrl()}/v1/blobs/sha256:${createHash("sha256").update(content).digest("hex")}`, { method: "PUT", headers: { "content-type": "application/vnd.vulnseal.ciphertext+json", origin: "http://127.0.0.1:5173" }, body: content });
  assert.equal((await put(body)).status, 201);
  if (backend === "sqlite") {
    assert.equal(await docker("exec", name, "node", "-e", "const fs=require('node:fs');const fd=fs.openSync('/data/ciphertext.sqlite','r');const b=Buffer.alloc(16);fs.readSync(fd,b,0,16,0);fs.closeSync(fd);if(b.toString()!=='SQLite format 3\\0')process.exit(1)"), "");
  }
  assert.equal((await put(body)).status, 200);
  assert.equal((await put(await seal())).status, 507);
  assert.equal((await request(`${await baseUrl()}/readyz`)).status, 503);
  assert.equal((await request(`${await baseUrl()}/healthz`)).status, 200);
  assert.equal(await failed("exec", name, "node", "healthcheck.mjs"), true);
  assert.equal(await failed("exec", name, "node", "dist/index.js"), true, "Second writer must refuse the leased directory");
  await docker("stop", "--time", "20", name);
  assert.equal(JSON.parse(await docker("inspect", name))[0].State.ExitCode, 0, "Graceful stop must release the lease");
  await docker("start", name);
  await live();
  const response = await request(`${await baseUrl()}/v1/blobs/sha256:${digest}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), body);
  const envelope = JSON.parse(body);
  const decrypted = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(envelope.iv, "base64url"), additionalData: new TextEncoder().encode(envelope.aad) }, key, Buffer.from(envelope.ciphertext, "base64url"));
  assert.deepEqual(new Uint8Array(decrypted), plaintext);
  await docker("stop", "--time", "20", name);
  assert.equal(JSON.parse(await docker("inspect", name))[0].State.ExitCode, 0, "Final stop must close storage and release its lease");
  const evidence = { capturedAt: new Date().toISOString(), backend, imageId, nonRoot: true, readOnlyRoot: true, metricsEnabled: true, readyBeforeUpload: true, incompleteRestoreStartupRefused: true, incompleteRestoreBackupRefused: true, incompleteRestoreMarkerRetained: true, incompleteRestoreLeaseReleased: true, trickledUploadTerminated: true, quotaRejectsNewBlob: true, fullStoreRemainsReadable: true, secondWriterRefused: true, gracefulRestart: true, persistedCiphertextDecrypted: true };
  if (args.includes("--write-evidence")) await writeFile(`docs/evidence/cipherstore-${backend}-container-drill.json`, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(JSON.stringify(evidence) + "\n");
} catch (error) {
  process.stderr.write(`Container drill failed (${backend}, ${stage}): ${String(error)}\n`);
  try { process.stderr.write(await docker("logs", "--tail", "30", name) + "\n"); } catch {}
  throw error;
} finally {
  await removeOwned("container", name);
  await removeOwned("volume", volume);
}
