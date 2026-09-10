// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it.each([
  { name: "eval with equals option", flags: ["--input-type=module"], eval: true },
  { name: "eval with separate option", flags: ["--input-type", "module"], eval: true },
  { name: "stdin module", flags: ["--input-type=module"], eval: false },
])("opens, writes and reopens the compiled SQLite adapter from $name", async ({ flags, eval: evaluate }) => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-sqlite-entrypoint-"));
  const module = new URL("../dist/sqlite-storage.js", import.meta.url).href;
  // Pass code directly to Node, never through a shell. A separate process is
  // essential: mutating process.execArgv in this test does not reproduce Node's
  // implicit worker startup argument inheritance.
  const source = `
    import assert from 'node:assert/strict';
    import { SqliteCiphertextStorage } from ${JSON.stringify(module)};
    const directory = ${JSON.stringify(directory)}, digest = 'ab'.repeat(32);
    const body = Buffer.from('synthetic entrypoint bytes');
    for (const first of [true, false]) {
      const store = new SqliteCiphertextStorage(directory, 10000, 10);
      try {
        await store.checkReadiness();
        assert.equal(await store.put(digest, body), first);
        assert.deepEqual(Buffer.from(await store.read(digest)), body);
      } finally { await store.close(); }
    }
    console.log('SQLITE_ENTRYPOINT_OK');
  `;
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(process.execPath, [...flags, ...(evaluate ? ["--eval", source] : [])], {
        encoding: "utf8", windowsHide: true, timeout: 12_000, maxBuffer: 1024 * 1024,
      }, (error, output, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(output));
      child.stdin!.end(evaluate ? undefined : source);
    });
    expect(stdout.trim()).toBe("SQLITE_ENTRYPOINT_OK");
  } finally {
    const actual = await realpath(directory);
    expect(path.dirname(actual)).toBe(await realpath(tmpdir()));
    expect(path.basename(actual).startsWith("vulnseal-sqlite-entrypoint-")).toBe(true);
    await rm(actual, { recursive: true });
  }
});
