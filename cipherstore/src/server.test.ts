// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";

const envelope = JSON.stringify({
  aad: "vulnseal:ciphertext:v1:program",
  algorithm: "AES-256-GCM",
  ciphertext: "c2VhbGVkLWRhdGE",
  iv: "AAAAAAAAAAAAAAAA",
  keyDerivation: "none-random-256-bit-key",
  version: 1,
});

describe("ciphertext-only content store", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  });

  it("stores and retrieves an immutable digest-addressed ciphertext", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-cipherstore-"));
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No TCP address");
    const digest = createHash("sha256").update(envelope).digest("hex");
    const url = `http://127.0.0.1:${address.port}/v1/blobs/sha256:${digest}`;
    const stored = await fetch(url, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: envelope,
    });
    expect(stored.status).toBe(201);
    expect(await stored.json()).toEqual({ address: `sha256:${digest}`, stored: true });
    const fetched = await fetch(url);
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe(envelope);
    expect(await readFile(path.join(dataDirectory, `${digest}.ciphertext.json`), "utf8")).toBe(envelope);
  });

  it("rejects plaintext-shaped payloads and digest mismatches", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-cipherstore-"));
    server = createCipherstoreServer({ dataDirectory });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No TCP address");
    const base = `http://127.0.0.1:${address.port}/v1/blobs/sha256:${"0".repeat(64)}`;
    const plaintext = await fetch(base, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: JSON.stringify({ title: "plaintext vulnerability" }),
    });
    expect(plaintext.status).toBe(400);
    const mismatch = await fetch(base, {
      method: "PUT",
      headers: { "content-type": MEDIA_TYPE },
      body: envelope,
    });
    expect(mismatch.status).toBe(422);
  });
});
