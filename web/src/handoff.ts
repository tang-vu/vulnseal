// SPDX-License-Identifier: Apache-2.0
import { pureCircuits } from "@vulnseal/contract";
import { base64UrlToBytes, bytesToBase64Url, bytesToHex, canonicalizeReport, hexToBytes, openReport, parseCiphertextEnvelope, randomBytes, sha256, utf8 } from "@vulnseal/shared";

export const MAX_HANDOFF_BYTES = 20 * 1024 * 1024;
const buffer = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer;
const encode = (value: ArrayBuffer) => bytesToBase64Url(new Uint8Array(value));
const decode = (value: unknown) => {
  if (typeof value !== "string") throw new Error("Invalid handoff encoding");
  const result = base64UrlToBytes(value);
  if (bytesToBase64Url(result) !== value) throw new Error("Noncanonical handoff encoding");
  return result;
};
const hex = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid handoff identifier");
  return value;
};
const object = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error("Unsupported handoff document");
  return value as Record<string, unknown>;
};
const parse = (serialized: string, max = MAX_HANDOFF_BYTES): unknown => {
  if (utf8(serialized).length > max) throw new Error("Handoff file is too large");
  return JSON.parse(serialized);
};
export type Recipient = { readonly format: "vulnseal-recipient"; readonly version: 1; readonly publicKey: string; readonly fingerprint: string };
export type RecipientKeys = { readonly recipient: Recipient; readonly privateKey: CryptoKey };
const importPublic = async (spki: string) => {
  const key = await crypto.subtle.importKey("spki", buffer(decode(spki)), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
  const algorithm = key.algorithm as RsaHashedKeyAlgorithm;
  if (algorithm.modulusLength !== 3072 || bytesToHex(algorithm.publicExponent) !== "010001") throw new Error("Unsupported recipient key");
  if (encode(await crypto.subtle.exportKey("spki", key)) !== spki) throw new Error("Noncanonical recipient key");
  return key;
};
export const parseRecipient = async (serialized: string): Promise<Recipient> => {
  const value = object(parse(serialized, 8192), ["format", "version", "publicKey", "fingerprint"]);
  if (value.format !== "vulnseal-recipient" || value.version !== 1 || typeof value.publicKey !== "string") throw new Error("Not a public recipient key");
  await importPublic(value.publicKey);
  const fingerprint = bytesToHex(await sha256(decode(value.publicKey)));
  if (fingerprint !== hex(value.fingerprint)) throw new Error("Recipient fingerprint does not match its key");
  return { format: "vulnseal-recipient", version: 1, publicKey: value.publicKey, fingerprint };
};
export const createRecipient = async (): Promise<RecipientKeys> => {
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { recipient: { format: "vulnseal-recipient", version: 1, publicKey: bytesToBase64Url(spki), fingerprint: bytesToHex(await sha256(spki)) }, privateKey: pair.privateKey };
};

// Separate from session recovery: this key can decrypt disclosures, never authorize contract calls.
const backupAad = buffer(utf8("vulnseal:recipient-key-backup:v1"));
const passwordKey = async (password: string, salt: Uint8Array, usage: KeyUsage) => {
  if (password.length < 12 || utf8(password).length > 1024) throw new Error("Use a recipient backup password of 12 characters or more (at most 1024 UTF-8 bytes)");
  const material = await crypto.subtle.importKey("raw", buffer(utf8(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations: 600_000 }, material, { name: "AES-GCM", length: 256 }, false, [usage]);
};
export const backupRecipient = async (keys: RecipientKeys, password: string): Promise<string> => {
  const recipientFile = JSON.stringify(keys.recipient), privateKey = keys.privateKey;
  const recipient = await parseRecipient(recipientFile);
  await assertRecipientPair(recipient, privateKey);
  const salt = randomBytes(16), iv = randomBytes(12);
  const plaintext = JSON.stringify({ recipient, privateKey: encode(await crypto.subtle.exportKey("pkcs8", privateKey)) });
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: backupAad }, await passwordKey(password, salt, "encrypt"), buffer(utf8(plaintext)));
  return JSON.stringify({ format: "vulnseal-recipient-backup", version: 1, salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv), ciphertext: encode(ciphertext) });
};
export const restoreRecipient = async (serialized: string, password: string): Promise<RecipientKeys> => {
  const value = object(parse(serialized, 16384), ["format", "version", "salt", "iv", "ciphertext"]);
  if (value.format !== "vulnseal-recipient-backup" || value.version !== 1) throw new Error("Not a recipient key backup");
  const salt = decode(value.salt), iv = decode(value.iv), ciphertext = decode(value.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error("Invalid recipient backup lengths");
  const key = await passwordKey(password, salt, "decrypt");
  let plaintext: ArrayBuffer;
  try { plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: backupAad }, key, buffer(ciphertext)); }
  catch { throw new Error("Wrong recipient backup password or damaged file"); }
  const inner = object(parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext), 8192), ["recipient", "privateKey"]);
  const recipient = await parseRecipient(JSON.stringify(inner.recipient));
  const privateKey = await crypto.subtle.importKey("pkcs8", buffer(decode(inner.privateKey)), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
  await assertRecipientPair(recipient, privateKey);
  return { recipient, privateKey };
};

