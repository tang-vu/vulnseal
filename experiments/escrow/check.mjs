// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'experiments/escrow/escrow.compact');
const before = await readFile(source);
const scratch = path.join(root, '.compact');
await mkdir(scratch, { recursive: true });
const scratchReal = await realpath(scratch);
assert.equal(scratchReal, path.join(await realpath(root), '.compact'));
const temporary = await mkdtemp(path.join(scratchReal, 'escrow-check-'));
const output = path.join(temporary, 'managed');
const options = { cwd: root, windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 };
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function compact(args) {
  if (process.platform !== 'win32') return run('compact', args, options);
  const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
  const linuxPath = (value) => {
    const match = /^([A-Za-z]):\\(.*)$/.exec(value);
    assert.ok(match, `Cannot translate WSL path: ${value}`);
    return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
  };
  const translated = args.map((arg) => path.isAbsolute(arg) ? linuxPath(arg) : arg);
  return run('wsl.exe', [
    ...(process.env.VULNSEAL_COMPACT_WSL_DISTRO ? ['--distribution', process.env.VULNSEAL_COMPACT_WSL_DISTRO] : []),
    '--exec', 'bash', '-lc', `cd ${quote(linuxPath(root))} && compact ${translated.map(quote).join(' ')}`,
  ], options);
}

let evidence;
try {
  const version = (await compact(['compile', '--version'])).stdout.trim();
  assert.match(version, /\b0\.31\.1\b/, 'This experiment requires the pinned compiler 0.31.1');
  await compact(['compile', '--skip-zk', source, output]);
  assert.deepEqual(await readFile(source), before, 'Source changed during compilation');
  const bindings = path.join(output, 'contract/index.js');
  const result = await run(process.execPath, ['--test', 'experiments/escrow/escrow.test.mjs'], {
    ...options,
    env: { ...process.env, VULNSEAL_ESCROW_BINDINGS: pathToFileURL(bindings).href },
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  evidence = {
    capturedAt: new Date().toISOString(), compiler: version, node: process.version,
    sourceSha256: sha256(before), bindingsSha256: sha256(await readFile(bindings)),
    testsSha256: sha256(await readFile(new URL('./escrow.test.mjs', import.meta.url))),
    simulatorPassed: true, provingKeysGenerated: false, networkTransactions: 0,
  };
} finally {
  const actual = await realpath(temporary);
  assert.equal(path.dirname(actual), scratchReal);
  assert.ok(path.basename(actual).startsWith('escrow-check-'));
  await rm(actual, { recursive: true });
}
console.log(JSON.stringify(evidence, null, 2));
