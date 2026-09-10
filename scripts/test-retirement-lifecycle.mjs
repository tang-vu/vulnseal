// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { CipherstoreClient, ReplicatedCipherstoreClient, RetiredCiphertextError } from "../api/dist/cipherstore-client.js";
import { createCipherstoreServer } from "../cipherstore/dist/server.js";
import { FilesystemCiphertextStorage } from "../cipherstore/dist/filesystem-storage.js";
import { SqliteCiphertextStorage } from "../cipherstore/dist/sqlite-storage.js";
import { readRetirementPolicy } from "../cipherstore/dist/retirement-policy.js";
import { acquireDirectoryLease } from "../cipherstore/dist/directory-lease.js";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== "--write-evidence")) throw new Error("Usage: test-retirement-lifecycle.mjs [--write-evidence]");
const execute = promisify(execFile);
const command = async (name, arguments_, policy) => {
  const result = await execute(process.execPath, [fileURLToPath(new URL(`../cipherstore/dist/${name}.js`, import.meta.url)), ...arguments_], {
    windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024,
    env: { ...process.env, ...(policy ? { CIPHERSTORE_RETIREMENT_FILE: policy } : {}) },
  });
  return JSON.parse(result.stdout);
};

async function drill() {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-retirement-lifecycle-"));
  const policyFile = path.join(root, "retired.json"), emptyPolicy = path.join(root, "empty.json");
  const stores = ["filesystem", "sqlite"].map((backend) => ({ backend, directory: path.join(root, backend), active: undefined }));
  const adapter = (store) => store.backend === "sqlite" ? new SqliteCiphertextStorage(store.directory, 10000, 10) : new FilesystemCiphertextStorage(store.directory, 10000, 10);
  const stop = async (store) => {
    if (!store.active) return;
    const { server, storage, release } = store.active;
    await new Promise((resolve, reject) => server.close((error) => error && error.code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve()));
    await server.drain();
    await storage.close?.(); await release(); store.active = undefined;
  };
  const start = async (store, policy) => {
    const retirementPolicy = await readRetirementPolicy(policy);
    await mkdir(store.directory, { recursive: true });
    const release = await acquireDirectoryLease(store.directory), storage = adapter(store);
    const server = createCipherstoreServer({ dataDirectory: store.directory, storage, retirementPolicy });
    store.active = { release, storage, server };
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert(address && typeof address !== "string");
    store.url = `http://127.0.0.1:${address.port}`;
  };
  const client = () => new ReplicatedCipherstoreClient(stores.map((store) => store.url));
  const key = randomBytes(32), aad = "vulnseal:ciphertext:v1:retirement-lifecycle";
  const seal = (text) => {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(text), cipher.final(), cipher.getAuthTag()]);
    const body = JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad, iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url") });
    const digest = createHash("sha256").update(body).digest("hex");
    return { body, digest, address: `sha256:${digest}` };
  };
  const retired = seal("Synthetic report selected for removal"), retainedText = "Synthetic report retained across replica maintenance", retained = seal(retainedText);
  const retire = async (store) => {
    const plan = await command("retire", ["plan", store.directory, policyFile]);
    assert.deepEqual(plan.present, [retired.digest]);
    const audit = path.join(root, `${store.backend}-audit.jsonl`);
    const applied = await command("retire", ["apply", store.directory, policyFile, plan.planDigest, audit]);
    assert.equal(applied.removed, 1);
    const events = (await readFile(audit, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.at(-1).event, "completed");
  };
  try {
    await writeFile(emptyPolicy, JSON.stringify({ format: "vulnseal-retired-ciphertext", version: 1, digests: [] }));
    for (const store of stores) await start(store, emptyPolicy);
    await client().put(retired.address, retired.body); await client().put(retained.address, retained.body);
    for (const store of stores) {
      await stop(store);
      await command("backup", ["create", store.directory, path.join(root, `${store.backend}-old-backup`)]);
    }
    await writeFile(policyFile, JSON.stringify({ format: "vulnseal-retired-ciphertext", version: 1, digests: [retired.digest] }));
    await retire(stores[0]);
    // An unconfigured replica remains a source: never infer global removal from one store.
    await start(stores[0], policyFile); await start(stores[1], emptyPolicy);
    await assert.rejects(client().put(retired.address, retired.body), (error) => error instanceof RetiredCiphertextError && /1 of 2 stores acknowledged/.test(error.message));
    assert.equal(await client().get(retired.address), retired.body);
    for (const store of stores) await stop(store);
    await retire(stores[1]);
    for (const store of stores) await start(store, policyFile);
    await assert.rejects(client().put(retired.address, retired.body), (error) => error instanceof RetiredCiphertextError && /0 of 2 stores acknowledged/.test(error.message));
    await assert.rejects(client().get(retired.address), /No configured ciphertext store/);
    await client().put(retained.address, retained.body);
    for (const store of stores) {
      const body = await new CipherstoreClient(store.url).get(retained.address);
      assert.equal(body, retained.body);
      const envelope = JSON.parse(body), bytes = Buffer.from(envelope.ciphertext, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
      decipher.setAAD(Buffer.from(envelope.aad)); decipher.setAuthTag(bytes.subarray(-16));
      assert.equal(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString(), retainedText);
      const ready = await fetch(`${store.url}/readyz`, { signal: AbortSignal.timeout(5000) }); assert.equal(ready.status, 200); await ready.text();
      await stop(store);
      const storage = adapter(store);
      try { await assert.rejects(storage.read(retired.digest), { code: "ENOENT" }); }
      finally { await storage.close?.(); }
      const restored = path.join(root, `${store.backend}-restored`);
      await assert.rejects(command("backup", [store.backend === "sqlite" ? "restore-sqlite" : "restore", path.join(root, `${store.backend}-old-backup`), restored], policyFile), (error) => error.code === 1 && /STORAGE_RETIRED/.test(error.stderr));
      assert(!(await readdir(root)).includes(`${store.backend}-restored`));
      const backup = path.join(root, `${store.backend}-new-backup`);
      const created = await command("backup", ["create", store.directory, backup]); assert.equal(created.blobs, 1);
      await command("backup", ["verify", backup]);
      const manifest = JSON.parse(await readFile(path.join(backup, "vulnseal-cipherstore-manifest.json"), "utf8"));
      assert.deepEqual(manifest.blobs.map((entry) => entry.digest), [retained.digest]);
    }
    return { capturedAt: new Date().toISOString(), node: process.version, backends: stores.map((store) => store.backend), replicatedEncryptedUpload: true, partialRetirementReported: true, unconfiguredReplicaRemainsReadable: true, bothRetiredUploadsRefused: true, bothUnderlyingCopiesAbsent: true, retainedCopiesDecrypted: true, oldBackupsRefusedBeforeDestination: true, newBackupsContainOnlyRetainedBlob: true, auditsCompleted: true };
  } finally {
    for (const store of stores) await stop(store);
    const actual = await realpath(root), parent = await realpath(tmpdir());
    assert.equal(path.dirname(actual), parent);
    assert(path.basename(actual).startsWith("vulnseal-retirement-lifecycle-"));
    await rm(actual, { recursive: true }); // Only this newly created and verified temporary directory.
  }
}
const artifacts = ["scripts/test-retirement-lifecycle.mjs", "api/dist/cipherstore-client.js", "cipherstore/dist/server.js", "cipherstore/dist/filesystem-storage.js", "cipherstore/dist/sqlite-storage.js", "cipherstore/dist/sqlite-worker.js", "cipherstore/dist/retirement-policy.js", "cipherstore/dist/retire.js", "cipherstore/dist/backup.js"];
const fileHashes = Object.fromEntries(await Promise.all(artifacts.map(async (filename) => [filename, createHash("sha256").update(await readFile(new URL(`../${filename}`, import.meta.url))).digest("hex")])));
const evidence = { ...await drill(), fixtureCleanupCompleted: true, fileHashes, limits: ["Two local services and temporary stores, not independently operated regions.", "Compiled HTTP server/adapters and administrative CLIs; no container, native wallet or physical-erasure proof.", "The old backups were deliberately retained until fixture cleanup; policy refusal does not erase archives.", "Recorded module hashes identify selected inputs, not complete build provenance or dependencies."] };
if (args.includes("--write-evidence")) await writeFile(new URL("../docs/evidence/retirement-lifecycle.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(JSON.stringify(evidence) + "\n");
