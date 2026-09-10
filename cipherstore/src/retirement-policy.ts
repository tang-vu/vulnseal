// SPDX-License-Identifier: Apache-2.0
import { lstat, open } from "node:fs/promises";
import { validateStorageDigest } from "./storage.js";

const maxBytes = 8 * 1024 * 1024;

/** Immutable operator configuration. It restricts access; it does not erase stored bytes. */
export class RetirementPolicy {
  readonly #digests: Set<string>;
  constructor(digests: readonly string[]) {
    if (!Array.isArray(digests) || digests.length > 100_000) throw new Error("Invalid retirement inventory");
    this.#digests = new Set();
    for (const digest of digests) {
      if (typeof digest !== "string") throw new Error("Invalid retired digest");
      validateStorageDigest(digest);
      if (this.#digests.has(digest)) throw new Error("Duplicate retired digest");
      this.#digests.add(digest);
    }
  }
  has(digest: string): boolean { return this.#digests.has(digest); }
  digests(): readonly string[] { return [...this.#digests].sort(); }
  assertAllowed(digest: string): void {
    if (this.has(digest)) throw new Error("STORAGE_RETIRED");
  }
}

/** A configured missing, oversized or malformed file always fails closed. */
export async function readRetirementPolicy(filename: string): Promise<RetirementPolicy> {
  const info = await lstat(filename);
  if (!info.isFile() || info.size > maxBytes) throw new Error("Retirement policy must be a bounded regular file");
  const file = await open(filename, "r");
  let bytes: Buffer;
  try {
    if (!(await file.stat()).isFile()) throw new Error("Retirement policy must be a regular file");
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new Error("Retirement policy exceeds its size limit");
    bytes = buffer.subarray(0, offset);
  } finally { await file.close(); }
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["digests", "format", "version"])) throw new Error("Invalid retirement policy");
  const policy = value as { format?: unknown; version?: unknown; digests?: unknown };
  if (policy.format !== "vulnseal-retired-ciphertext" || policy.version !== 1 || !Array.isArray(policy.digests)) throw new Error("Unsupported retirement policy");
  return new RetirementPolicy(policy.digests);
}
