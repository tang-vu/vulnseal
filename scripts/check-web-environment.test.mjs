// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadConfigFromFile, resolveConfig } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const configFile = path.join(root, "web/vite.config.ts");

test("Vite checks mode-specific environment files and shell overrides before build and serve", async () => {
  const envDir = await mkdtemp(path.join(tmpdir(), "vulnseal-public-env-"));
  await writeFile(path.join(envDir, ".env.production"), 'VITE_CIPHERSTORE_URL="https://store.example.test/base#"\nPRIVATE_CONFIG_FIXTURE=synthetic-not-for-browser\n');
  // Preserve the caller's configuration; these tests only alter public values.
  const keys = ["VITE_CIPHERSTORE_URL", "VITE_CIPHERSTORE_REPLICAS"];
  const previous = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  try {
    const defaults = await loadConfigFromFile({ command: "build", mode: "production" }, configFile);
    assert.equal(path.resolve(defaults.config.envDir), path.resolve(root));
    for (const command of ["build", "serve"]) {
      await assert.rejects(resolveConfig({ configFile, envDir, root: path.join(root, "web"), logLevel: "silent" }, command, "production"), /query strings or fragments/);
    }
    process.env.VITE_CIPHERSTORE_URL = "https://store.example.test/base/";
    const resolved = await resolveConfig({ configFile, envDir, root: path.join(root, "web"), logLevel: "silent" }, "build", "production");
    assert.equal(resolved.env.VITE_CIPHERSTORE_URL, process.env.VITE_CIPHERSTORE_URL);
    assert.equal(resolved.env.PRIVATE_CONFIG_FIXTURE, undefined);
    process.env.VITE_CIPHERSTORE_REPLICAS = "https://store.example.test/base///";
    await assert.rejects(resolveConfig({ configFile, envDir, root: path.join(root, "web"), logLevel: "silent" }, "build", "production"), /must be distinct/);
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await unlink(path.join(envDir, ".env.production")); await rmdir(envDir);
  }
});

test("a real Vite build rejects invalid public configuration without replacing existing output", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "vulnseal-rejected-build-"));
  const sentinel = path.join(outDir, "index.html");
  await writeFile(sentinel, "previous verified release");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", outDir, "--emptyOutDir"], {
      cwd: path.join(root, "web"), encoding: "utf8", timeout: 30_000,
      env: { ...process.env, VITE_CIPHERSTORE_URL: "https://store.example.test?", VITE_CIPHERSTORE_REPLICAS: "" },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /query strings or fragments/);
    assert.equal(await readFile(sentinel, "utf8"), "previous verified release");
  } finally { await unlink(sentinel); await rmdir(outDir); }
});
