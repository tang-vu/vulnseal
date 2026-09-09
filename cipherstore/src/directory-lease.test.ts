// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { acquireDirectoryLease, directoryLeaseName } from "./directory-lease.js";
import { createCipherstoreBackup } from "./backup.js";
const execute = promisify(execFile);

it("excludes another process and backup creation until the owner releases its directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-lease-"));
  const release = await acquireDirectoryLease(root);
  const childCode = `import { acquireDirectoryLease } from ${JSON.stringify(new URL("./directory-lease.ts", import.meta.url).href)};
    try { const release = await acquireDirectoryLease(process.argv[1]); await release(); console.log('ACQUIRED'); }
    catch (error) { if (!String(error).includes('directory is locked')) throw error; console.log('LOCKED'); }`;
  const run = () => execute(process.execPath, ["--input-type=module", "-e", childCode, root], { windowsHide: true });
  expect((await run()).stdout.trim()).toBe("LOCKED");
  await expect(createCipherstoreBackup(root, `${root}-backup`)).rejects.toThrow("directory is locked");
  expect(await readdir(root)).toEqual([directoryLeaseName]);
  await release(); await release();
  expect((await run()).stdout.trim()).toBe("ACQUIRED");
  expect(await readdir(root)).toEqual([]);
});

it("refuses to remove a lock whose owner token changed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-lease-owner-"));
  const release = await acquireDirectoryLease(root);
  const filename = path.join(root, directoryLeaseName, "owner.json");
  await writeFile(filename, JSON.stringify({ token: "replacement-owner" }));
  await expect(release()).rejects.toThrow("ownership changed");
  expect(JSON.parse(await readFile(filename, "utf8")).token).toBe("replacement-owner");
  await expect(acquireDirectoryLease(root)).rejects.toThrow("directory is locked");
});
