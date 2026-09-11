// SPDX-License-Identifier: Apache-2.0
import { beforeAll, expect, it, vi } from "vitest";
import { bytesToHex, sha256 } from "@vulnseal/shared";
import { createRecipient, decryptDisclosure, encryptDisclosure, MAX_ATTACHMENT_TRANSFER_BYTES, type Disclosure, type RecipientKeys } from "./handoff.js";
import { recoveryDraft, recoveryFixture } from "./test/recovery-fixture.js";
let keys: RecipientKeys, other: RecipientKeys, disclosure: Disclosure;
const original = new Uint8Array([0, 255, 128, 13, 10, 1]);
beforeAll(async () => {
  [keys, other] = await Promise.all([createRecipient(), createRecipient()]);
  const attachments = await Promise.all([{ filename: "proof.bin", bytes: original }, { filename: "empty.bin", bytes: new Uint8Array() }].map(async file => ({ filename: file.filename, mediaType: "application/octet-stream", size: file.bytes.length, sha256: bytesToHex(await sha256(file.bytes)) })));
  const { snapshot } = await recoveryFixture({ ...recoveryDraft, attachments });
  disclosure = { network: "undeployed", contractAddress: null, programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt };
});
it("transfers exact binary and empty files bound to the sealed report, with fresh encryption", async () => {
  const files = [{ filename: "proof.bin", bytes: original }, { filename: "empty.bin", bytes: new Uint8Array() }];
  const first = await encryptDisclosure(disclosure, keys.recipient, files);
  expect(JSON.parse(first).version).toBe(2);
  expect(first).not.toContain("proof.bin"); expect(first).not.toContain(disclosure.key);
  expect(await encryptDisclosure(disclosure, keys.recipient, files)).not.toBe(first);
  const opened = await decryptDisclosure(first, keys);
  expect(opened.disclosure).toEqual(disclosure); expect(opened.attachments).toEqual(files);
  await expect(decryptDisclosure(first, other)).rejects.toThrow("different recipient");
  const changed = JSON.parse(first); changed.version = 1;
  await expect(decryptDisclosure(JSON.stringify(changed), keys)).rejects.toThrow("authentication failed");
  changed.version = 2; changed.ciphertext = (changed.ciphertext[0] === "A" ? "B" : "A") + changed.ciphertext.slice(1);
  await expect(decryptDisclosure(JSON.stringify(changed), keys)).rejects.toThrow("authentication failed");
});
it("captures caller bytes before asynchronous validation", async () => {
  const bytes = new Uint8Array(original), files = [{ filename: "proof.bin", bytes }];
  const pending = encryptDisclosure(disclosure, keys.recipient, files);
  bytes.fill(7); files[0]!.filename = "different.bin";
  expect((await decryptDisclosure(await pending, keys)).attachments[0]).toEqual({ filename: "proof.bin", bytes: original });
});
it("rejects authenticated plaintext whose attachment bytes do not match the report", async () => {
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  const intercepted = vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (algorithm, key, data) => {
    if (typeof algorithm !== "string" && algorithm.name === "AES-GCM") {
      const payload = JSON.parse(new TextDecoder().decode(data));
      payload.attachments[0].data = "AQ";
      return encrypt(algorithm, key, new TextEncoder().encode(JSON.stringify(payload)));
    }
    return encrypt(algorithm, key, data);
  });
  let serialized: string;
  try { serialized = await encryptDisclosure(disclosure, keys.recipient, [{ filename: "proof.bin", bytes: original }]); }
  finally { intercepted.mockRestore(); }
  await expect(decryptDisclosure(serialized, keys)).rejects.toThrow("match the sealed report");
});
it("rejects unmatched, renamed and duplicate originals", async () => {
  for (const files of [[{ filename: "proof.bin", bytes: new Uint8Array([1]) }], [{ filename: "other.bin", bytes: original }]]) await expect(encryptDisclosure(disclosure, keys.recipient, files)).rejects.toThrow("match the sealed report");
  await expect(encryptDisclosure(disclosure, keys.recipient, [{ filename: "proof.bin", bytes: original }, { filename: "proof.bin", bytes: original }])).rejects.toThrow("Duplicate");
});
it("rejects over-limit transfers before crypto and keeps metadata-only v1 compatibility", async () => {
  await expect(encryptDisclosure(disclosure, keys.recipient, [{ filename: "big.bin", bytes: new Uint8Array(MAX_ATTACHMENT_TRANSFER_BYTES + 1) }])).rejects.toThrow("8 MiB");
  const old = await encryptDisclosure(disclosure, keys.recipient);
  expect(JSON.parse(old).version).toBe(1); expect((await decryptDisclosure(old, keys)).attachments).toEqual([]);
});
