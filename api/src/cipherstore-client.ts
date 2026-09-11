// SPDX-License-Identifier: Apache-2.0
import { validateContentDigest, validateCipherstoreUrls } from "@vulnseal/shared";

const MEDIA_TYPE = "application/vnd.vulnseal.ciphertext+json";
export const CIPHERSTORE_REQUEST_TIMEOUT_MS = 20_000;
export const MAX_CIPHERSTORE_BYTES = 5 * 1024 * 1024;

const readCiphertext = async (response: Response): Promise<string> => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  let buffer = new Uint8Array(64 * 1024), length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_CIPHERSTORE_BYTES - length) {
        void reader.cancel().catch(() => {});
        throw new Error("Cipherstore response exceeds the 5 MiB ciphertext limit. Keep your local backup and contact the storage operator.");
      }
      const required = length + value.byteLength;
      if (required > buffer.byteLength) {
        const next = new Uint8Array(Math.min(MAX_CIPHERSTORE_BYTES, Math.max(required, buffer.byteLength * 2)));
        next.set(buffer.subarray(0, length)); buffer = next;
      }
      buffer.set(value, length); length = required;
    }
    try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length)); }
    catch { throw new Error("Cipherstore returned invalid UTF-8 ciphertext"); }
  } finally { reader.releaseLock(); }
};

export class RetiredCiphertextError extends Error {}

export class CipherstoreClient {
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly timeoutMs = CIPHERSTORE_REQUEST_TIMEOUT_MS) {
    this.baseUrl = validateCipherstoreUrls([baseUrl])[0]!;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error("Cipherstore timeout must be between 1 and 300000 milliseconds");
  }

  private async request<T>(method: "GET" | "PUT", action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const result = await action(controller.signal);
      if (controller.signal.aborted) throw new Error("Request deadline exceeded");
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(method === "PUT"
        ? "Ciphertext upload timed out. The ciphertext may already be stored. Keep your draft and retry when storage is reachable; no contract submission was started by this upload."
        : "Ciphertext download timed out. Keep your report key and backup, then retry the read when storage is reachable.");
      throw error;
    } finally { clearTimeout(timer); }
  }

  async put(address: string, serializedEnvelope: string): Promise<void> {
    if (serializedEnvelope.length > MAX_CIPHERSTORE_BYTES || new TextEncoder().encode(serializedEnvelope).byteLength > MAX_CIPHERSTORE_BYTES) throw new Error("Ciphertext exceeds the 5 MiB upload limit. Keep your draft and reduce the report size.");
    if (!(await validateContentDigest(serializedEnvelope, address))) {
      throw new Error("Ciphertext does not match its content address");
    }
    await this.request("PUT", async (signal) => {
      const response = await fetch(`${this.baseUrl}/v1/blobs/${address}`, {
        method: "PUT",
        headers: { "content-type": MEDIA_TYPE },
        body: serializedEnvelope,
        signal,
        credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      }).catch((cause: unknown) => {
        throw new Error("Ciphertext upload did not receive a response. The ciphertext may already be stored. Keep your saved report and retry its identical ciphertext when storage is reachable; no contract submission was started by this upload.", { cause });
      });
      // PUT status is sufficient; do not buffer an arbitrary response body.
      void response.body?.cancel().catch(() => {});
      if (response.status === 507) throw new Error("Ciphertext storage is full. Keep your draft and contact the storage operator before retrying.");
      if (response.status === 503) throw new Error("Ciphertext storage is temporarily busy or unavailable. Keep your draft and try again shortly.");
      if (response.status === 410) throw new RetiredCiphertextError("This ciphertext is retired by the storage operator. Keep your saved report and contact the operator; repeating the upload will not resolve this policy refusal.");
      if (!response.ok) throw new Error(`Cipherstore PUT failed with HTTP ${response.status}`);
    });
  }

  async get(address: string): Promise<string> {
    if (!/^sha256:[a-f0-9]{64}$/.test(address)) throw new Error("Invalid ciphertext content address");
    return this.request("GET", async (signal) => {
      const response = await fetch(`${this.baseUrl}/v1/blobs/${address}`, { signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`Cipherstore GET failed with HTTP ${response.status}`);
      }
      // Count decoded transport bytes, regardless of Content-Length or compression.
      const serialized = await readCiphertext(response);
      if (!(await validateContentDigest(serialized, address))) {
        throw new Error("Cipherstore returned content with an invalid digest");
      }
      return serialized;
    });
  }
}

