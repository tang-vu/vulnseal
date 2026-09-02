// SPDX-License-Identifier: Apache-2.0
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type WalletCheckpoint = {
  readonly network: "preprod";
  readonly address: string;
  readonly shielded: string;
  readonly unshielded: string;
  readonly dust: string;
};

type EncryptedEnvelope = {
  readonly version: 1;
  readonly algorithm: "aes-256-gcm+scrypt";
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly tag: string;
};

const aad = Buffer.from("vulnseal:preprod-wallet-checkpoint:v1", "utf8");
const integrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkpointPath = path.join(integrationRoot, ".wallet-state", "preprod.json.enc");

const encoded = (value: Buffer): string => value.toString("base64url");
const decoded = (value: string): Buffer => Buffer.from(value, "base64url");

const validateEnvelope = (value: unknown): EncryptedEnvelope => {
  if (value === null || typeof value !== "object") throw new Error("Invalid wallet checkpoint envelope");
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.algorithm !== "aes-256-gcm+scrypt" ||
    typeof record.salt !== "string" ||
    typeof record.iv !== "string" ||
    typeof record.ciphertext !== "string" ||
    typeof record.tag !== "string"
  ) {
    throw new Error("Invalid wallet checkpoint envelope");
  }
  return record as EncryptedEnvelope;
};

const validateCheckpoint = (value: unknown): WalletCheckpoint => {
  if (value === null || typeof value !== "object") throw new Error("Invalid wallet checkpoint payload");
  const record = value as Record<string, unknown>;
  if (
    record.network !== "preprod" ||
    typeof record.address !== "string" ||
    typeof record.shielded !== "string" ||
    typeof record.unshielded !== "string" ||
    typeof record.dust !== "string"
  ) {
    throw new Error("Invalid wallet checkpoint payload");
  }
  return record as WalletCheckpoint;
};

export const loadPreprodCheckpoint = async (
  password: string,
  expectedAddress: string,
  sourcePath = checkpointPath,
): Promise<WalletCheckpoint | undefined> => {
  let serialized: string;
  try {
    serialized = await readFile(sourcePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const envelope = validateEnvelope(JSON.parse(serialized));
    const salt = decoded(envelope.salt);
    const key = scryptSync(password, salt, 32);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, decoded(envelope.iv));
      decipher.setAAD(aad);
      decipher.setAuthTag(decoded(envelope.tag));
      const plaintext = Buffer.concat([
        decipher.update(decoded(envelope.ciphertext)),
        decipher.final(),
      ]);
      const checkpoint = validateCheckpoint(JSON.parse(plaintext.toString("utf8")));
      plaintext.fill(0);
      if (checkpoint.address !== expectedAddress) {
        throw new Error("Wallet checkpoint does not belong to the configured Preprod address");
      }
      return checkpoint;
    } finally {
      key.fill(0);
    }
  } catch {
    throw new Error("Unable to authenticate or restore the encrypted Preprod wallet checkpoint");
  }
};

export const savePreprodCheckpoint = async (
  password: string,
  checkpoint: WalletCheckpoint,
  destinationPath = checkpointPath,
): Promise<void> => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const plaintext = Buffer.from(JSON.stringify(checkpoint), "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      version: 1,
      algorithm: "aes-256-gcm+scrypt",
      salt: encoded(salt),
      iv: encoded(iv),
      ciphertext: encoded(ciphertext),
      tag: encoded(cipher.getAuthTag()),
    };
    await mkdir(path.dirname(destinationPath), { recursive: true });
    const temporaryPath = `${destinationPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, destinationPath);
  } finally {
    plaintext.fill(0);
    key.fill(0);
  }
};
