// SPDX-License-Identifier: Apache-2.0
/** Trusted server-side adapter, never supplied by an HTTP client. */
export interface CiphertextStorage {
  /** Initialize storage without changing an existing blob. */
  prepare(): Promise<void>;
  /** Return exact stored bytes; missing blobs reject with code ENOENT. */
  read(hexDigest: string): Promise<Uint8Array>;
  /** Atomically check quota and publish. Identical retries return false, even at capacity. */
  put(hexDigest: string, body: Uint8Array): Promise<boolean>;
  /** Check capacity and perform a write/read probe without retaining a blob. */
  checkReadiness(): Promise<void>;
}

export const storageErrorCode = (error: unknown): string | undefined =>
  error !== null && typeof error === "object" && "code" in error ? String(error.code) : undefined;

export const validateStorageDigest = (hexDigest: string): void => {
  if (!/^[a-f0-9]{64}$/.test(hexDigest)) throw new Error("INVALID_STORAGE_DIGEST");
};
