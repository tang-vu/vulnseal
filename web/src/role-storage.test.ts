// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { deleteStoredRole, listStoredRoles, readStoredRole, ROLE_STORAGE_TIMEOUT_MS, writeStoredRole } from "./role-storage.js";

const id = "12345678-1234-1234-1234-123456789abc";
const encrypted = JSON.stringify({ format: "vulnseal-role-backup", version: 1, salt: "a".repeat(22), iv: "b".repeat(16), ciphertext: "c".repeat(22) });
// Scheduling faults only; real IndexedDB atomicity is covered by the browser suite.
function browser() {
  vi.useFakeTimers();
  const request: any = {}, operation: any = {};
  const store = { get: vi.fn(() => operation), openCursor: vi.fn(() => operation), put: vi.fn(() => ({})), delete: vi.fn() };
  const tx: any = { objectStore: () => store, abort: vi.fn() };
  const db = { transaction: vi.fn(() => tx), close: vi.fn() };
  request.result = db;
  vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });
  return { request, operation, store, tx, db };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("bounds open and closes a late connection without starting storage work", async () => {
  const fake = browser();
  const pending = listStoredRoles();
  const rejected = expect(pending).rejects.toThrow("did not confirm completion");
  await vi.advanceTimersByTimeAsync(ROLE_STORAGE_TIMEOUT_MS);
  await rejected;
  fake.request.onsuccess();
  expect(fake.db.close).toHaveBeenCalledOnce();
  expect(fake.db.transaction).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts a late schema upgrade after the open deadline", async () => {
  const fake = browser(); fake.request.transaction = fake.tx;
  const pending = expect(listStoredRoles()).rejects.toThrow("15 seconds");
  await vi.advanceTimersByTimeAsync(ROLE_STORAGE_TIMEOUT_MS); await pending;
  fake.request.onupgradeneeded();
  expect(fake.tx.abort).toHaveBeenCalledOnce();
});
it.each(["list", "read", "write", "delete"] as const)("bounds a stalled %s transaction and ignores late callbacks", async (kind) => {
  const fake = browser();
  const pending = kind === "list" ? listStoredRoles() : kind === "read" ? readStoredRole(id) : kind === "write" ? writeStoredRole(id, "Copy", encrypted, null) : deleteStoredRole(id, 1);
  const rejected = expect(pending).rejects.toThrow("A write may already have committed");
  fake.request.onsuccess();
  await vi.advanceTimersByTimeAsync(ROLE_STORAGE_TIMEOUT_MS); await rejected;
  expect(fake.tx.abort).toHaveBeenCalledOnce(); expect(fake.db.close).toHaveBeenCalledOnce();
  fake.operation.onsuccess(); fake.tx.oncomplete();
  expect(fake.store.put).not.toHaveBeenCalled(); expect(fake.store.delete).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("closes a connection and clears its timer when transaction creation throws", async () => {
  const fake = browser(); fake.db.transaction.mockImplementation(() => { throw new Error("Database closed"); });
  const pending = expect(listStoredRoles()).rejects.toThrow("Database closed");
  fake.request.onsuccess(); await pending;
  expect(fake.db.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("clears both timers on success without aborting the transaction", async () => {
  const fake = browser(); const pending = listStoredRoles(); fake.request.onsuccess();
  await Promise.resolve(); fake.operation.result = null; fake.operation.onsuccess(); fake.tx.oncomplete();
  await expect(pending).resolves.toEqual([]);
  expect(fake.tx.abort).not.toHaveBeenCalled(); expect(fake.db.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("still rejects when a storage implementation throws undefined", async () => {
  const fake = browser(); fake.db.transaction.mockImplementation(() => { throw undefined; });
  const pending = listStoredRoles().then(() => "resolved", () => "rejected");
  fake.request.onsuccess();
  await expect(pending).resolves.toBe("rejected");
  expect(fake.db.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
