// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function bytes(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 16 * 1024 * 1024) throw new Error(`Invalid compiler file: ${filename}`);
  return readFile(filename);
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Compare compiler outputs, not proving keys or deployed contract identity. */
export async function compareCompilerOutputs(retained, fresh) {
  const info = JSON.parse(await bytes(path.join(fresh, "compiler/contract-info.json")));
  const circuits = info.circuits?.filter((circuit) => circuit.proof === true).map((circuit) => circuit.name);
  if (!circuits?.length || circuits.length > 100 || circuits.some((name) => typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name)) || new Set(circuits).size !== circuits.length) throw new Error("Invalid fresh proving circuit inventory");
  const files = [];
  for (const relative of ["compiler/contract-info.json", "contract/index.js", "contract/index.d.ts", ...circuits.sort().map((name) => `zkir/${name}.zkir`)]) {
    const [actual, expected] = await Promise.all([bytes(path.join(retained, relative)), bytes(path.join(fresh, relative))]);
    if (!actual.equals(expected)) throw new Error(`Compiler output differs from current source: ${relative}`);
    files.push({ path: relative, bytes: actual.length, sha256: sha256(actual) });
  }
  // The output directory changes sourceRoot. All other mapping fields must match.
  const maps = await Promise.all([retained, fresh].map(async (directory) => {
    const map = JSON.parse(await bytes(path.join(directory, "contract/index.js.map")));
    delete map.sourceRoot;
    return map;
  }));
  assert.deepEqual(maps[0], maps[1], "Compiler source map differs beyond sourceRoot");
  return { compilerVersion: info["compiler-version"], circuits, files, sourceMapMatchesExceptSourceRoot: true, provingKeysRegenerated: false };
}

export async function checkContractSource() {
  const contract = path.join(root, "contract");
  const source = path.join(contract, "src/vulnseal.compact");
  const before = await bytes(source);
  const scratch = path.join(root, ".compact");
  await mkdir(scratch, { recursive: true });
  const scratchReal = await realpath(scratch);
  if (scratchReal !== path.join(await realpath(root), ".compact")) throw new Error("Compiler scratch directory must stay inside the workspace");
  const temporary = await mkdtemp(path.join(scratchReal, "source-check-"));
  try {
    const output = path.join(temporary, "managed");
    const args = ["compile", "--skip-zk", "src/vulnseal.compact", output];
    const options = { cwd: contract, encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] };
    if (process.platform === "win32") {
      const wslPath = (value) => {
        const match = /^([A-Za-z]):\\(.*)$/.exec(value);
        if (!match) throw new Error(`Cannot translate path for WSL: ${value}`);
        return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
      };
      const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
      args[3] = wslPath(output);
      execFileSync("wsl.exe", [...(process.env.VULNSEAL_COMPACT_WSL_DISTRO ? ["--distribution", process.env.VULNSEAL_COMPACT_WSL_DISTRO] : []), "--exec", "bash", "-lc", `cd ${quote(wslPath(contract))} && compact ${args.map(quote).join(" ")}`], options);
    } else execFileSync("compact", args, options);
    const result = await compareCompilerOutputs(path.join(contract, "src/managed/vulnseal"), output);
    if (!(await bytes(source)).equals(before)) throw new Error("Contract source changed during the check");
    return { capturedAt: new Date().toISOString(), sourceSha256: sha256(before), ...result };
  } finally {
    // Remove only this invocation's random directory, after resolving its boundary.
    const resolved = await realpath(temporary);
    if (path.dirname(resolved) !== scratchReal || !path.basename(resolved).startsWith("source-check-")) throw new Error("Refusing to remove an unexpected compiler directory");
    await rm(resolved, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("Usage: check-contract-source.mjs");
    process.stdout.write(JSON.stringify(await checkContractSource(), null, 2) + "\n");
  } catch (error) { process.stderr.write(`Contract source check failed: ${error.message}\n`); process.exitCode = 1; }
}
