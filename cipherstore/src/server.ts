// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

const MAX_CIPHERTEXT_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPE = "application/vnd.vulnseal.ciphertext+json";
const digestPattern = /^\/v1\/blobs\/sha256:([0-9a-f]{64})$/;

export type CipherstoreOptions = {
  readonly dataDirectory: string;
  readonly allowedOrigin?: string;
};

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const readLimited = async (request: IncomingMessage): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    length += bytes.byteLength;
    if (length > MAX_CIPHERTEXT_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(bytes);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const validateEnvelope = (bytes: Uint8Array): void => {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("INVALID_ENVELOPE");
  }
  if (value === null || typeof value !== "object") throw new Error("INVALID_ENVELOPE");
  const envelope = value as Record<string, unknown>;
  const keys = Object.keys(envelope).sort();
  const expected = ["aad", "algorithm", "ciphertext", "iv", "keyDerivation", "version"];
  if (
    JSON.stringify(keys) !== JSON.stringify(expected) ||
    envelope.version !== 1 ||
    envelope.algorithm !== "AES-256-GCM" ||
    envelope.keyDerivation !== "none-random-256-bit-key" ||
    typeof envelope.aad !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("INVALID_ENVELOPE");
  }
  const decode = (value: string): Buffer => {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("INVALID_ENVELOPE");
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error("INVALID_ENVELOPE");
    return bytes;
  };
  if (decode(envelope.iv).length !== 12 || decode(envelope.ciphertext).length < 16 ||
      !/^vulnseal:ciphertext:v1:[A-Za-z0-9_-]{1,128}$/.test(envelope.aad)) {
    throw new Error("INVALID_ENVELOPE");
  }
};

const errorCode = (error: unknown): string | undefined =>
  error !== null && typeof error === "object" && "code" in error ? String(error.code) : undefined;

/** Publish only a complete, flushed blob, without replacing a concurrent writer. */
const storeImmutable = async (filename: string, body: Uint8Array): Promise<boolean> => {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(body);
      await file.sync();
    } finally { await file.close(); }
    try {
      await link(temporary, filename);
      return true;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = await readFile(filename);
      if (!existing.equals(Buffer.from(body))) throw new Error("IMMUTABLE_CONFLICT");
      return false;
    }
  } finally { await unlink(temporary); }
};

export const createCipherstoreServer = (options: CipherstoreOptions) => {
  const dataDirectory = path.resolve(options.dataDirectory);
  return createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    if (options.allowedOrigin) {
      response.setHeader("access-control-allow-origin", options.allowedOrigin);
      response.setHeader("vary", "origin");
    }
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "GET, PUT, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/healthz" && request.method === "GET") {
      json(response, 200, { status: "ok", stores: "ciphertext-only" });
      return;
    }
    const match = digestPattern.exec(request.url ?? "");
    if (!match?.[1]) {
      json(response, 404, { error: "not_found" });
      return;
    }
    const hexDigest = match[1];
    const filename = path.join(dataDirectory, `${hexDigest}.ciphertext.json`);
    try {
      await mkdir(dataDirectory, { recursive: true });
      if (request.method === "PUT") {
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== MEDIA_TYPE) {
          json(response, 415, { error: "ciphertext_media_type_required" });
          return;
        }
        const body = await readLimited(request);
        validateEnvelope(body);
        const actualDigest = createHash("sha256").update(body).digest("hex");
        if (actualDigest !== hexDigest) {
          json(response, 422, { error: "content_digest_mismatch" });
          return;
        }
        const stored = await storeImmutable(filename, body);
        json(response, stored ? 201 : 200, { address: `sha256:${hexDigest}`, stored });
        return;
      }
      if (request.method === "GET") {
        try {
          const body = await readFile(filename);
          if (createHash("sha256").update(body).digest("hex") !== hexDigest) {
            json(response, 500, { error: "stored_blob_corrupted" });
            return;
          }
          response.writeHead(200, {
            "content-type": MEDIA_TYPE,
            "content-length": body.byteLength,
          });
          response.end(body);
        } catch (error) {
          if (errorCode(error) !== "ENOENT") throw error;
          json(response, 404, { error: "blob_not_found" });
        }
        return;
      }
      response.setHeader("allow", "GET, PUT, OPTIONS");
      json(response, 405, { error: "method_not_allowed" });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "PAYLOAD_TOO_LARGE") json(response, 413, { error: "payload_too_large" });
      else if (code === "INVALID_ENVELOPE") json(response, 400, { error: "invalid_ciphertext_envelope" });
      else if (code === "IMMUTABLE_CONFLICT") json(response, 409, { error: "immutable_blob_conflict" });
      else json(response, 500, { error: "storage_unavailable" });
    }
  });
};

export { MAX_CIPHERTEXT_BYTES, MEDIA_TYPE };
