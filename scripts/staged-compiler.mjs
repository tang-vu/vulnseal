// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, open, lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareCompilerOutputs } from "./check-contract-source.mjs";

export async function stageCompilation(contract, generate, requireKeys) {
  const root = await realpath(path.dirname(contract));
  const scratch = path.join(root, ".compact"), parent = path.join(contract, "src/managed");
  await mkdir(scratch, { recursive: true }); await mkdir(parent, { recursive: true });
  if (await realpath(scratch) !== scratch || await realpath(parent) !== path.join(root, "contract/src/managed")) throw new Error("Compiler directories must remain inside the workspace without redirected paths");
  const lockPath = path.join(scratch, "compile.lock");
  const lock = await open(lockPath, "wx").catch((error) => {
    if (error.code === "EEXIST") throw new Error("Another compilation or an interrupted compiler lock exists at .compact/compile.lock. Verify the owner has stopped before removing a stale lock.");
    throw error;
  });
  let temporary;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const source = path.join(contract, "src/vulnseal.compact"), before = await readFile(source);
    temporary = await mkdtemp(path.join(scratch, "compile-"));
    const output = path.join(temporary, "managed"), target = path.join(parent, "vulnseal");
    await generate(output);
    const inventory = await compareCompilerOutputs(output, output);
    if (requireKeys) {
      for (const circuit of inventory.circuits) for (const relative of [`keys/${circuit}.prover`, `keys/${circuit}.verifier`, `zkir/${circuit}.bzkir`]) {
        const stat = await lstat(path.join(output, relative));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) throw new Error(`Incomplete generated proving material: ${relative}`);
      }
    }
    if (!(await readFile(source)).equals(before)) throw new Error("Contract source changed during compilation; retained artifacts were not replaced");
    // Compilation used a temporary output path. Keep debugger mapping relative to
    // the installed contract directory, as in a direct compiler invocation.
    const mapPath = path.join(output, "contract/index.js.map");
    const map = JSON.parse(await readFile(mapPath, "utf8"));
    map.sourceRoot = path.relative(path.join(target, "contract"), contract).replaceAll("\\", "/") + "/";
    await writeFile(mapPath, JSON.stringify(map, null, 2) + "\n");
    const previous = path.join(temporary, "previous");
    const existing = await lstat(target).catch((error) => { if (error.code === "ENOENT") return undefined; throw error; });
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error("Refusing to replace a redirected or non-directory managed target");
    if (existing) await rename(target, previous);
    try { await rename(output, target); }
    catch (error) {
      if (existing) await rename(previous, target);
      throw error;
    }
    return { circuits: inventory.circuits.length, previous: existing ? previous : null, temporary };
  } catch (error) {
    throw new Error(`Compilation did not complete. Retained artifacts were not intentionally discarded. Staging: ${temporary ?? "not created"}. ${error.message}`, { cause: error });
  } finally { await lock.close(); await unlink(lockPath); }
}
