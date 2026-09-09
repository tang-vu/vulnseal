// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
export const directoryLeaseName = ".vulnseal-writer.lock";

/** Cooperative cross-process exclusion. Never guesses whether an existing owner is dead. */
export const acquireDirectoryLease = async (directory: string): Promise<() => Promise<void>> => {
  const root = await realpath(directory), lock = path.join(root, directoryLeaseName);
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Cipherstore directory is locked. Stop its writer before backup or starting another writer; inspect an abandoned lock manually.");
    throw error;
  }
  const ownerPath = path.join(lock, "owner.json"), token = randomUUID();
  try { await writeFile(ownerPath, JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 }); }
  catch (error) { await rmdir(lock).catch(() => {}); throw error; }
  let released = false;
  return async () => {
    if (released) return;
    const owner = JSON.parse(await readFile(ownerPath, "utf8")) as { token?: string };
    if (owner.token !== token) throw new Error("Cipherstore directory lock ownership changed; refusing to remove it");
    await unlink(ownerPath); await rmdir(lock); released = true;
  };
};
