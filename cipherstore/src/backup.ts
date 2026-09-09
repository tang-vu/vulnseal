// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_CIPHERTEXT_BYTES, validateEnvelope } from "./server.js";

const manifestName = "vulnseal-cipherstore-manifest.json";
const filenamePattern = /^([a-f0-9]{64})\.ciphertext\.json$/;
type Entry = { readonly digest: string; readonly bytes: number };
type Manifest = { readonly format: "vulnseal-cipherstore-backup"; readonly version: 1; readonly createdAt: string; readonly blobs: readonly Entry[] };
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.sort()));
const readRegular = async (filename: string, max: number) => {
  const info = await lstat(filename);
  if (!info.isFile() || info.size > max) throw new Error("Backup input is not a bounded regular file");
  const file = await open(filename, "r");
  try { const bytes = await file.readFile(); if (bytes.length > max) throw new Error("Backup input grew beyond its size limit"); return bytes; }
  finally { await file.close(); }
};
const readBlob = async (directory: string, digest: string) => {
  const bytes = await readRegular(path.join(directory, `${digest}.ciphertext.json`), MAX_CIPHERTEXT_BYTES);
  if (createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("Ciphertext backup digest mismatch");
  validateEnvelope(bytes); return bytes;
};
const writeExclusive = async (filename: string, bytes: Uint8Array) => {
  const file = await open(filename, "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
};
const freshDestination = async (source: string, destination: string) => {
  const target = path.join(await realpath(path.dirname(path.resolve(destination))), path.basename(path.resolve(destination)));
  const relative = path.relative(source, target);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Backup destination must be outside its source directory");
  await mkdir(target, { mode: 0o700 }); // Exclusive: existing directories are never merged or overwritten.
  return target;
};

/** The writer must be stopped: immutable blobs simplify copies but do not define a live inventory snapshot. */
export const createCipherstoreBackup = async (source: string, destination: string): Promise<Manifest> => {
  const directory = await realpath(source), names = (await readdir(directory)).sort();
  const blobs: Entry[] = [];
  const output = await freshDestination(directory, destination);
  for (const name of names) {
    if (name.endsWith(".tmp")) continue;
    const match = filenamePattern.exec(name);
    if (!match) throw new Error("Source contains an unrecognized entry; inspect it with the writer stopped");
    if (blobs.length >= 100_000) throw new Error("Backup contains too many blobs");
    const digest = match[1]!, bytes = await readBlob(directory, digest);
    await writeExclusive(path.join(output, name), bytes); blobs.push({ digest, bytes: bytes.length });
  }
  const manifest: Manifest = { format: "vulnseal-cipherstore-backup", version: 1, createdAt: new Date().toISOString(), blobs };
  await writeExclusive(path.join(output, manifestName), Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  return manifest;
};

export const verifyCipherstoreBackup = async (source: string): Promise<Manifest> => {
  const directory = await realpath(source);
  const value: unknown = JSON.parse((await readRegular(path.join(directory, manifestName), 16 * 1024 * 1024)).toString("utf8"));
  if (!exact(value, ["format", "version", "createdAt", "blobs"]) || value.format !== "vulnseal-cipherstore-backup" || value.version !== 1 || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.blobs) || value.blobs.length > 100_000) throw new Error("Invalid ciphertext backup manifest");
  const ids = new Set<string>();
  for (const entry of value.blobs) {
    if (!exact(entry, ["digest", "bytes"]) || typeof entry.digest !== "string" || !/^[a-f0-9]{64}$/.test(entry.digest) || ids.has(entry.digest) || !Number.isSafeInteger(entry.bytes) || Number(entry.bytes) < 1 || Number(entry.bytes) > MAX_CIPHERTEXT_BYTES) throw new Error("Invalid ciphertext backup entry");
    ids.add(entry.digest);
    if ((await readBlob(directory, entry.digest)).length !== entry.bytes) throw new Error("Ciphertext backup size mismatch");
  }
  const expected = [manifestName, ...[...ids].map((digest) => `${digest}.ciphertext.json`)].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expected)) throw new Error("Backup inventory does not match the manifest");
  return value as unknown as Manifest;
};

export const restoreCipherstoreBackup = async (source: string, destination: string): Promise<Manifest> => {
  const directory = await realpath(source), manifest = await verifyCipherstoreBackup(directory);
  const output = await freshDestination(directory, destination);
  for (const entry of manifest.blobs) {
    const bytes = await readBlob(directory, entry.digest);
    if (bytes.length !== entry.bytes) throw new Error("Backup changed during restoration");
    await writeExclusive(path.join(output, `${entry.digest}.ciphertext.json`), bytes);
  }
  return manifest;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, source, destination, ...extra] = process.argv.slice(2);
    if (!source || extra.length || !["create", "verify", "restore"].includes(command ?? "") || (command === "verify" ? destination !== undefined : !destination)) throw new Error("Usage: backup.js create <stopped-store> <new-backup-dir> | verify <backup-dir> | restore <backup-dir> <new-store-dir>");
    const result = command === "create" ? await createCipherstoreBackup(source, destination!) : command === "restore" ? await restoreCipherstoreBackup(source, destination!) : await verifyCipherstoreBackup(source);
    process.stdout.write(JSON.stringify({ operation: command, blobs: result.blobs.length, bytes: result.blobs.reduce((total, entry) => total + entry.bytes, 0) }) + "\n");
  } catch (error) { process.stderr.write(`Cipherstore backup failed: ${error instanceof Error ? error.message : "unknown error"}\n`); process.exitCode = 1; }
}
