// SPDX-License-Identifier: Apache-2.0
import { validateContentDigest } from "@vulnseal/shared";

const MEDIA_TYPE = "application/vnd.vulnseal.ciphertext+json";
export const CIPHERSTORE_REQUEST_TIMEOUT_MS = 20_000;

export class CipherstoreClient {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = CIPHERSTORE_REQUEST_TIMEOUT_MS) {
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
    if (!(await validateContentDigest(serializedEnvelope, address))) {
      throw new Error("Ciphertext does not match its content address");
    }
    await this.request("PUT", async (signal) => {
      const response = await fetch(`${this.baseUrl}/v1/blobs/${address}`, {
        method: "PUT",
        headers: { "content-type": MEDIA_TYPE },
        body: serializedEnvelope,
        signal,
      });
      if (response.status === 507) throw new Error("Ciphertext storage is full. Keep your draft and contact the storage operator before retrying.");
      if (response.status === 503) throw new Error("Ciphertext storage is temporarily busy or unavailable. Keep your draft and try again shortly.");
      if (!response.ok) throw new Error(`Cipherstore PUT failed with HTTP ${response.status}`);
    });
  }

  async get(address: string): Promise<string> {
    return this.request("GET", async (signal) => {
      const response = await fetch(`${this.baseUrl}/v1/blobs/${address}`, { signal });
      if (!response.ok) throw new Error(`Cipherstore GET failed with HTTP ${response.status}`);
      const serialized = await response.text();
      if (!(await validateContentDigest(serialized, address))) {
        throw new Error("Cipherstore returned content with an invalid digest");
      }
      return serialized;
    });
  }
}
