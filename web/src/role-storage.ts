// SPDX-License-Identifier: Apache-2.0
export type StoredRole = { readonly id: string; readonly label: string; readonly revision: number; readonly updatedAt: string; readonly encrypted: string };
export type StoredRoleLabel = Omit<StoredRole, "encrypted">;
const databaseName = "vulnseal-encrypted-roles";
const storeName = "roles";
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!globalThis.indexedDB) { reject(new Error("Encrypted browser storage is unavailable")); return; }
  const request = indexedDB.open(databaseName, 1);
  let blocked = false;
  request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
  request.onerror = () => reject(request.error ?? new Error("Could not open encrypted browser storage"));
  request.onblocked = () => { blocked = true; reject(new Error("Another tab is blocking encrypted storage. Close older tabs and retry.")); };
  request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
});
const metadata = (value: unknown): StoredRole => {
  if (!value || typeof value !== "object") throw new Error("Damaged encrypted browser copy");
  const row = value as StoredRole;
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(["encrypted", "id", "label", "revision", "updatedAt"]) || typeof row.id !== "string" || !/^[a-f0-9-]{36}$/.test(row.id) || typeof row.label !== "string" || !row.label.trim() || row.label.length > 80 || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt)) || typeof row.encrypted !== "string") throw new Error("Damaged encrypted browser copy");
  return row;
};
const validate = (value: unknown): StoredRole => {
  const row = metadata(value);
  if (row.encrypted.length > 32 * 1024 * 1024) throw new Error("Encrypted browser copy is too large");
  const envelope = JSON.parse(row.encrypted) as Record<string, unknown>;
  if (!envelope || JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(["ciphertext", "format", "iv", "salt", "version"]) || envelope.format !== "vulnseal-role-backup" || envelope.version !== 1 || typeof envelope.salt !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(envelope.salt) || typeof envelope.iv !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) || typeof envelope.ciphertext !== "string" || !/^[A-Za-z0-9_-]{22,}$/.test(envelope.ciphertext)) throw new Error("Only encrypted single-role backups can be stored here");
  return row;
};
const label = ({ encrypted: _encrypted, ...metadata }: StoredRole): StoredRoleLabel => metadata;
export const listStoredRoles = async (): Promise<StoredRoleLabel[]> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const rows: StoredRoleLabel[] = [];
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).openCursor();
    let failure: unknown;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try { rows.push(label(metadata(cursor.value))); cursor.continue(); } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error("Could not list encrypted browser copies")); };
  });
};
export const readStoredRole = async (id: string): Promise<StoredRole> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly"); const request = tx.objectStore(storeName).get(id);
    let result: StoredRole | undefined, failure: unknown;
    request.onsuccess = () => { try { if (!request.result) throw new Error("Encrypted browser copy was removed"); result = validate(request.result); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => { db.close(); resolve(result!); };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error("Could not read encrypted browser copy")); };
  });
};
/** Compare revision and write in one IndexedDB transaction; stale tabs cannot overwrite newer copies. */
export const writeStoredRole = async (id: string, labelText: string, encrypted: string, expectedRevision: number | null): Promise<StoredRole> => {
  const next = validate({ id, label: labelText.trim(), encrypted, revision: (expectedRevision ?? 0) + 1, updatedAt: new Date().toISOString() });
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite", { durability: "strict" }); const store = tx.objectStore(storeName); const request = store.get(id);
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const previous = request.result === undefined ? undefined : validate(request.result);
        if ((previous?.revision ?? null) !== expectedRevision) throw new Error("This browser copy changed in another tab. Autosave stopped; reopen the latest copy or save this workspace to a separate file.");
        store.put(next);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error("Encrypted browser storage write failed")); };
  });
};

/** Delete only the revision the user reviewed; an active stale writer cannot recreate it. */
export const deleteStoredRole = async (id: string, expectedRevision: number): Promise<void> => {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Invalid browser-copy revision");
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite", { durability: "strict" });
    const store = tx.objectStore(storeName), request = store.get(id);
    let failure: unknown;
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error("Encrypted browser copy was already removed. Refresh the catalog.");
        if (metadata(request.result).revision !== expectedRevision) throw new Error("This browser copy changed in another tab. Refresh the catalog and review the latest revision before deleting.");
        store.delete(id);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error("Could not delete encrypted browser copy")); };
  });
};
