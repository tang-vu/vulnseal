// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";

/** Mirror generated files; overlay copying can retain keys from an older build. */
export function copyArtifactDirectory(workspace, source, target, { optional = false } = {}) {
  const root = fs.realpathSync(workspace);
  const inside = (value) => {
    const relative = path.relative(root, value);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  source = path.resolve(source); target = path.resolve(target);
  const nested = (a, b) => { const relative = path.relative(a, b); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); };
  if (!inside(source) || !inside(target) || nested(source, target) || nested(target, source)) throw new Error("Artifact paths must be disjoint and inside the workspace");
  const inspect = (directory) => {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) throw new Error("Artifact source must be an unredirected directory");
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) inspect(path.join(directory, entry.name));
      else if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Artifact source must contain only regular files and directories");
    }
  };
  let present = true;
  try { fs.lstatSync(source); } catch (error) { if (optional && error.code === "ENOENT") present = false; else throw error; }
  if (present) inspect(source);
  const parent = path.dirname(target);
  if (!inside(parent) || fs.realpathSync(parent) !== parent) throw new Error("Artifact target parent must be an existing unredirected workspace directory");
  let previous;
  try { previous = fs.lstatSync(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previous && (!previous.isDirectory() || previous.isSymbolicLink())) throw new Error("Artifact target must be an ordinary directory");
  const temporary = fs.mkdtempSync(path.join(parent, ".artifact-copy-"));
  const staged = path.join(temporary, "next"), backup = path.join(temporary, "previous");
  let safeToClean = true;
  try {
    if (present) fs.cpSync(source, staged, { recursive: true, errorOnExist: true, force: false });
    else fs.mkdirSync(staged);
    if (previous) fs.renameSync(target, backup);
    try { fs.renameSync(staged, target); }
    catch (error) {
      if (previous) {
        try { fs.renameSync(backup, target); }
        catch (rollback) { safeToClean = false; throw new Error(`Artifact installation and rollback failed; retained copy: ${backup}`, { cause: rollback }); }
      }
      throw error;
    }
  } finally {
    if (safeToClean) {
      if (fs.realpathSync(temporary) !== temporary || path.dirname(temporary) !== parent || !inside(temporary)) throw new Error("Unexpected artifact cleanup path");
      fs.rmSync(temporary, { recursive: true });
    }
  }
}