async function assertRecipientPair(recipient: Recipient, privateKey: CryptoKey): Promise<void> {
  const algorithm = privateKey.algorithm as RsaHashedKeyAlgorithm;
  if (privateKey.type !== "private" || algorithm.name !== "RSA-OAEP" || algorithm.hash?.name !== "SHA-256" || !privateKey.usages.includes("decrypt")) throw new Error("Unsupported recipient private key");
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", await importPublic(recipient.publicKey));
  if (privateJwk.n !== publicJwk.n || privateJwk.e !== publicJwk.e) throw new Error("Recipient backup key pair does not match");
}

export type Disclosure = { readonly network: string; readonly contractAddress: string | null; readonly programId: string; readonly reportId: string; readonly envelope: string; readonly key: string; readonly salt: string };
export const validateDisclosure = async (input: unknown) => {
  const value = object(input, ["network", "contractAddress", "programId", "reportId", "envelope", "key", "salt"]);
  if (typeof value.network !== "string" || !["undeployed", "local", "preview", "preprod", "mainnet"].includes(value.network) || (value.network === "undeployed") !== (value.contractAddress === null) || typeof value.envelope !== "string") throw new Error("Invalid disclosure network or envelope");
  const disclosure: Disclosure = { network: value.network, contractAddress: value.contractAddress === null ? null : hex(value.contractAddress), programId: hex(value.programId), reportId: hex(value.reportId), envelope: value.envelope, key: hex(value.key), salt: hex(value.salt) };
  if (utf8(disclosure.envelope).length > MAX_HANDOFF_BYTES / 2) throw new Error("Disclosure is too large");
  const envelope = parseCiphertextEnvelope(disclosure.envelope);
  if (envelope.aad !== `vulnseal:ciphertext:v1:${disclosure.programId}`) throw new Error("Disclosure belongs to another program");
  const report = await openReport(disclosure.envelope, hexToBytes(disclosure.key));
  const digest = await sha256(utf8(canonicalizeReport(report)));
  if (bytesToHex(pureCircuits.deriveReportCommitment(hexToBytes(disclosure.programId), Uint8Array.from(digest), hexToBytes(disclosure.salt))) !== disclosure.reportId) throw new Error("Disclosure does not match its report commitment");
  return { disclosure, report, ciphertextDigest: bytesToHex(await sha256(utf8(disclosure.envelope))) };
};
const handoffAad = (fingerprint: string) => buffer(utf8(`vulnseal:recipient-handoff:v1:${fingerprint}`));
export const encryptDisclosure = async (input: Disclosure, recipient: Recipient): Promise<string> => {
  const recipientFile = JSON.stringify(recipient);
  const { disclosure } = await validateDisclosure(input);
  const checked = await parseRecipient(recipientFile);
  const aad = handoffAad(checked.fingerprint);
  const key = randomBytes(32), iv = randomBytes(12);
  const aes = await crypto.subtle.importKey("raw", buffer(key), "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: aad }, aes, buffer(utf8(JSON.stringify(disclosure))));
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP", label: aad }, await importPublic(checked.publicKey), buffer(key));
  return JSON.stringify({ format: "vulnseal-disclosure", version: 1, recipient: checked.fingerprint, wrappedKey: encode(wrappedKey), iv: bytesToBase64Url(iv), ciphertext: encode(ciphertext) });
};
export const decryptDisclosure = async (serialized: string, keys: RecipientKeys) => {
  const value = object(parse(serialized), ["format", "version", "recipient", "wrappedKey", "iv", "ciphertext"]);
  if (value.format !== "vulnseal-disclosure" || value.version !== 1) throw new Error("Not an encrypted disclosure package");
  if (hex(value.recipient) !== keys.recipient.fingerprint) throw new Error("This disclosure is addressed to a different recipient key");
  const iv = decode(value.iv), wrappedKey = decode(value.wrappedKey), ciphertext = decode(value.ciphertext);
  if (iv.length !== 12 || wrappedKey.length !== 384 || ciphertext.length < 16) throw new Error("Invalid disclosure lengths");
  const aad = handoffAad(keys.recipient.fingerprint);
  let plaintext: ArrayBuffer;
  try {
    const key = await crypto.subtle.decrypt({ name: "RSA-OAEP", label: aad }, keys.privateKey, buffer(wrappedKey));
    if (key.byteLength !== 32) throw new Error("Invalid key length");
    const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: aad }, aes, buffer(ciphertext));
  } catch { throw new Error("Disclosure authentication failed: wrong key or damaged package"); }
  return validateDisclosure(parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
};
