// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { copyArtifactDirectory } from "./copy-artifact-directory.mjs";

test("artifact mirroring removes obsolete files and absent optional keys", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "vulnseal-copy-test-"));
  const source = path.join(root, "source"), target = path.join(root, "dist/keys");
  fs.mkdirSync(source); fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(source, "current.prover"), "new");
  fs.writeFileSync(path.join(target, "obsolete.prover"), "old");
  copyArtifactDirectory(root, source, target);
  assert.deepEqual(fs.readdirSync(target), ["current.prover"]);
  assert.equal(fs.readFileSync(path.join(target, "current.prover"), "utf8"), "new");
  const missing = path.join(root, "missing");
  assert.throws(() => copyArtifactDirectory(root, missing, target));
  assert.equal(fs.readFileSync(path.join(target, "current.prover"), "utf8"), "new");
  copyArtifactDirectory(root, missing, target, { optional: true });
  assert.deepEqual(fs.readdirSync(target), []);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ["keys"]);
});

test("redirected sources and escaping targets are rejected before touching existing output", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "vulnseal-copy-test-"));
  const source = path.join(root, "source"), target = path.join(root, "dist/keys");
  fs.mkdirSync(source); fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "retained"), "old");
  fs.symlinkSync(target, path.join(source, "redirect"), "junction");
  assert.throws(() => copyArtifactDirectory(root, source, target), /regular files|unredirected/);
  assert.equal(fs.readFileSync(path.join(target, "retained"), "utf8"), "old");
  assert.throws(() => copyArtifactDirectory(root, source, root));
  assert.throws(() => copyArtifactDirectory(root, source, path.join(source, "nested")), /disjoint/);
});

test("copy and installation errors retain the prior output", (context) => {
  for (const failure of ["copy", "install"]) {
    const root = fs.mkdtempSync(path.join(tmpdir(), "vulnseal-copy-test-"));
    const source = path.join(root, "source"), target = path.join(root, "dist/keys");
    fs.mkdirSync(source); fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(source, "new"), "new"); fs.writeFileSync(path.join(target, "retained"), "old");
    if (failure === "copy") context.mock.method(fs, "cpSync", () => { throw new Error("Synthetic copy failure"); });
    else {
      const rename = fs.renameSync; let calls = 0;
      context.mock.method(fs, "renameSync", (...args) => { if (++calls === 2) throw new Error("Synthetic install failure"); return rename(...args); });
    }
    assert.throws(() => copyArtifactDirectory(root, source, target), /Synthetic/);
    assert.equal(fs.readFileSync(path.join(target, "retained"), "utf8"), "old");
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["keys"]);
    context.mock.restoreAll();
  }
});
