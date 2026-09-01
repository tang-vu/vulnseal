// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCipherstoreServer } from "./server.js";

export * from "./server.js";

const isEntrypoint = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const host = process.env.CIPHERSTORE_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.CIPHERSTORE_PORT ?? "8787", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("CIPHERSTORE_PORT must be a valid TCP port");
  }
  const dataDirectory = path.resolve(
    process.env.CIPHERSTORE_DATA_DIR ?? path.join(process.cwd(), "data"),
  );
  const server = createCipherstoreServer({
    dataDirectory,
    allowedOrigin: process.env.CIPHERSTORE_ALLOWED_ORIGIN ?? "http://127.0.0.1:5173",
  });
  server.listen(port, host, () => {
    process.stdout.write(`VulnSeal cipherstore listening on http://${host}:${port}\n`);
  });
}
