// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { attachmentMetadata, hashAttachment, MAX_HASH_FILE_BYTES } from "./attachments.js";

describe("private attachment metadata", () => {
  it("hashes exact file bytes and falls back to a binary media type", async () => {
    const file = new File(["abc"], "proof.bin");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("abc").buffer });
    expect(await hashAttachment(file)).toEqual({ filename: "proof.bin", mediaType: "application/octet-stream", size: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
  });
  it("rejects oversized files before reading their contents", async () => {
    const read = vi.fn();
    await expect(hashAttachment({ size: MAX_HASH_FILE_BYTES + 1, arrayBuffer: read } as unknown as File)).rejects.toThrow("32 MiB");
    expect(read).not.toHaveBeenCalled();
  });
  it("accepts normalized metadata including an empty file, and rejects invalid manual values", () => {
    expect(attachmentMetadata(" e\u0301.txt ", " text/plain ", "0", "AB".repeat(32))).toEqual({ filename: "é.txt", mediaType: "text/plain", size: 0, sha256: "ab".repeat(32) });
    for (const size of ["", "-1", "1.5", "1e3", "9007199254740992"]) expect(() => attachmentMetadata("proof", "text/plain", size, "ab".repeat(32))).toThrow("whole-byte");
    expect(() => attachmentMetadata(" ", "text/plain", "0", "ab".repeat(32))).toThrow("filename");
    expect(() => attachmentMetadata("proof", "text/plain", "0", "not-a-digest")).toThrow("SHA-256");
  });
});
