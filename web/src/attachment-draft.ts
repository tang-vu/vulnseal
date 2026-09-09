// SPDX-License-Identifier: Apache-2.0
import { utf8 } from "@vulnseal/shared";
export type AttachmentDraft = { readonly filename: string; readonly mediaType: string; readonly size: string; readonly digest: string };
export const emptyAttachmentDraft: AttachmentDraft = { filename: "", mediaType: "", size: "", digest: "" };
/** Pending input may be incomplete or invalid metadata, but remains bounded text. */
export function validateAttachmentDraft(input: unknown): AttachmentDraft {
  if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(Object.keys(emptyAttachmentDraft).sort())) throw new Error("Invalid attachment draft");
  const value = input as AttachmentDraft;
  if (Object.values(value).some((field) => typeof field !== "string" || utf8(field).length > 4096)) throw new Error("Attachment draft fields must be text of at most 4 KiB each");
  return { filename: value.filename, mediaType: value.mediaType, size: value.size, digest: value.digest };
}
