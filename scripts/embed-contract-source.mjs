// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Preserve compiler mappings while making the application source portable. */
export async function embedContractSource(mapFile, originalMapFile, sourceFile) {
  const map = JSON.parse(await readFile(mapFile, "utf8"));
  if (map.version !== 3 || !Array.isArray(map.sources) || map.sources.some((source) => typeof source !== "string")) throw new Error("Invalid contract source map");
  const index = map.sources.findIndex((source) => path.resolve(path.dirname(originalMapFile), map.sourceRoot ?? "", source) === path.resolve(sourceFile));
  if (index < 0) throw new Error("Contract source is absent from compiler source map");
  if (map.sourcesContent !== undefined && (!Array.isArray(map.sourcesContent) || map.sourcesContent.length !== map.sources.length)) throw new Error("Invalid embedded compiler sources");
  const contents = map.sourcesContent ?? map.sources.map(() => null);
  contents[index] = await readFile(sourceFile, "utf8");
  map.sourcesContent = contents;
  await writeFile(mapFile, JSON.stringify(map) + "\n");
}
