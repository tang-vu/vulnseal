// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyArtifactDirectory } from "./copy-artifact-directory.mjs";
import { embedContractSource } from "./embed-contract-source.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractDir = path.resolve(scriptDir, "..", "contract");
const managedSource = path.join(contractDir, "src", "managed");
const managedTarget = path.join(contractDir, "dist", "managed");

if (!fs.existsSync(managedSource)) {
  throw new Error("Compact artifacts are missing. Run npm run compact first.");
}
copyArtifactDirectory(path.dirname(contractDir), managedSource, managedTarget);
fs.copyFileSync(
  path.join(contractDir, "src", "vulnseal.compact"),
  path.join(contractDir, "dist", "vulnseal.compact"),
);
await embedContractSource(
  path.join(managedTarget, "vulnseal/contract/index.js.map"),
  path.join(managedSource, "vulnseal/contract/index.js.map"),
  path.join(contractDir, "src/vulnseal.compact"),
);