/** Each configured destination is an explicit ciphertext disclosure choice. */
export class ReplicatedCipherstoreClient {
  private readonly clients: readonly CipherstoreClient[];
  constructor(urls: readonly string[], timeoutMs = CIPHERSTORE_REQUEST_TIMEOUT_MS) {
    const endpoints = validateCipherstoreUrls(urls);
    if (endpoints.length < 2) throw new Error("Replication requires at least two ciphertext endpoints");
    this.clients = endpoints.map((endpoint) => new CipherstoreClient(endpoint, timeoutMs));
  }

  async put(address: string, serializedEnvelope: string): Promise<void> {
    const results = await Promise.allSettled(this.clients.map((client) => client.put(address, serializedEnvelope)));
    const acknowledged = results.filter((result) => result.status === "fulfilled").length;
    if (results.some((result) => result.status === "rejected" && result.reason instanceof RetiredCiphertextError)) throw new RetiredCiphertextError(`Ciphertext replication incomplete: ${acknowledged} of ${results.length} stores acknowledged this upload. At least one store reports this ciphertext as retired. Other stores may retain copies. Keep the saved report and contact the operators before another upload.`);
    if (acknowledged !== results.length) throw new Error(`Ciphertext replication incomplete: ${acknowledged} of ${results.length} stores acknowledged this upload. A failed response may still have stored the bytes. Keep the saved report and retry its identical ciphertext when all stores are available.`);
  }

  async get(address: string): Promise<string> {
    if (!/^sha256:[a-f0-9]{64}$/.test(address)) throw new Error("Invalid ciphertext content address");
    for (const client of this.clients) {
      try { return await client.get(address); } catch { /* A failed integrity/read check never supplies plaintext to the caller. */ }
    }
    throw new Error(`No configured ciphertext store returned bytes matching the requested digest (${this.clients.length} stores checked). Keep your report key and local encrypted backup.`);
  }
}

export const createCipherstoreClient = (urls: readonly string[], timeoutMs = CIPHERSTORE_REQUEST_TIMEOUT_MS): CipherstoreClient | ReplicatedCipherstoreClient => {
  const endpoints = validateCipherstoreUrls(urls);
  return endpoints.length === 1 ? new CipherstoreClient(endpoints[0]!, timeoutMs) : new ReplicatedCipherstoreClient(endpoints, timeoutMs);
};

/** Probe every destination explicitly, without fallback hiding a missing copy. */
export async function verifyCipherstoreCopies(urls: readonly string[], address: string, timeoutMs = CIPHERSTORE_REQUEST_TIMEOUT_MS) {
  if (!/^sha256:[a-f0-9]{64}$/.test(address)) throw new Error("Invalid ciphertext content address");
  const endpoints = validateCipherstoreUrls(urls);
  const clients = endpoints.map((endpoint) => new CipherstoreClient(endpoint, timeoutMs));
  const copies = await Promise.all(clients.map(async (client, index) => {
    try {
      await client.get(address);
      return { endpoint: endpoints[index]!, verified: true, detail: "Returned ciphertext matching its SHA-256 address" };
    } catch (error) {
      return { endpoint: endpoints[index]!, verified: false, detail: error instanceof Error ? error.message : "Ciphertext read failed" };
    }
  }));
  return { address, checkedAt: new Date().toISOString(), copies };
}
