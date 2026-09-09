// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyArtifactDirectory } from "./copy-artifact-directory.mjs";
import { contractSourceMap } from "./embed-contract-source.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractDir = path.resolve(scriptDir, "..", "contract");
const managedSource = path.join(contractDir, "src", "managed");
const managedTarget = path.join(contractDir, "dist", "managed");

if (!fs.existsSync(managedSource)) {
  throw new Error("Compact artifacts are missing. Run npm run compact first.");
}
const sourceFile = path.join(contractDir, "src/vulnseal.compact");
const sourceText = fs.readFileSync(sourceFile, "utf8");
copyArtifactDirectory(path.dirname(contractDir), managedSource, managedTarget, {
  prepare(staged) {
    const relative = "vulnseal/contract/index.js.map";
    const mapFile = path.join(staged, relative);
    const map = contractSourceMap(JSON.parse(fs.readFileSync(mapFile, "utf8")), path.join(managedSource, relative), sourceFile, sourceText);
    fs.writeFileSync(mapFile, JSON.stringify(map) + "\n");
  },
});
fs.copyFileSync(
  path.join(contractDir, "src", "vulnseal.compact"),
  path.join(contractDir, "dist", "vulnseal.compact"),
);
