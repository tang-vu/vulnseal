// SPDX-License-Identifier: Apache-2.0
import { copyArtifactDirectory } from "./copy-artifact-directory.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const source = path.join(root, "contract", "src", "managed", "vulnseal");
const target = path.join(root, "web", "dist");

for (const directory of ["keys", "zkir"]) {
  const from = path.join(source, directory);
  copyArtifactDirectory(root, from, path.join(target, directory), { optional: true });
}
