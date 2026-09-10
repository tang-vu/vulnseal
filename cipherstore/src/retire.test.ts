// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import * as files from "node:fs/promises";
import { FilesystemCiphertextStorage } from "./filesystem-storage.js";
import { SqliteCiphertextStorage } from "./sqlite-storage.js";
import { RetirementPolicy } from "./retirement-policy.js";
import { retireCiphertext } from "./retire.js";
import { acquireDirectoryLease } from "./directory-lease.js";
import { createCipherstoreBackup, restoreCipherstoreBackup } from "./backup.js";
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

// These offline workflows repeatedly start SQLite workers and fsync stores and
// audits. Bound the whole scenario separately from HTTP/request deadlines.
const offlineWorkflowTimeout = 15_000;

it.each(["filesystem", "sqlite"] as const)("binds %s apply to the reviewed store and inventory before creating an audit", async (backend) => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-retire-scope-"));
  const first = path.join(root, "first"), second = path.join(root, "second"), audit = path.join(root, "audit.jsonl");
  const digest = "ab".repeat(32), policy = new RetirementPolicy([digest]);
  const seed = async (directory: string, id = digest) => {
    const storage = backend === "sqlite" ? new SqliteCiphertextStorage(directory, 10000, 10) : new FilesystemCiphertextStorage(directory, 10000, 10);
    try { await storage.put(id, Buffer.from("synthetic bytes")); }
    finally { if (storage instanceof SqliteCiphertextStorage) await storage.close(); }
  };
  await seed(first); await seed(second);
  const plan = await retireCiphertext(first, policy);
  expect(plan.store).toBe(await files.realpath(first));
  expect((await retireCiphertext(second, policy)).planDigest).not.toBe(plan.planDigest);
  await expect(retireCiphertext(second, policy, audit, plan.planDigest)).rejects.toThrow("plan changed");
  await expect(retireCiphertext(first, policy, audit)).rejects.toThrow("reviewed digest");
  await expect(retireCiphertext(first, policy, audit, plan.policyDigest)).rejects.toThrow("reviewed digest");
  await seed(first, "cd".repeat(32)); // Even an unrelated inventory addition invalidates the reviewed snapshot.
  await expect(retireCiphertext(first, policy, audit, plan.planDigest)).rejects.toThrow("plan changed");
  expect(await readdir(root)).not.toContain("audit.jsonl");
  const fresh = await retireCiphertext(first, policy);
  expect(fresh.present).toEqual([digest]);
  expect(fresh.planDigest).not.toBe(plan.planDigest);
  const result = await retireCiphertext(first, policy, audit, fresh.planDigest);
  expect(result.removed).toBe(1);
  expect((await retireCiphertext(second, policy)).present).toEqual([digest]);
}, offlineWorkflowTimeout);

it.each(["filesystem", "sqlite"] as const)("leaves an incomplete audit after a %s removal fault and supports an explicit new attempt", async (backend) => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-retire-failure-")), directory = path.join(root, "store"), audit = path.join(root, "audit.jsonl");
  const makeStorage = () => backend === "sqlite" ? new SqliteCiphertextStorage(directory, 10000, 10) : new FilesystemCiphertextStorage(directory, 10000, 10);
  const first = "ab".repeat(32), second = "cd".repeat(32), policy = new RetirementPolicy([first, second]);
  let storage = makeStorage();
  try { await storage.put(first, Buffer.from("first")); await storage.put(second, Buffer.from("second")); }
  finally { if (storage instanceof SqliteCiphertextStorage) await storage.close(); }
  const preview = await retireCiphertext(directory, policy);
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const fault = vi.spyOn(files, "open").mockImplementationOnce(async (...args) => {
    const handle = await original.open(...args);
    const write = handle.writeFile.bind(handle);
    let count = 0;
    vi.spyOn(handle, "writeFile").mockImplementation(async (...values) => {
      if (++count === 2) throw new Error("controlled audit write failure");
      return write(...values);
    });
    return handle;
  });
  try { await expect(retireCiphertext(directory, policy, audit, preview.planDigest)).rejects.toThrow("controlled audit write failure"); }
  finally { fault.mockRestore(); }
  const events = (await readFile(audit, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.map((event) => event.event)).toEqual(["started"]);
  expect(events[0].present).toEqual([first, second]);
  storage = makeStorage();
  try {
    await expect(storage.read(first)).rejects.toMatchObject({ code: "ENOENT" });
    expect(Buffer.from(await storage.read(second)).toString()).toBe("second");
  } finally { if (storage instanceof SqliteCiphertextStorage) await storage.close(); }
  const release = await acquireDirectoryLease(directory); await release();
  expect(await retireCiphertext(directory, policy, path.join(root, "retry.jsonl"), (await retireCiphertext(directory, policy)).planDigest)).toMatchObject({ applied: true, present: [second], removed: 1 });
}, offlineWorkflowTimeout);

