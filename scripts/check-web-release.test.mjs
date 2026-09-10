// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { checkWebRelease } from "./check-web-release.mjs";

test("release gate binds required prover assets to generated inventory and rejects incomplete or foreign packaging", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "vulnseal-release-check-"));
  const managed = path.join(workspace, "contract/src/managed/vulnseal"), dist = path.join(workspace, "web/dist");
  for (const directory of ["compiler", "keys", "zkir"]) await mkdir(path.join(managed, directory), { recursive: true });
  for (const directory of ["assets", "keys", "zkir"]) await mkdir(path.join(dist, directory), { recursive: true });
  await writeFile(path.join(workspace, "contract/src/vulnseal.compact"), "synthetic compiler fixture");
  await writeFile(path.join(managed, "compiler/contract-info.json"), JSON.stringify({ "compiler-version": "fixture", circuits: [{ name: "submitReport", proof: true }, { name: "pureHelper", proof: false }] }));
  await writeFile(path.join(dist, "index.html"), '<script type="module" src="./assets/main.js"></script>');
  await writeFile(path.join(dist, "assets/main.js"), "export {};");
  await assert.rejects(checkWebRelease({ workspace }), /Missing submission widget entrypoint/);
  await writeFile(path.join(dist, "assets/submission-widget.js"), "export {};");
  await writeFile(path.join(dist, "assets/main.js"), 'import("./missing-worker.js");');
  await assert.rejects(checkWebRelease({ workspace }), /Missing static asset reference/);
  await writeFile(path.join(dist, "assets/main.js"), "export {};");
  for (const file of ["keys/submitReport.prover", "keys/submitReport.verifier", "zkir/submitReport.bzkir"]) {
    await writeFile(path.join(managed, file), `synthetic ${file}`);
    await writeFile(path.join(dist, file), `synthetic ${file}`);
  }
  const valid = await checkWebRelease({ workspace });
  assert.deepEqual(valid.circuits, ["submitReport"]); assert.equal(valid.files.length, 6);
  await writeFile(path.join(dist, "release-manifest.json"), JSON.stringify(valid));
  assert.deepEqual(await checkWebRelease({ workspace }), valid);
  await writeFile(path.join(dist, "assets/main.js"), "export const changed = true;");
  await assert.rejects(checkWebRelease({ workspace }), /manifest is stale/);
  await writeFile(path.join(dist, "assets/main.js"), "export {};");
  await unlink(path.join(dist, "keys/submitReport.prover"));
  await assert.rejects(checkWebRelease({ workspace }), /Missing network release asset/);
  await writeFile(path.join(dist, "keys/submitReport.prover"), "wrong artifact");
  await assert.rejects(checkWebRelease({ workspace }), /differs from compiler output/);
  await writeFile(path.join(dist, "keys/submitReport.prover"), "");
  await assert.rejects(checkWebRelease({ workspace }), /Invalid release file/);
  await writeFile(path.join(dist, "keys/submitReport.prover"), "synthetic keys/submitReport.prover");
  await writeFile(path.join(dist, "private-backup.json"), "must never be deployed");
  await assert.rejects(checkWebRelease({ workspace }), /Unexpected release file/);
  await unlink(path.join(dist, "private-backup.json"));
  await unlink(path.join(dist, "assets/main.js"));
  await assert.rejects(checkWebRelease({ workspace }), /Missing HTML entrypoint/);
  await writeFile(path.join(dist, "assets/main.js"), 'const imports={"./runtime_wasm_bg.js":{}}; export {};');
  await checkWebRelease({ workspace, allowManifestUpdate: true });
});
