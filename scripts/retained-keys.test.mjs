// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasRetainedKeys } from "./retained-keys.mjs";

test("syntax-only compilation protects partial as well as complete retained key directories", async () => {
  const managed = await mkdtemp(path.join(tmpdir(), "vulnseal-retained-keys-"));
  const keys = path.join(managed, "keys"), key = path.join(keys, "partial.prover");
  try {
    assert.equal(await hasRetainedKeys(managed), false);
    await mkdir(keys);
    assert.equal(await hasRetainedKeys(managed), false);
    await writeFile(key, "");
    assert.equal(await hasRetainedKeys(managed), true);
    await unlink(key); await rmdir(keys);
    await writeFile(keys, "unexpected file");
    await assert.rejects(hasRetainedKeys(managed));
    await unlink(keys);
  } finally {
    await unlink(key).catch((error) => { if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error; });
    await rmdir(keys).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await rmdir(managed);
  }
});