it.each(["filesystem", "sqlite"] as const)("previews and removes only retired %s blobs, audits results and rejects resurrection", async (backend) => {
  const root = await mkdtemp(path.join(tmpdir(), "vulnseal-retire-")), directory = path.join(root, "store");
  const makeStorage = () => backend === "sqlite" ? new SqliteCiphertextStorage(directory, 10000, 10) : new FilesystemCiphertextStorage(directory, 10000, 10);
  const envelope = (id: string) => JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad: `vulnseal:ciphertext:v1:${id}`, iv: "AAAAAAAAAAAAAAAA", ciphertext: Buffer.alloc(32, 1).toString("base64url") });
  const retired = envelope("retired"), retained = envelope("retained");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  let storage = makeStorage();
  try { await storage.put(hash(retired), Buffer.from(retired)); await storage.put(hash(retained), Buffer.from(retained)); }
  finally { if (storage instanceof SqliteCiphertextStorage) await storage.close(); }
  const policy = new RetirementPolicy([hash(retired), "ab".repeat(32)]);
  const backup = path.join(root, "old-backup"), audit = path.join(root, "audit.jsonl");
  await createCipherstoreBackup(directory, backup);
  const preview = await retireCiphertext(directory, policy);
  expect(preview).toMatchObject({ backend, present: [hash(retired)], applied: false, removed: 0 });
  const lease = await acquireDirectoryLease(directory);
  try { await expect(retireCiphertext(directory, policy, audit, preview.planDigest)).rejects.toThrow("locked"); }
  finally { await lease(); }
  await writeFile(audit, "existing audit");
  await expect(retireCiphertext(directory, policy, audit, preview.planDigest)).rejects.toMatchObject({ code: "EEXIST" });
  storage = makeStorage();
  try { expect(Buffer.from(await storage.read(hash(retired))).toString()).toBe(retired); }
  finally { if (storage instanceof SqliteCiphertextStorage) await storage.close(); }
  await expect(retireCiphertext(directory, policy, path.join(directory, "audit.jsonl"), preview.planDigest)).rejects.toThrow("outside");
  const appliedAudit = path.join(root, "applied.jsonl");
  expect(await retireCiphertext(directory, policy, appliedAudit, preview.planDigest)).toMatchObject({ applied: true, removed: 1 });
  const events = (await readFile(appliedAudit, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.map((event) => event.event)).toEqual(["started", "removed", "completed"]);
  expect(events[0].policyDigest).toBe(preview.policyDigest);
  expect(events[1].digest).toBe(hash(retired));
  expect(events[2].removed).toBe(1);
  storage = makeStorage();
  try {
    await expect(storage.read(hash(retired))).rejects.toMatchObject({ code: "ENOENT" });
    expect(Buffer.from(await storage.read(hash(retained))).toString()).toBe(retained);
    await storage.checkReadiness();
  } finally { if (storage instanceof SqliteCiphertextStorage) await storage.close(); }
  expect(await retireCiphertext(directory, policy, path.join(root, "retry.jsonl"), (await retireCiphertext(directory, policy)).planDigest)).toMatchObject({ applied: true, present: [], removed: 0 });
  await expect(restoreCipherstoreBackup(backup, path.join(root, "resurrected"), backend, policy)).rejects.toThrow("STORAGE_RETIRED");
  expect(await readdir(root)).not.toContain("resurrected");
  const remaining = await createCipherstoreBackup(directory, path.join(root, "new-backup"));
  expect(remaining.blobs.map((entry) => entry.digest)).toEqual([hash(retained)]);
}, offlineWorkflowTimeout);
