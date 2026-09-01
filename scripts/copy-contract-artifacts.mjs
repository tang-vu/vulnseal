// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractDir = path.resolve(scriptDir, "..", "contract");
const managedSource = path.join(contractDir, "src", "managed");
const managedTarget = path.join(contractDir, "dist", "managed");

if (!fs.existsSync(managedSource)) {
  throw new Error("Compact artifacts are missing. Run npm run compact first.");
}
fs.cpSync(managedSource, managedTarget, { recursive: true, force: true });
fs.copyFileSync(
  path.join(contractDir, "src", "vulnseal.compact"),
  path.join(contractDir, "dist", "vulnseal.compact"),
);
