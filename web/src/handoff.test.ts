// SPDX-License-Identifier: Apache-2.0
import { beforeAll, describe, expect, it } from "vitest";
import { backupRecipient, createRecipient, decryptDisclosure, encryptDisclosure, parseRecipient, restoreRecipient, validateDisclosure, type Disclosure, type RecipientKeys } from "./handoff.js";
import { recoveryFixture } from "./test/recovery-fixture.js";

describe("recipient-bound private disclosure", () => {
  let keys: RecipientKeys, other: RecipientKeys, disclosure: Disclosure;
  beforeAll(async () => {
    [keys, other] = await Promise.all([createRecipient(), createRecipient()]);
    const { snapshot } = await recoveryFixture();
    disclosure = { network: "undeployed", contractAddress: null, programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt };
  });
  it("round trips to the intended recipient with fresh encryption and no actor fields", async () => {
    const one = await encryptDisclosure(disclosure, keys.recipient);
    const two = await encryptDisclosure(disclosure, keys.recipient);
    expect(one).not.toEqual(two);
    for (const secret of [disclosure.key, disclosure.salt, disclosure.programId, "Private vulnerability", "private@example.test"]) expect(one).not.toContain(secret);
    expect(Object.keys(JSON.parse(one)).sort()).toEqual(["ciphertext", "format", "iv", "recipient", "version", "wrappedKey"]);
    const opened = await decryptDisclosure(one, keys);
    expect(opened.disclosure).toEqual(disclosure);
    expect(opened.report.title).toBe("Private vulnerability");
    await expect(validateDisclosure({ ...disclosure, actorSecret: "34".repeat(32) })).rejects.toThrow("Unsupported handoff");
    await expect(validateDisclosure({ ...disclosure, researcherSecret: "45".repeat(32) })).rejects.toThrow("Unsupported handoff");
  });
  it("rejects the wrong recipient and authenticated-envelope tampering", async () => {
    const serialized = await encryptDisclosure(disclosure, keys.recipient);
    await expect(decryptDisclosure(serialized, other)).rejects.toThrow("different recipient");
    for (const field of ["iv", "wrappedKey", "ciphertext"]) {
      const changed = JSON.parse(serialized);
      changed[field] = (changed[field][0] === "A" ? "B" : "A") + changed[field].slice(1);
      await expect(decryptDisclosure(JSON.stringify(changed), keys)).rejects.toThrow("authentication failed");
    }
  });
  it("keeps the recipient captured before disclosure validation starts", async () => {
    const recipient = { ...keys.recipient };
    const pending = encryptDisclosure(disclosure, recipient);
    Object.assign(recipient, other.recipient);
    const serialized = await pending;
    expect(JSON.parse(serialized).recipient).toBe(keys.recipient.fingerprint);
    expect((await decryptDisclosure(serialized, keys)).disclosure).toEqual(disclosure);
    await expect(decryptDisclosure(serialized, other)).rejects.toThrow("different recipient");
  });
  it("captures a matching key pair for backup and rejects mismatched pairs before export", async () => {
    const source = { recipient: { ...keys.recipient }, privateKey: keys.privateKey };
    const pending = backupRecipient(source, "Recipient backup test password");
    Object.assign(source.recipient, other.recipient);
    source.privateKey = other.privateKey;
    const restored = await restoreRecipient(await pending, "Recipient backup test password");
    expect(restored.recipient).toEqual(keys.recipient);
    expect((await decryptDisclosure(await encryptDisclosure(disclosure, keys.recipient), restored)).disclosure).toEqual(disclosure);
    await expect(backupRecipient({ recipient: keys.recipient, privateKey: other.privateKey }, "Recipient backup test password")).rejects.toThrow("key pair does not match");
  });
  it("checks public-key fingerprints and rejects private fields in public files", async () => {
    expect(await parseRecipient(JSON.stringify(keys.recipient))).toEqual(keys.recipient);
    await expect(parseRecipient(JSON.stringify({ ...keys.recipient, fingerprint: "00".repeat(32) }))).rejects.toThrow("fingerprint");
    await expect(parseRecipient(JSON.stringify({ ...keys.recipient, privateKey: "secret" }))).rejects.toThrow("Unsupported handoff");
  });
  it("binds plaintext to the declared report and program", async () => {
    await expect(validateDisclosure({ ...disclosure, reportId: "00".repeat(32) })).rejects.toThrow("report commitment");
    await expect(validateDisclosure({ ...disclosure, programId: "00".repeat(32) })).rejects.toThrow("another program");
    await expect(validateDisclosure({ ...disclosure, network: "preprod" })).rejects.toThrow("network");
  });
  it("restores a password-protected recipient key and decrypts an earlier package", async () => {
    const saved = await backupRecipient(keys, "Recipient backup test password");
    expect(saved).not.toContain(keys.recipient.publicKey);
    const restored = await restoreRecipient(saved, "Recipient backup test password");
    expect(restored.recipient).toEqual(keys.recipient);
    expect((await decryptDisclosure(await encryptDisclosure(disclosure, keys.recipient), restored)).disclosure).toEqual(disclosure);
    await expect(restoreRecipient(saved, "Wrong recipient backup password")).rejects.toThrow("Wrong recipient backup password");
    await expect(backupRecipient(keys, "short")).rejects.toThrow("12 characters");
    const bad = JSON.parse(saved); bad.iv = (bad.iv[0] === "A" ? "B" : "A") + bad.iv.slice(1);
    await expect(restoreRecipient(JSON.stringify(bad), "Recipient backup test password")).rejects.toThrow("damaged file");
  });
});
