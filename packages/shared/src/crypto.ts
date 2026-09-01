// SPDX-License-Identifier: Apache-2.0
import { canonicalizeReport } from "./canonicalize.js";
import {
  assertBytes32,
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  fromUtf8,
  utf8,
} from "./encoding.js";
import type {
  CiphertextEnvelope,
  CommitmentInputs,
  SealedReport,
  VulnerabilityReport,
} from "./types.js";

const AES_ALGORITHM = "AES-GCM";
const ENVELOPE_ALGORITHM = "AES-256-GCM";
const IV_LENGTH = 12;

const arrayBuffer = (value: Uint8Array): ArrayBuffer =>
  new Uint8Array(value).buffer;

const subtle = (): SubtleCrypto => {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto.subtle;
};

export const randomBytes = (length: number): Uint8Array => {
  if (!Number.isSafeInteger(length) || length < 1) throw new Error("Invalid random byte length");
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
};

export const sha256 = async (value: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await subtle().digest("SHA-256", arrayBuffer(value)));

const importAesKey = async (
  rawKey: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> =>
  subtle().importKey(
    "raw",
    arrayBuffer(assertBytes32(rawKey, "encryption key")),
    { name: AES_ALGORITHM, length: 256 },
    false,
    [usage],
  );

export const serializeCiphertextEnvelope = (envelope: CiphertextEnvelope): string =>
  JSON.stringify({
    aad: envelope.aad,
    algorithm: envelope.algorithm,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    keyDerivation: envelope.keyDerivation,
    version: envelope.version,
  });

export const parseCiphertextEnvelope = (serialized: string): CiphertextEnvelope => {
  const value: unknown = JSON.parse(serialized);
  if (value === null || typeof value !== "object") throw new Error("Invalid ciphertext envelope");
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    candidate.algorithm !== ENVELOPE_ALGORITHM ||
    candidate.keyDerivation !== "none-random-256-bit-key" ||
    typeof candidate.aad !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    throw new Error("Unsupported or malformed ciphertext envelope");
  }
  if (base64UrlToBytes(candidate.iv).byteLength !== IV_LENGTH) {
    throw new Error("AES-GCM IV must be 12 bytes");
  }
  base64UrlToBytes(candidate.ciphertext);
  return {
    version: 1,
    algorithm: ENVELOPE_ALGORITHM,
    keyDerivation: "none-random-256-bit-key",
    iv: candidate.iv,
    aad: candidate.aad,
    ciphertext: candidate.ciphertext,
  };
};

export const sealReport = async (
  report: VulnerabilityReport,
  publicProgramId: string,
  providedKey?: Uint8Array,
  providedIv?: Uint8Array,
): Promise<SealedReport> => {
  const canonicalReport = canonicalizeReport(report);
  const canonicalBytes = utf8(canonicalReport);
  const canonicalReportDigest = await sha256(canonicalBytes);
  const key = assertBytes32(providedKey ?? randomBytes(32), "encryption key");
  const iv = new Uint8Array(providedIv ?? randomBytes(IV_LENGTH));
  if (iv.byteLength !== IV_LENGTH) throw new Error("AES-GCM IV must be 12 bytes");
  const aad = `vulnseal:ciphertext:v1:${publicProgramId}`;
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      {
        name: AES_ALGORITHM,
        iv: arrayBuffer(iv),
        additionalData: arrayBuffer(utf8(aad)),
        tagLength: 128,
      },
      await importAesKey(key, "encrypt"),
      arrayBuffer(canonicalBytes),
    ),
  );
  const envelope: CiphertextEnvelope = {
    version: 1,
    algorithm: ENVELOPE_ALGORITHM,
    keyDerivation: "none-random-256-bit-key",
    iv: bytesToBase64Url(iv),
    aad,
    ciphertext: bytesToBase64Url(ciphertext),
  };
  const serializedEnvelope = serializeCiphertextEnvelope(envelope);
  const ciphertextDigest = await sha256(utf8(serializedEnvelope));
  return {
    canonicalReport,
    canonicalReportDigest,
    key,
    envelope,
    serializedEnvelope,
    ciphertextDigest,
    contentAddress: `sha256:${bytesToHex(ciphertextDigest)}`,
  };
};

export const openReport = async (
  serializedEnvelope: string,
  rawKey: Uint8Array,
): Promise<VulnerabilityReport> => {
  const envelope = parseCiphertextEnvelope(serializedEnvelope);
  try {
    const plaintext = new Uint8Array(
      await subtle().decrypt(
        {
          name: AES_ALGORITHM,
          iv: arrayBuffer(base64UrlToBytes(envelope.iv)),
          additionalData: arrayBuffer(utf8(envelope.aad)),
          tagLength: 128,
        },
        await importAesKey(rawKey, "decrypt"),
        arrayBuffer(base64UrlToBytes(envelope.ciphertext)),
      ),
    );
    return JSON.parse(fromUtf8(plaintext)) as VulnerabilityReport;
  } catch (error) {
    throw new Error("Ciphertext authentication failed", { cause: error });
  }
};

export const validateContentDigest = async (
  serializedEnvelope: string,
  expectedAddress: string,
): Promise<boolean> => {
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedAddress)) return false;
  const digest = await sha256(utf8(serializedEnvelope));
  return expectedAddress === `sha256:${bytesToHex(digest)}`;
};

/**
 * Validates the exact byte-width boundary passed to Compact. This deliberately
 * does not imitate Compact's persistentHash; the generated pure circuit is the
 * sole source of truth for the on-chain commitment.
 */
export const prepareCommitmentInputs = (inputs: CommitmentInputs): CommitmentInputs => ({
  programId: assertBytes32(inputs.programId, "programId"),
  canonicalReportDigest: assertBytes32(
    inputs.canonicalReportDigest,
    "canonicalReportDigest",
  ),
  reportSalt: assertBytes32(inputs.reportSalt, "reportSalt"),
});
