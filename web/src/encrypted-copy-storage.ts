// SPDX-License-Identifier: Apache-2.0
export type StoredCopy = { readonly id: string; readonly label: string; readonly revision: number; readonly updatedAt: string; readonly encrypted: string };
export type StoredCopyLabel = Omit<StoredCopy, "encrypted">;
export const BROWSER_STORAGE_TIMEOUT_MS = 15_000;
const storageTimeout = () => new Error("Encrypted browser storage did not confirm completion within 15 seconds. Keep this workspace open and download an encrypted file backup. A write may already have committed; reopen and inspect the saved copy before retrying.");
const writeFailure = (cause: unknown): unknown => cause && typeof cause === "object" && "name" in cause && cause.name === "QuotaExceededError"
  ? new Error("Browser storage quota was exceeded. Keep this workspace open and download an encrypted file backup. After verifying that backup, remove unneeded browser copies or free device space before saving again.")
  : cause;
export const createEncryptedCopyStorage = (databaseName: string, storeName: string, validateEncrypted: (encrypted: string) => void) => {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("Encrypted browser storage is unavailable")); return; }
    const request = indexedDB.open(databaseName, 1);
    let closed = false;
    const fail = (cause: unknown) => { if (closed) return; closed = true; clearTimeout(timer); reject(cause); };
    const timer = setTimeout(() => fail(storageTimeout()), BROWSER_STORAGE_TIMEOUT_MS);
    request.onupgradeneeded = () => {
      if (closed) { request.transaction?.abort(); return; }
      request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onerror = () => fail(request.error ?? new Error("Could not open encrypted browser storage"));
    request.onblocked = () => fail(new Error("Another tab is blocking encrypted storage. Close older tabs and retry."));
    request.onsuccess = () => {
      if (closed) { request.result.close(); return; }
      closed = true; clearTimeout(timer);
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });

  /** Bound connection/transaction waits separately; late browser events cannot confirm a failed caller. */
  const transaction = async <T>(mode: IDBTransactionMode, setup: (store: IDBObjectStore, fail: (cause: unknown) => void, active: () => boolean) => () => T): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction | undefined, closed = false;
      const finish = () => {
        if (closed) return;
        closed = true; clearTimeout(timer); db.close();
      };
      const fail = (cause: unknown) => {
        if (closed) return;
        finish(); reject(cause);
        try { tx?.abort(); } catch { /* Already committed/aborted; outcome remains unconfirmed. */ }
      };
      const timer = setTimeout(() => fail(storageTimeout()), BROWSER_STORAGE_TIMEOUT_MS);
      try {
        tx = db.transaction(storeName, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
        tx.onabort = tx.onerror = () => fail(tx?.error ?? new Error("Encrypted browser storage transaction failed"));
        const result = setup(tx.objectStore(storeName), fail, () => !closed);
        tx.oncomplete = () => {
          if (closed) return;
          try { const value = result(); finish(); resolve(value); } catch (cause) { fail(cause); }
        };
      } catch (cause) { fail(cause); }
    });
  };
  const metadata = (value: unknown): StoredCopy => {
    if (!value || typeof value !== "object") throw new Error("Damaged encrypted browser copy");
    const row = value as StoredCopy;
    if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(["encrypted", "id", "label", "revision", "updatedAt"]) || typeof row.id !== "string" || !/^[a-f0-9-]{36}$/.test(row.id) || typeof row.label !== "string" || !row.label.trim() || row.label.length > 80 || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt)) || typeof row.encrypted !== "string") throw new Error("Damaged encrypted browser copy");
    return row;
  };
  const validate = (value: unknown): StoredCopy => {
    const row = metadata(value);
    if (row.encrypted.length > 32 * 1024 * 1024) throw new Error("Encrypted browser copy is too large");
    validateEncrypted(row.encrypted);
    return row;
  };
  const label = ({ encrypted: _encrypted, ...metadata }: StoredCopy): StoredCopyLabel => metadata;
  const list = (): Promise<StoredCopyLabel[]> => transaction("readonly", (store, fail, active) => {
    const rows: StoredCopyLabel[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      if (!active()) return;
      const cursor = request.result;
      if (!cursor) return;
      try { rows.push(label(metadata(cursor.value))); cursor.continue(); } catch (cause) { fail(cause); }
    };
    return () => rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
  const read = (id: string): Promise<StoredCopy> => transaction("readonly", (store, fail, active) => {
    const request = store.get(id);
    let result: StoredCopy;
    request.onsuccess = () => {
      if (!active()) return;
      try { if (!request.result) throw new Error("Encrypted browser copy was removed"); result = validate(request.result); } catch (cause) { fail(cause); }
    };
    return () => result;
  });
  /** Compare revision and write in one IndexedDB transaction; stale tabs cannot overwrite newer copies. */
  const write = async (id: string, labelText: string, encrypted: string, expectedRevision: number | null): Promise<StoredCopy> => {
    const next = validate({ id, label: labelText.trim(), encrypted, revision: (expectedRevision ?? 0) + 1, updatedAt: new Date().toISOString() });
    try {
      return await transaction("readwrite", (store, fail, active) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (!active()) return;
          try {
            const previous = request.result === undefined ? undefined : validate(request.result);
            if ((previous?.revision ?? null) !== expectedRevision) throw new Error("This browser copy changed in another tab. Autosave stopped; reopen the latest copy or save this workspace to a separate file.");
            const write = store.put(next);
            write.onerror = () => fail(write.error ?? new Error("Encrypted browser storage write failed"));
          } catch (cause) { fail(cause); }
        };
        return () => next;
      });
    } catch (cause) { throw writeFailure(cause); }
  };

  /** Delete only the revision the user reviewed; an active stale writer cannot recreate it. */
  const remove = async (id: string, expectedRevision: number): Promise<void> => {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Invalid browser-copy revision");
    return transaction("readwrite", (store, fail, active) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!active()) return;
        try {
          if (!request.result) throw new Error("Encrypted browser copy was already removed. Refresh the catalog.");
          if (metadata(request.result).revision !== expectedRevision) throw new Error("This browser copy changed in another tab. Refresh the catalog and review the latest revision before deleting.");
          store.delete(id);
        } catch (cause) { fail(cause); }
      };
      return () => undefined;
    });
  };

  return { list, read, write, remove };
};
