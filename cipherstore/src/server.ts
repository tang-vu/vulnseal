// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { FilesystemCiphertextStorage } from "./filesystem-storage.js";
import { storageErrorCode as errorCode, type CiphertextStorage } from "./storage.js";
import type { RetirementPolicy } from "./retirement-policy.js";

const MAX_CIPHERTEXT_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPE = "application/vnd.vulnseal.ciphertext+json";
const digestPattern = /^\/v1\/blobs\/sha256:([0-9a-f]{64})$/;

export type CipherstoreOptions = {
  readonly dataDirectory: string;
  /** Optional trusted adapter; its constructor owns storage quota configuration. */
  readonly storage?: CiphertextStorage;
  readonly retirementPolicy?: RetirementPolicy;
  readonly allowedOrigin?: string;
  readonly maxStoredBytes?: number;
  readonly maxStoredBlobs?: number;
  readonly maxConcurrentUploads?: number;
  readonly requestTimeoutMs?: number;
  readonly maxConnections?: number;
  readonly metricsEnabled?: boolean;
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

export const validateEnvelope = (bytes: Uint8Array): void => {
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

export const createCipherstoreServer = (options: CipherstoreOptions) => {
  const retirementPolicy = options.retirementPolicy;
  const maxStoredBytes = options.maxStoredBytes ?? 1024 * 1024 * 1024;
  const maxStoredBlobs = options.maxStoredBlobs ?? 10_000;
  const maxConcurrentUploads = options.maxConcurrentUploads ?? 16;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const maxConnections = options.maxConnections ?? 64;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 300_000) throw new Error("Cipherstore request timeout must be between 1 and 300000 milliseconds");
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1 || maxConnections > 10_000) throw new Error("Cipherstore connection limit must be between 1 and 10000");
  for (const limit of [maxStoredBytes, maxStoredBlobs, maxConcurrentUploads]) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Cipherstore limits must be nonnegative safe integers");
  }
  if (maxConcurrentUploads < 1) throw new Error("Cipherstore upload concurrency must be positive");
  const storage = options.storage ?? new FilesystemCiphertextStorage(options.dataDirectory, maxStoredBytes, maxStoredBlobs);
  let activeUploads = 0;
  let activeRequests = 0, abortedResponses = 0;
  const completed = [0, 0, 0, 0, 0];
  const metrics = (storageReady: boolean) => [
    "# HELP vulnseal_storage_ready Current storage capacity and write/read probe succeeded (1), otherwise 0.",
    "# TYPE vulnseal_storage_ready gauge",
    `vulnseal_storage_ready ${storageReady ? 1 : 0}`,
    "# HELP vulnseal_http_responses_total Completed responses by status class, excluding metrics scrapes.",
    "# TYPE vulnseal_http_responses_total counter",
    ...completed.map((count, index) => `vulnseal_http_responses_total{status_class="${index + 1}xx"} ${count}`),
    "# HELP vulnseal_http_aborted_responses_total Responses closed before completion, excluding metrics scrapes.",
    "# TYPE vulnseal_http_aborted_responses_total counter",
    `vulnseal_http_aborted_responses_total ${abortedResponses}`,
    "# HELP vulnseal_http_active_requests Requests awaiting response completion, excluding metrics scrapes.",
    "# TYPE vulnseal_http_active_requests gauge",
    `vulnseal_http_active_requests ${activeRequests}`,
    "# HELP vulnseal_active_uploads Upload handlers still receiving or storing ciphertext.",
    "# TYPE vulnseal_active_uploads gauge",
    `vulnseal_active_uploads ${activeUploads}`,
    "",
  ].join("\n");
  let readiness: Promise<void> | undefined;
  const checkReadiness = (): Promise<void> => {
    if (readiness) return readiness;
    const work = storage.checkReadiness();
    readiness = work;
    void work.finally(() => { if (readiness === work) readiness = undefined; }).catch(() => {});
    return work;
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    if (options.metricsEnabled && request.url === "/metrics" && request.method === "GET") {
      let storageReady = false;
      try { await checkReadiness(); storageReady = true; } catch { /* Report failure without leaking filesystem details. */ }
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      response.end(metrics(storageReady));
      return;
    }
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
    if (request.url === "/readyz" && request.method === "GET") {
      try {
        await checkReadiness();
        json(response, 200, { status: "ready", storage: "writable", capacity: "available" });
      } catch (error) {
        const full = error instanceof Error && error.message === "STORAGE_CAPACITY_EXCEEDED" || ["ENOSPC", "EDQUOT"].includes(errorCode(error) ?? "");
        json(response, 503, { status: "not_ready", error: full ? "storage_capacity_exceeded" : "storage_unavailable" });
      }
      return;
    }
    const match = digestPattern.exec(request.url ?? "");
    if (!match?.[1]) {
      json(response, 404, { error: "not_found" });
      return;
    }
    const hexDigest = match[1];
    const uploading = request.method === "PUT";
    if (uploading && activeUploads >= maxConcurrentUploads) {
      response.setHeader("retry-after", "1"); request.resume();
      json(response, 503, { error: "upload_capacity_busy" }); return;
    }
    if (uploading) activeUploads++;
    try {
      if (retirementPolicy?.has(hexDigest)) {
        if (request.method === "GET") { json(response, 404, { error: "blob_not_found" }); return; }
        if (request.method === "PUT") { request.resume(); json(response, 410, { error: "blob_retired" }); return; }
      }
      await storage.prepare();
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
        const stored = await storage.put(hexDigest, body);
        json(response, stored ? 201 : 200, { address: `sha256:${hexDigest}`, stored });
        return;
      }
      if (request.method === "GET") {
        try {
          const body = await storage.read(hexDigest);
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
      else if (code === "STORAGE_BUSY") {
        response.setHeader("retry-after", "1");
        json(response, 503, { error: "storage_temporarily_busy" });
      }
      else if (code === "STORAGE_CAPACITY_EXCEEDED" || ["ENOSPC", "EDQUOT"].includes(errorCode(error) ?? "")) json(response, 507, { error: "storage_capacity_exceeded" });
      else json(response, 500, { error: "storage_unavailable" });
    } finally {
      if (uploading) activeUploads--;
    }
  };
  const operations = new Set<Promise<void>>();
  const server = createServer({
    requestTimeout: requestTimeoutMs,
    headersTimeout: Math.min(10_000, requestTimeoutMs),
    connectionsCheckingInterval: Math.min(1000, requestTimeoutMs),
    keepAliveTimeout: 5000,
    maxHeaderSize: 16 * 1024,
  }, (request, response) => {
    if (options.metricsEnabled && !(request.url === "/metrics" && request.method === "GET")) {
      activeRequests++;
      let recorded = false;
      const complete = (finished: boolean) => {
        if (recorded) return;
        recorded = true; activeRequests--;
        if (finished) {
          const index = Math.floor(response.statusCode / 100) - 1;
          if (index >= 0 && index < completed.length) completed[index] = completed[index]! + 1;
        } else abortedResponses++;
      };
      response.once("finish", () => complete(true));
      response.once("close", () => complete(response.writableFinished));
    }
    const operation = handle(request, response).catch(() => {
      if (!response.headersSent && !response.destroyed) json(response, 500, { error: "storage_unavailable" });
      else response.destroy();
    });
    operations.add(operation); void operation.finally(() => operations.delete(operation));
  });
  server.maxConnections = maxConnections;
  server.maxRequestsPerSocket = 100;
  // Also close silent sockets and stalled responses; requestTimeout bounds receipt.
  server.setTimeout(requestTimeoutMs);
  return Object.assign(server, { drain: async () => { while (operations.size) await Promise.allSettled([...operations]); } });
};

export { MAX_CIPHERTEXT_BYTES, MEDIA_TYPE };
