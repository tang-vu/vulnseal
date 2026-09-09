// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

/** Development only: the production entrypoint consumes explicit process env. */
export function developmentCipherstoreEnvironment(root) {
  const loaded = loadEnv("development", root, "CIPHERSTORE_");
  return {
    ...loaded,
    CIPHERSTORE_DATA_DIR: path.resolve(root, loaded.CIPHERSTORE_DATA_DIR ?? "cipherstore/data"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("Cipherstore development launcher does not accept arguments");
  const root = fileURLToPath(new URL("../", import.meta.url));
  Object.assign(process.env, developmentCipherstoreEnvironment(root));
  // Run the existing CLI in this process, retaining its lease and signal handling.
  const entry = path.join(root, "cipherstore/dist/index.js");
  process.argv[1] = entry;
  await import(pathToFileURL(entry).href);
}
