// SPDX-License-Identifier: Apache-2.0
import { opendir, stat } from "node:fs/promises";
import path from "node:path";

// One writer process per data directory; coordinate server instances within that process.
const queues = new Map<string, Promise<void>>();
export const withDirectoryWrite = async <T>(directory: string, action: () => Promise<T>): Promise<T> => {
  const key = process.platform === "win32" ? directory.toLowerCase() : directory;
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  queues.set(key, current); await previous;
  try { return await action(); }
  finally { release(); if (queues.get(key) === current) queues.delete(key); }
};

export const checkCapacity = async (directory: string, incoming: number, maxBytes: number, maxBlobs: number): Promise<void> => {
  let bytes = 0, blobs = 0;
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.ciphertext\.json$/.test(entry.name)) continue;
    bytes += (await stat(path.join(directory, entry.name))).size; blobs++;
    if (bytes > maxBytes - incoming || blobs >= maxBlobs) throw new Error("STORAGE_CAPACITY_EXCEEDED");
  }
  if (bytes > maxBytes - incoming || blobs >= maxBlobs) throw new Error("STORAGE_CAPACITY_EXCEEDED");
};
