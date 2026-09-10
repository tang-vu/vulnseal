// SPDX-License-Identifier: Apache-2.0
// Run against compiled modules, including inside the dependency-free runtime image.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const backend = process.argv[2];
assert.ok(['filesystem', 'sqlite'].includes(backend) && process.argv.length === 3);
const dist = process.env.VULNSEAL_CIPHERSTORE_DIST ?? fileURLToPath(new URL('../cipherstore/dist/', import.meta.url));
const { createCipherstoreServer, FilesystemCiphertextStorage, SqliteCiphertextStorage, acquireDirectoryLease, readRetirementPolicy } = await import(pathToFileURL(path.join(dist, 'index.js')).href);
const execute = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), 'vulnseal-runtime-retirement-'));
const directory = path.join(root, 'store'), policyFile = path.join(root, 'policy.json');
let running;
const command = async (file, args, env = {}) => (await execute(process.execPath, [path.join(dist, file), ...args], {
  windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024, env: { ...process.env, ...env },
})).stdout;
const storage = () => backend === 'sqlite' ? new SqliteCiphertextStorage(directory, 100000, 10) : new FilesystemCiphertextStorage(directory, 100000, 10);
async function stop() {
  if (!running) return;
  const { server, adapter, release } = running;
  running = undefined;
  try {
    await new Promise((resolve, reject) => server.close((error) => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
    await server.drain();
  } finally { try { await adapter.close?.(); } finally { await release(); } }
}
async function start(guarded) {
  const retirementPolicy = guarded ? await readRetirementPolicy(policyFile) : undefined;
  await mkdir(directory, { recursive: true });
  const release = await acquireDirectoryLease(directory);
  const adapter = storage();
  const server = createCipherstoreServer({ dataDirectory: directory, storage: adapter,
    ...(retirementPolicy ? { retirementPolicy } : {}) });
  running = { server, adapter, release };
  await adapter.prepare();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
const body = (name) => JSON.stringify({ version: 1, algorithm: 'AES-256-GCM', keyDerivation: 'none-random-256-bit-key',
  aad: `vulnseal:ciphertext:v1:${name}`, iv: 'AAAAAAAAAAAAAAAA', ciphertext: Buffer.alloc(32, 1).toString('base64url') });
const retired = body('retired'), retained = body('retained');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const request = (base, content, method = 'GET') => fetch(`${base}/v1/blobs/sha256:${hash(content)}`, {
  method, signal: AbortSignal.timeout(5000), ...(method === 'PUT' ? { body: content, headers: { 'content-type': 'application/vnd.vulnseal.ciphertext+json' } } : {}),
});
try {
  let base = await start(false);
  for (const content of [retired, retained]) assert.equal((await request(base, content, 'PUT')).status, 201);
  await stop();
  const backup = path.join(root, 'old-backup');
  await command('backup.js', ['create', directory, backup]);
  await writeFile(policyFile, JSON.stringify({ format: 'vulnseal-retired-ciphertext', version: 1, digests: [hash(retired)] }), { mode: 0o600 });
  const plan = JSON.parse(await command('retire.js', ['plan', directory, policyFile]));
  assert.deepEqual(plan.present, [hash(retired)]);
  const audit = path.join(root, 'audit.jsonl');
  await assert.rejects(command('retire.js', ['apply', directory, policyFile, '0'.repeat(64), audit]), (error) => error.code === 1 && /plan changed/.test(error.stderr));
  await assert.rejects(access(audit), { code: 'ENOENT' });
  const applied = JSON.parse(await command('retire.js', ['apply', directory, policyFile, plan.planDigest, audit]));
  assert.equal(applied.removed, 1);
  const events = (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map((event) => event.event), ['started', 'removed', 'completed']);
  assert.equal(events[0].planDigest, plan.planDigest);
  const raw = storage();
  try {
    await assert.rejects(raw.read(hash(retired)), { code: 'ENOENT' });
    assert.equal(Buffer.from(await raw.read(hash(retained))).toString(), retained);
  } finally { await raw.close?.(); }
  base = await start(true);
  assert.equal((await request(base, retired)).status, 404);
  assert.equal((await request(base, retired, 'PUT')).status, 410);
  assert.equal((await request(base, retained)).status, 200);
  assert.equal(await (await request(base, retained)).text(), retained);
  assert.equal((await request(base, retained, 'PUT')).status, 200);
  assert.equal((await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(5000) })).status, 200);
  await stop();
  const restore = backend === 'sqlite' ? 'restore-sqlite' : 'restore';
  const destination = path.join(root, 'resurrection');
  await assert.rejects(command('backup.js', [restore, backup, destination], { CIPHERSTORE_RETIREMENT_FILE: policyFile }), (error) => error.code === 1 && /STORAGE_RETIRED/.test(error.stderr));
  await assert.rejects(access(destination), { code: 'ENOENT' });
  const cleanBackup = path.join(root, 'new-backup');
  assert.equal(JSON.parse(await command('backup.js', ['create', directory, cleanBackup])).blobs, 1);
  assert.equal(JSON.parse(await command('backup.js', ['verify', cleanBackup])).blobs, 1);
  const invalidDirectory = path.join(root, 'invalid-policy-store');
  await assert.rejects(command('index.js', [], { CIPHERSTORE_RETIREMENT_FILE: path.join(root, 'missing-policy.json'), CIPHERSTORE_DATA_DIR: invalidDirectory }), (error) => error.code === 1 && /ENOENT/.test(error.stderr));
  await assert.rejects(access(invalidDirectory), { code: 'ENOENT' });
} finally {
  await stop();
  const actual = await realpath(root);
  assert.equal(path.dirname(actual), await realpath(tmpdir()));
  assert.ok(path.basename(actual).startsWith('vulnseal-runtime-retirement-'));
  await rm(actual, { recursive: true });
}
console.log(JSON.stringify({ backend, node: process.version, retirementRuntimePassed: true, fixtureRemoved: true }));
