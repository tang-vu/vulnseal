// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stageCompilation } from "./staged-compiler.mjs";

const prepare = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-staged-test-"));
  const contract = path.join(root, "contract"), target = path.join(contract, "src/managed/vulnseal");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(contract, "src/vulnseal.compact"), "synthetic source");
  await writeFile(path.join(target, "retained"), "old keys and bindings");
  return { root, contract, target };
};
const generate = async (output, keys = true) => {
  for (const dir of ["contract", "compiler", "zkir", "keys"]) await mkdir(path.join(output, dir), { recursive: true });
  const files = { "compiler/contract-info.json": JSON.stringify({ circuits: [{ name: "submitReport", proof: true }] }), "contract/index.js": "synthetic binding", "contract/index.d.ts": "synthetic declaration", "contract/index.js.map": JSON.stringify({ sourceRoot: "temporary", sources: ["src/vulnseal.compact"] }), "zkir/submitReport.zkir": "synthetic zkir" };
  if (keys) Object.assign(files, { "keys/submitReport.prover": "synthetic prover", "keys/submitReport.verifier": "synthetic verifier", "zkir/submitReport.bzkir": "synthetic binary" });
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(output, name), value);
};

test("compiler failure, missing keys and changed source preserve the installed directory", async () => {
  for (const failure of ["compiler", "keys", "source"]) {
    const { root, contract, target } = await prepare();
    await assert.rejects(stageCompilation(contract, async (output) => {
      await generate(output, failure !== "keys");
      if (failure === "compiler") throw new Error("key generator failed");
      if (failure === "source") await writeFile(path.join(contract, "src/vulnseal.compact"), "changed source");
    }, true));
    assert.equal(await readFile(path.join(target, "retained"), "utf8"), "old keys and bindings");
    await assert.rejects(access(path.join(root, ".compact/compile.lock")));
  }
});

test("successful staging archives the old directory and fixes installed source-map paths", async () => {
  const { contract, target } = await prepare();
  const result = await stageCompilation(contract, generate, true);
  assert.equal(result.circuits, 1);
  assert.equal(await readFile(path.join(result.previous, "retained"), "utf8"), "old keys and bindings");
  assert.equal(await readFile(path.join(target, "keys/submitReport.prover"), "utf8"), "synthetic prover");
  assert.equal(JSON.parse(await readFile(path.join(target, "contract/index.js.map"), "utf8")).sourceRoot, "../../../../");
});

test("an existing compiler lock prevents generation and remains owned by its caller", async () => {
  const { root, contract } = await prepare();
  await mkdir(path.join(root, ".compact"));
  const lock = path.join(root, ".compact/compile.lock"); await writeFile(lock, "existing owner");
  await assert.rejects(stageCompilation(contract, () => { throw new Error("must not run"); }, true), /interrupted compiler lock/);
  assert.equal(await readFile(lock, "utf8"), "existing owner");
});
