// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const source = path.join(root, "contract", "src", "managed", "vulnseal");
const target = path.join(root, "web", "dist");

for (const directory of ["keys", "zkir"]) {
  const from = path.join(source, directory);
  if (fs.existsSync(from)) {
    fs.cpSync(from, path.join(target, directory), { recursive: true, force: true });
  }
}
