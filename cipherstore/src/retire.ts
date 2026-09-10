// SPDX-License-Identifier: Apache-2.0
import { lstat, open, readdir, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { acquireDirectoryLease, directoryLeaseName } from "./directory-lease.js";
import { assertRestoreComplete } from "./restore-state.js";
import { readRetirementPolicy, type RetirementPolicy } from "./retirement-policy.js";
import { SqliteCiphertextStorage } from "./sqlite-storage.js";

/** Offline logical removal, never secure erasure. Without an audit path this only previews. */
export async function retireCiphertext(source: string, policy: RetirementPolicy, auditPath?: string) {
  const directory = await realpath(source), release = await acquireDirectoryLease(directory);
  let sqlite: SqliteCiphertextStorage | undefined;
  let audit: Awaited<ReturnType<typeof open>> | undefined;
  const append = async (value: unknown) => { await audit!.writeFile(JSON.stringify(value) + "\n"); await audit!.sync(); };
  try {
    await assertRestoreComplete(directory);
    const names = await readdir(directory), backend = names.includes("ciphertext.sqlite") ? "sqlite" : "filesystem";
    if (names.some((name) => backend === "sqlite"
      ? !["ciphertext.sqlite", "ciphertext.sqlite-journal", directoryLeaseName].includes(name)
      : name !== directoryLeaseName && !name.endsWith(".tmp") && !/^[a-f0-9]{64}\.ciphertext\.json$/.test(name))) throw new Error("Unrecognized store inventory; inspect it before retirement");
    let inventory: readonly string[];
    if (backend === "sqlite") {
      sqlite = new SqliteCiphertextStorage(directory, Number.MAX_SAFE_INTEGER, 100000);
      inventory = await sqlite.listDigests();
    } else {
      inventory = names.filter((name) => /^[a-f0-9]{64}\.ciphertext\.json$/.test(name)).map((name) => name.slice(0, 64));
    }
    if (inventory.length > 100000) throw new Error("Retirement inventory exceeds its limit");
    const existing = new Set(inventory);
    const selected = policy.digests(), present = selected.filter((digest) => existing.has(digest));
    const filename = (digest: string) => {
      const result = path.resolve(directory, `${digest}.ciphertext.json`);
      if (path.dirname(result) !== directory) throw new Error("Unsafe retirement path");
      return result;
    };
    if (!sqlite) for (const digest of present) if (!(await lstat(filename(digest))).isFile()) throw new Error("Retirement target must be a regular file");
    const plan = { backend, selected, present, policyDigest: createHash("sha256").update(JSON.stringify(selected)).digest("hex") };
    if (auditPath === undefined) return { ...plan, applied: false, removed: 0 };
    const target = path.join(await realpath(path.dirname(path.resolve(auditPath))), path.basename(path.resolve(auditPath)));
    const relative = path.relative(directory, target);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Retirement audit must be outside the store");
    audit = await open(target, "wx", 0o600);
    await append({ event: "started", at: new Date().toISOString(), ...plan });
    let removed = 0;
    for (const digest of present) {
      let changed: boolean;
      if (sqlite) changed = await sqlite.removeOffline(digest);
      else {
        // Recheck immediately before unlink; never follow a symlink to its target.
        if (!(await lstat(filename(digest))).isFile()) throw new Error("Retirement target changed");
        await unlink(filename(digest)); changed = true;
      }
      if (changed) removed++;
      await append({ event: "removed", digest, changed });
    }
    await sqlite?.close();
    await append({ event: "completed", at: new Date().toISOString(), removed });
    return { ...plan, applied: true, removed };
  } finally {
    try { await audit?.close(); }
    finally { try { await sqlite?.close(); } finally { await release(); } }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, source, policyFile, expectedPolicyDigest, audit, ...extra] = process.argv.slice(2);
    if (!source || !policyFile || extra.length || !["plan", "apply"].includes(command ?? "") || (command === "plan" ? expectedPolicyDigest !== undefined || audit !== undefined : !expectedPolicyDigest || !audit)) throw new Error("Usage: retire.js plan <stopped-store> <policy-file> | apply <stopped-store> <policy-file> <reviewed-policy-digest> <new-private-audit-file>");
    const policy = await readRetirementPolicy(policyFile);
    if (command === "apply" && createHash("sha256").update(JSON.stringify(policy.digests())).digest("hex") !== expectedPolicyDigest) throw new Error("Retirement policy changed or its reviewed digest is incorrect; review a fresh plan");
    const result = await retireCiphertext(source, policy, command === "apply" ? audit : undefined);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) { process.stderr.write(`Cipherstore retirement failed: ${error instanceof Error ? error.message : "unknown error"}\n`); process.exitCode = 1; }
}
