// SPDX-License-Identifier: Apache-2.0
import { validateContentDigest } from "@vulnseal/shared";

const MEDIA_TYPE = "application/vnd.vulnseal.ciphertext+json";

export class CipherstoreClient {
  constructor(private readonly baseUrl: string) {}

  async put(address: string, serializedEnvelope: string): Promise<void> {
    if (!(await validateContentDigest(serializedEnvelope, address))) {
      throw new Error("Ciphertext does not match its content address");
    }
    const response = await fetch(`${this.baseUrl}/v1/blobs/${address}`, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: serializedEnvelope,
    });
    if (!response.ok) throw new Error(`Cipherstore PUT failed with HTTP ${response.status}`);
  }

  async get(address: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/blobs/${address}`);
    if (!response.ok) throw new Error(`Cipherstore GET failed with HTTP ${response.status}`);
    const serialized = await response.text();
    if (!(await validateContentDigest(serialized, address))) {
      throw new Error("Cipherstore returned content with an invalid digest");
    }
    return serialized;
  }
}
