// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { developmentCipherstoreEnvironment } from "./cipherstore-dev.mjs";

test("development storage loads root files with Vite precedence and resolves data paths from that root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-dev-config-"));
  const fixtures = {
    ".env": "CIPHERSTORE_PORT=8787\nCIPHERSTORE_DATA_DIR=./cipherstore/data\nPRIVATE_FIXTURE=not-public\nVITE_CIPHERSTORE_URL=https://store.example.test\n",
    ".env.local": "CIPHERSTORE_PORT=8788\n",
    ".env.development": "CIPHERSTORE_PORT=8789\n",
    ".env.development.local": "CIPHERSTORE_PORT=8790\n",
    ".env.production": "CIPHERSTORE_PORT=9999\n",
  };
  const previous = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("CIPHERSTORE_")));
  for (const key of Object.keys(previous)) delete process.env[key];
  try {
    for (const [name, contents] of Object.entries(fixtures)) await writeFile(path.join(root, name), contents);
    const loaded = developmentCipherstoreEnvironment(root);
    assert.deepEqual(loaded, { CIPHERSTORE_PORT: "8790", CIPHERSTORE_DATA_DIR: path.join(root, "cipherstore/data") });
    process.env.CIPHERSTORE_PORT = "8791";
    process.env.CIPHERSTORE_DATA_DIR = path.join(root, "other-store");
    assert.deepEqual(developmentCipherstoreEnvironment(root), { CIPHERSTORE_PORT: "8791", CIPHERSTORE_DATA_DIR: path.join(root, "other-store") });
    for (const name of Object.keys(fixtures)) await unlink(path.join(root, name));
    delete process.env.CIPHERSTORE_DATA_DIR;
    assert.equal(developmentCipherstoreEnvironment(root).CIPHERSTORE_DATA_DIR, path.join(root, "cipherstore/data"));
  } finally {
    for (const key of Object.keys(process.env).filter((key) => key.startsWith("CIPHERSTORE_"))) delete process.env[key];
    Object.assign(process.env, previous);
    for (const name of Object.keys(fixtures)) await unlink(path.join(root, name)).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await rmdir(root);
  }
});
