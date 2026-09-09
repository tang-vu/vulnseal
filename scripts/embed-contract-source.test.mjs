// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { contractSourceMap } from "./embed-contract-source.mjs";

test("distributed map embeds exact contract source without inventing standard-library text", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-source-map-"));
  const original = path.join(root, "original"), distributed = path.join(root, "distributed");
  await mkdir(original); await mkdir(distributed);
  const sourceFile = path.join(original, "report.compact");
  const source = "// Unicode source: \u00e9\nexport circuit example() {}\n";
  await writeFile(sourceFile, source);
  const before = { version: 3, sources: ["report.compact", "compiler/standard-library.compact"], sourceRoot: "", mappings: "AAAA", names: [], file: "index.js" };
  const map = path.join(distributed, "index.js.map"), originalMap = path.join(original, "index.js.map");
  await writeFile(map, JSON.stringify(before)); await writeFile(originalMap, JSON.stringify(before));
  const embedded = contractSourceMap(JSON.parse(await readFile(map, "utf8")), originalMap, sourceFile, await readFile(sourceFile, "utf8"));
  await writeFile(map, JSON.stringify(embedded));
  assert.deepEqual(JSON.parse(await readFile(map, "utf8")), { ...before, sourcesContent: [source, null] });
  assert.deepEqual(JSON.parse(await readFile(originalMap, "utf8")), before);
  assert.throws(() => contractSourceMap(before, originalMap, path.join(root, "unrelated.compact"), "unrelated"), /absent/);
});
