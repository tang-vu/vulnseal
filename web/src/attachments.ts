// SPDX-License-Identifier: Apache-2.0
import { bytesToHex, sha256, type AttachmentDigest } from "@vulnseal/shared";

export const MAX_HASH_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_ATTACHMENTS = 50;

export const attachmentMetadata = (filename: string, mediaType: string, size: string, digest: string): AttachmentDigest => {
  if (!filename.trim() || !mediaType.trim()) throw new Error("Enter a filename and media type");
  if (!/^\d+$/.test(size) || !Number.isSafeInteger(Number(size))) throw new Error("Enter a nonnegative whole-byte size");
  if (!/^[a-f0-9]{64}$/i.test(digest.trim())) throw new Error("Enter a 64-character SHA-256 hexadecimal digest");
  return { filename: filename.trim().normalize("NFC"), mediaType: mediaType.trim().normalize("NFC"), size: Number(size), sha256: digest.trim().toLowerCase() };
};

/** Bytes are read only for local hashing; callers retain metadata, never the File. */
export const hashAttachment = async (file: File): Promise<AttachmentDigest> => {
  if (file.size > MAX_HASH_FILE_BYTES) throw new Error("Local hashing supports files up to 32 MiB. Enter an externally computed digest for larger files.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return attachmentMetadata(file.name, file.type || "application/octet-stream", String(file.size), bytesToHex(await sha256(bytes)));
};
