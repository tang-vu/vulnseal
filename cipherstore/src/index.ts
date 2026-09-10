// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCipherstoreServer } from "./server.js";
import { mkdir } from "node:fs/promises";
import { acquireDirectoryLease } from "./directory-lease.js";

export * from "./server.js";
export * from "./directory-lease.js";
export * from "./storage.js";
export * from "./filesystem-storage.js";

const isEntrypoint = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const integer = (name: string, fallback: number): number => {
    const raw = process.env[name] ?? String(fallback);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`${name} must be a nonnegative safe integer`);
    return Number(raw);
  };
  const host = process.env.CIPHERSTORE_HOST ?? "127.0.0.1";
  const metricsEnabled = integer("CIPHERSTORE_METRICS_ENABLED", 0);
  if (metricsEnabled > 1) throw new Error("CIPHERSTORE_METRICS_ENABLED must be 0 or 1");
  const port = integer("CIPHERSTORE_PORT", 8787);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("CIPHERSTORE_PORT must be a valid TCP port");
  }
  const dataDirectory = path.resolve(
    process.env.CIPHERSTORE_DATA_DIR ?? path.join(process.cwd(), "data"),
  );
  const server = createCipherstoreServer({
    dataDirectory,
    metricsEnabled: metricsEnabled === 1,
    allowedOrigin: process.env.CIPHERSTORE_ALLOWED_ORIGIN ?? "http://127.0.0.1:5173",
    maxStoredBytes: integer("CIPHERSTORE_MAX_STORED_BYTES", 1024 * 1024 * 1024),
    maxStoredBlobs: integer("CIPHERSTORE_MAX_STORED_BLOBS", 10_000),
    maxConcurrentUploads: integer("CIPHERSTORE_MAX_CONCURRENT_UPLOADS", 16),
    requestTimeoutMs: integer("CIPHERSTORE_REQUEST_TIMEOUT_MS", 30_000),
    maxConnections: integer("CIPHERSTORE_MAX_CONNECTIONS", 64),
  });
  await mkdir(dataDirectory, { recursive: true });
  const release = await acquireDirectoryLease(dataDirectory);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject); server.listen(port, host, () => { server.off("error", reject); resolve(); });
    });
  } catch (error) { await release(); throw error; }
  process.stdout.write(`VulnSeal cipherstore listening on http://${host}:${port}\n`);
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    void (async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await server.drain(); await release();
    })().catch((error) => { process.stderr.write(`Cipherstore shutdown failed: ${String(error)}\n`); process.exitCode = 1; });
  };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
