// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, rmdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("./scan-container.sh", import.meta.url));
const docker = `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$SCAN_TEST_ROOT/docker.log"
case "$1 $2" in
  'image inspect') echo sha256:test; exit 0 ;;
  'save --output') printf '%s' "$3" > "$SCAN_TEST_ROOT/archive"; printf exported > "$3"; [ "$SCAN_TEST_MODE" != save_fail ]; exit $? ;;
  'container ls')
    case "$SCAN_TEST_MODE" in clean|finding|save_fail) exit 0;; list_fail) exit 124;; *) echo owned-id; exit 0;; esac ;;
  'inspect --format')
    name=$(cat "$SCAN_TEST_ROOT/name")
    case "$SCAN_TEST_MODE" in foreign) echo 'another-owner exited';; removing) echo "$name removing";; *) echo "$name exited";; esac
    exit 0 ;;
  'rm --force') [ "$SCAN_TEST_MODE" != rm_fail ]; exit $? ;;
esac
if [ "$1" = run ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = --name ]; then shift; printf '%s' "$1" > "$SCAN_TEST_ROOT/name"; break; fi
    shift
  done
  case "$SCAN_TEST_MODE" in finding) exit 1;; removing|active) exit 124;; *) exit 0;; esac
fi
exit 99
`;
const timeout = `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$SCAN_TEST_ROOT/timeout.log"
[ "$1" = -k ] && [ "$2" = 5s ]
shift 3
exec "$@"
`;

for (const [mode, expected, retained, removes] of [
  ["clean", 0, false, false], ["finding", 1, false, false],
  ["removing", 124, true, false], ["foreign", 1, true, false],
  ["rm_fail", 1, true, true], ["active", 124, false, true],
  ["list_fail", 1, true, false], ["save_fail", 1, false, false],
]) test(`scanner preserves status and owns cleanup: ${mode}`, { skip: process.platform === "win32" ? "Run the POSIX shell harness through WSL" : false }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "vulnseal-scan-harness-"));
  try {
    writeFileSync(path.join(root, "docker"), docker, { mode: 0o700 });
    writeFileSync(path.join(root, "timeout"), timeout, { mode: 0o700 });
    const run = spawnSync("sh", [script, "synthetic-image"], { encoding: "utf8", timeout: 5000, env: { ...process.env, PATH: `${root}:${process.env.PATH}`, SCAN_TEST_ROOT: root, SCAN_TEST_MODE: mode } });
    assert.equal(run.status, expected, run.stderr);
    const archive = readFileSync(path.join(root, "archive"), "utf8");
    assert.equal(existsSync(archive), retained);
    assert.equal(run.stderr.includes("Scanner cleanup incomplete"), retained);
    const calls = readFileSync(path.join(root, "docker.log"), "utf8");
    assert.equal(calls.includes("rm --force --volumes"), removes);
    if (mode !== "save_fail") {
      assert.match(calls, /--label vulnseal.image-scan=vulnseal-scan-/);
      assert.match(calls, /--severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL --exit-code 1 --exit-on-eol 2/);
    }
    const deadlines = readFileSync(path.join(root, "timeout.log"), "utf8");
    assert.match(deadlines, /-k 5s 20s docker image inspect/);
    assert.match(deadlines, /-k 5s 120s docker save/);
    assert.match(deadlines, /-k 5s 15s docker container ls/);
    if (mode !== "save_fail") assert.match(deadlines, /-k 5s 720s docker run/);
  } finally {
    const record = path.join(root, "archive");
    if (existsSync(record)) {
      const archive = readFileSync(record, "utf8"), directory = path.dirname(archive);
      assert.match(directory, /^\/tmp\/vulnseal-image-scan\.[a-zA-Z0-9]{8}$/);
      assert.equal(path.basename(archive), "image.tar");
      if (existsSync(directory)) {
        assert.equal(realpathSync(directory), directory);
        rmSync(archive, { force: true }); rmdirSync(directory);
      }
    }
    assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith("vulnseal-scan-harness-"));
    rmSync(root, { recursive: true });
  }
});
