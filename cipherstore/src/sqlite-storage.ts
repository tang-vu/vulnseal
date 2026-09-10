// SPDX-License-Identifier: Apache-2.0
import { Worker } from "node:worker_threads";
import path from "node:path";
import { validateStorageDigest, type CiphertextStorage } from "./storage.js";

/** SQLite runs off the HTTP thread. The owner must await close() after draining requests. */
export class SqliteCiphertextStorage implements CiphertextStorage {
  private readonly worker: Worker;
  private readonly exited: Promise<void>;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (cause: Error) => void }>();
  private nextId = 0;
  private failure: Error | undefined;
  private closing: Promise<void> | undefined;
  constructor(directory: string, maxBytes: number, maxBlobs: number) {
    for (const limit of [maxBytes, maxBlobs]) if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Cipherstore limits must be nonnegative safe integers");
    // Source tests use Node 24's native type stripping; production uses compiled JS.
    // The worker loads a file even when its host runs stdin/eval. Node rejects
    // --input-type for file entrypoints. Preserve other host runtime options.
    const execArgv = process.execArgv.filter((arg, index, args) =>
      arg !== "--input-type" && !arg.startsWith("--input-type=") && args[index - 1] !== "--input-type");
    this.worker = new Worker(new URL(`./sqlite-worker.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url), { execArgv, workerData: { directory: path.resolve(directory), maxBytes, maxBlobs } });
    this.worker.on("message", ({ id, result, error }: { id: number; result?: unknown; error?: { message: string; code?: string } }) => {
      const request = this.pending.get(id); if (!request) return;
      this.pending.delete(id);
      if (error) request.reject(Object.assign(new Error(error.message), { code: error.code })); else request.resolve(result);
    });
    const fail = (cause: Error) => { this.failure = cause; for (const request of this.pending.values()) request.reject(cause); this.pending.clear(); };
    this.worker.on("error", fail);
    this.exited = new Promise((resolve) => this.worker.once("exit", (code) => {
      fail(new Error(`SQLite worker exited (${code})`)); resolve();
    }));
  }
  private request(operation: string, digest?: string, body?: Uint8Array): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closing && operation !== "close") return Promise.reject(new Error("STORAGE_CLOSED"));
    if (operation !== "close" && this.pending.size >= 128) return Promise.reject(new Error("STORAGE_BUSY"));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId; this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, operation, digest, body }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  async prepare(): Promise<void> { await this.request("prepare"); }
  async read(digest: string): Promise<Uint8Array> { validateStorageDigest(digest); return await this.request("read", digest) as Uint8Array; }
  async put(digest: string, body: Uint8Array): Promise<boolean> { validateStorageDigest(digest); return await this.request("put", digest, body) as boolean; }
  async checkReadiness(): Promise<void> { await this.request("ready"); }
  /** Administrative operation only; caller must hold the offline directory lease. */
  async removeOffline(digest: string): Promise<boolean> { validateStorageDigest(digest); return await this.request("remove", digest) as boolean; }
  /** Call under the offline directory lease when constructing a backup inventory. */
  async listDigests(): Promise<readonly string[]> { return await this.request("list") as string[]; }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      try { await this.request("close"); await this.exited; }
      finally { await this.worker.terminate(); }
    })();
  }
}
