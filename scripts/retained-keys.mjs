// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Any retained key material makes a destructive syntax-only compile unsafe. */
export async function hasRetainedKeys(managed) {
  try { return (await readdir(path.join(managed, "keys"))).length > 0; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
