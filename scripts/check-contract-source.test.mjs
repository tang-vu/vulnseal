// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareCompilerOutputs } from "./check-contract-source.mjs";

test("fresh compiler comparison rejects stale bindings, circuit input and metadata", async () => {
  const temporaryRoot = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, "vulnseal-compiler-test-"));
  const retained = path.join(directory, "retained"), fresh = path.join(directory, "fresh");
  const fixture = {
    "compiler/contract-info.json": JSON.stringify({ "compiler-version": "fixture", circuits: [{ name: "submitReport", proof: true }] }),
    "contract/index.js": "export const circuit = 1;",
    "contract/index.d.ts": "export declare const circuit: number;",
    "zkir/submitReport.zkir": "fixture circuit input",
    "contract/index.js.map": JSON.stringify({ version: 3, sourceRoot: "../", sources: ["source.compact"], mappings: "AAAA" }),
  };
  try {
    for (const base of [retained, fresh]) for (const [relative, contents] of Object.entries(fixture)) {
      await mkdir(path.dirname(path.join(base, relative)), { recursive: true });
      await writeFile(path.join(base, relative), contents);
    }
    const map = JSON.parse(fixture["contract/index.js.map"]);
    await writeFile(path.join(fresh, "contract/index.js.map"), JSON.stringify({ ...map, sourceRoot: "elsewhere/" }));
    const result = await compareCompilerOutputs(retained, fresh);
    assert.equal(result.files.length, 4);
    assert.equal(result.provingKeysRegenerated, false);
    for (const relative of ["contract/index.js", "contract/index.d.ts", "zkir/submitReport.zkir", "compiler/contract-info.json"]) {
      await writeFile(path.join(retained, relative), "stale output");
      await assert.rejects(compareCompilerOutputs(retained, fresh), /differs from current source/);
      await writeFile(path.join(retained, relative), fixture[relative]);
    }
    await writeFile(path.join(fresh, "contract/index.js.map"), JSON.stringify({ ...map, mappings: "BBBB" }));
    await assert.rejects(compareCompilerOutputs(retained, fresh), /source map differs/);
    await writeFile(path.join(fresh, "compiler/contract-info.json"), JSON.stringify({ circuits: [{ name: "../escape", proof: true }] }));
    await assert.rejects(compareCompilerOutputs(retained, fresh), /Invalid fresh proving circuit/);
    await writeFile(path.join(fresh, "compiler/contract-info.json"), fixture["compiler/contract-info.json"]);
    await rm(path.join(retained, "zkir/submitReport.zkir"));
    await assert.rejects(compareCompilerOutputs(retained, fresh), { code: "ENOENT" });
  } finally {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.ok(path.basename(resolved).startsWith("vulnseal-compiler-test-"));
    await rm(resolved, { recursive: true });
  }
});
