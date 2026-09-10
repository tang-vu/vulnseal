// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { checkCapacity, withDirectoryWrite } from "./capacity.js";
import { storageErrorCode, validateStorageDigest, type CiphertextStorage } from "./storage.js";

/** Publish only a complete, flushed blob, without replacing a concurrent writer. */
const storeImmutable = async (filename: string, body: Uint8Array): Promise<boolean> => {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(body);
      await file.sync();
    } finally { await file.close(); }
    try {
      await link(temporary, filename);
      return true;
    } catch (error) {
      if (storageErrorCode(error) !== "EEXIST") throw error;
      const existing = await readFile(filename);
      if (!existing.equals(Buffer.from(body))) throw new Error("IMMUTABLE_CONFLICT");
      return false;
    }
  } finally { await unlink(temporary); }
};

export class FilesystemCiphertextStorage implements CiphertextStorage {
  private readonly directory: string;
  constructor(directory: string, private readonly maxBytes: number, private readonly maxBlobs: number) {
    this.directory = path.resolve(directory);
    for (const limit of [maxBytes, maxBlobs]) if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Cipherstore limits must be nonnegative safe integers");
  }
  private filename(hexDigest: string): string {
    validateStorageDigest(hexDigest);
    return path.join(this.directory, `${hexDigest}.ciphertext.json`);
  }
  async prepare(): Promise<void> { await mkdir(this.directory, { recursive: true }); }
  async read(hexDigest: string): Promise<Uint8Array> { return readFile(this.filename(hexDigest)); }
  async put(hexDigest: string, body: Uint8Array): Promise<boolean> {
    const filename = this.filename(hexDigest);
    return withDirectoryWrite(this.directory, async () => {
      await this.prepare();
      try {
        const existing = await readFile(filename);
        if (!existing.equals(Buffer.from(body))) throw new Error("IMMUTABLE_CONFLICT");
        return false;
      } catch (error) { if (storageErrorCode(error) !== "ENOENT") throw error; }
      await checkCapacity(this.directory, body.byteLength, this.maxBytes, this.maxBlobs);
      return storeImmutable(filename, body);
    });
  }
  async checkReadiness(): Promise<void> {
    await withDirectoryWrite(this.directory, async () => {
      await this.prepare();
      await checkCapacity(this.directory, 1, this.maxBytes, this.maxBlobs);
      const probe = path.join(this.directory, `.readiness-${randomUUID()}.tmp`);
      const bytes = Buffer.from("vulnseal-storage-probe");
      try {
        await storeImmutable(probe, bytes);
        if (!(await readFile(probe)).equals(bytes)) throw new Error("READINESS_PROBE_MISMATCH");
      } finally {
        try { await unlink(probe); } catch (error) { if (storageErrorCode(error) !== "ENOENT") throw error; }
      }
    });
  }
}
