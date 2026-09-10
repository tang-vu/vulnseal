// SPDX-License-Identifier: Apache-2.0
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function digest(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 256 * 1024 * 1024) throw new Error(`Invalid release file: ${filename}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return { bytes: stat.size, sha256: hash.digest("hex") };
}
/** Verify packaging against local compiler outputs; this does not authenticate compilation. */
export async function checkWebRelease({ workspace = root, distribution = path.join(workspace, "web", "dist"), allowManifestUpdate = false } = {}) {
  const managed = path.join(workspace, "contract", "src", "managed", "vulnseal");
  const metadataFile = path.join(managed, "compiler", "contract-info.json");
  const metadataDigest = await digest(metadataFile);
  if (metadataDigest.bytes > 1024 * 1024) throw new Error("Compiler metadata exceeds 1 MiB");
  const info = JSON.parse(await readFile(metadataFile, "utf8"));
  if (!Array.isArray(info.circuits)) throw new Error("Missing compiler circuit inventory");
  const circuits = info.circuits.filter((circuit) => circuit.proof === true).map((circuit) => circuit.name);
  if (!circuits.length || circuits.length > 100 || circuits.some((name) => typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name)) || new Set(circuits).size !== circuits.length) throw new Error("Invalid proving circuit inventory");
  circuits.sort();
  const required = circuits.flatMap((name) => [`keys/${name}.prover`, `keys/${name}.verifier`, `zkir/${name}.bzkir`]);
  const allowedContract = new Set([...required, ...circuits.map((name) => `zkir/${name}.zkir`)]);
  const files = [];
  let totalBytes = 0, existingManifest;
  async function scan(directory, prefix = "") {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Invalid release directory: ${prefix || "."}`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Release symlink is forbidden: ${relative}`);
      if (relative === "release-manifest.json") {
        const manifestStat = await lstat(path.join(directory, entry.name));
        if (!manifestStat.isFile() || manifestStat.size > 16 * 1024 * 1024) throw new Error("Invalid release manifest file");
        existingManifest = path.join(directory, entry.name); continue;
      }
      if (entry.isDirectory()) {
        if (prefix || !["assets", "keys", "zkir"].includes(entry.name)) throw new Error(`Unexpected release directory: ${relative}`);
        await scan(path.join(directory, entry.name), `${relative}/`); continue;
      }
      const allowed = relative === "index.html" || allowedContract.has(relative) || /^assets\/[A-Za-z0-9_.-]+\.(?:js|css|wasm|map|svg|png|webp|ico|woff2?)$/.test(relative);
      if (!allowed) throw new Error(`Unexpected release file: ${relative}`);
      files.push({ path: relative, ...await digest(path.join(directory, entry.name)) });
      totalBytes += files.at(-1).bytes;
      if (totalBytes > 1024 * 1024 * 1024) throw new Error("Release exceeds 1 GiB");
      if (files.length > 5000) throw new Error("Release inventory exceeds 5000 files");
    }
  }
  await scan(distribution);
  const byPath = new Map(files.map((entry) => [entry.path, entry]));
  if (!byPath.has("index.html")) throw new Error("Missing release index.html");
  if (!byPath.has("assets/submission-widget.js")) throw new Error("Missing submission widget entrypoint");
  if (files.filter(file => /^assets\/public-lookup\.worker-[A-Za-z0-9_-]+\.js$/.test(file.path)).length !== 1) throw new Error("Expected exactly one public lookup worker entrypoint");
  const html = await readFile(path.join(distribution, "index.html"), "utf8");
  const entrypoints = [...html.matchAll(/(?:src|href)=["'](?:\.\/|\/)?(assets\/[^"']+)["']/g)].map((match) => match[1]);
  if (!entrypoints.some((entry) => entry.endsWith(".js"))) throw new Error("Missing browser script entrypoint");
  for (const entry of entrypoints) if (!byPath.has(entry)) throw new Error(`Missing HTML entrypoint: ${entry}`);
  for (const entry of files.filter((entry) => /^assets\/.*\.(js|css)$/.test(entry.path))) {
    if (entry.bytes > 16 * 1024 * 1024) throw new Error(`Release script or stylesheet exceeds 16 MiB: ${entry.path}`);
    const contents = await readFile(path.join(distribution, entry.path), "utf8");
    // WASM import-object property names look like module paths but are not fetches.
    const pattern = entry.path.endsWith(".js") ? /(["'`])((?:\.\/|\/assets\/)[A-Za-z0-9_.-]+\.(?:js|wasm|css))\1(?!\s*:)/g : /url\(\s*(["']?)((?:\.\/|\/assets\/)[A-Za-z0-9_.-]+)\1\s*\)/g;
    for (const match of contents.matchAll(pattern)) {
      const referenced = match[2].startsWith("./") ? `assets/${match[2].slice(2)}` : match[2].slice(1);
      if (!byPath.has(referenced)) throw new Error(`Missing static asset reference: ${referenced} from ${entry.path}`);
    }
  }
  for (const relative of required) {
    const packaged = byPath.get(relative);
    if (!packaged) throw new Error(`Missing network release asset: ${relative}`);
    const original = await digest(path.join(managed, relative));
    if (original.sha256 !== packaged.sha256 || original.bytes !== packaged.bytes) throw new Error(`Release asset differs from compiler output: ${relative}`);
  }
  const manifest = { format: "vulnseal-web-release", version: 1, contractSource: await digest(path.join(workspace, "contract", "src", "vulnseal.compact")), compilerMetadata: metadataDigest, compilerVersion: info["compiler-version"], circuits, totalBytes, files: files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
  if (existingManifest && !allowManifestUpdate && !isDeepStrictEqual(JSON.parse(await readFile(existingManifest, "utf8")), manifest)) throw new Error("Release manifest is stale or does not match this artifact");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--write-manifest")) throw new Error("Usage: check-web-release.mjs [--write-manifest]");
    const manifest = await checkWebRelease({ allowManifestUpdate: process.argv.includes("--write-manifest") });
    if (process.argv.includes("--write-manifest")) {
      const destination = path.join(root, "web", "dist", "release-manifest.json");
      try { if ((await lstat(destination)).isSymbolicLink()) throw new Error("Release manifest cannot be a symlink"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      await writeFile(destination, JSON.stringify(manifest, null, 2) + "\n");
    }
    process.stdout.write(JSON.stringify({ circuits: manifest.circuits.length, files: manifest.files.length, bytes: manifest.totalBytes, manifestWritten: process.argv.includes("--write-manifest") }) + "\n");
  } catch (error) { process.stderr.write(`Web release check failed: ${error.message}\n`); process.exitCode = 1; }
}
