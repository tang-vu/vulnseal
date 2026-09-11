// SPDX-License-Identifier: Apache-2.0
import { createConnection, type Socket } from "node:net";
import { once } from "node:events";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createCipherstoreServer, MEDIA_TYPE } from "./server.js";
import { FilesystemCiphertextStorage } from "./filesystem-storage.js";

let server: ReturnType<typeof createCipherstoreServer> | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  await server?.drain(); server = undefined;
});
async function start(options: { requestTimeoutMs: number; maxConnections?: number }) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-transport-"));
  server = createCipherstoreServer({ dataDirectory, maxConcurrentUploads: 1, ...options });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test port");
  return { port: address.port, dataDirectory, base: `http://127.0.0.1:${address.port}` };
}
async function socketAt(port: number) {
  const socket = createConnection({ port, host: "127.0.0.1" }); sockets.push(socket);
  socket.on("error", () => {});
  socket.resume();
  await once(socket, "connect"); return socket;
}
for (const phase of ["headers", "body"] as const) it(`expires continuously trickled ${phase} and frees the upload slot`, async () => {
  const { port, base, dataDirectory } = await start({ requestTimeoutMs: 1000 });
  const socket = await socketAt(port);
  let response = ""; socket.on("data", (chunk) => { response += chunk.toString(); });
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  socket.write(phase === "headers" ? "PUT / HTTP/1.1\r\nX-Held: " : `PUT /v1/blobs/sha256:${"ab".repeat(32)} HTTP/1.1\r\nHost: localhost\r\nContent-Type: ${MEDIA_TYPE}\r\nContent-Length: 10000\r\n\r\n`);
  let sent = 0;
  const began = Date.now();
  const drip = setInterval(() => { if (!socket.destroyed) { socket.write("x"); sent++; } }, 20);
  try { await closed; } finally { clearInterval(drip); }
  expect(sent).toBeGreaterThan(1);
  expect(Date.now() - began).toBeLessThan(3500);
  expect(response === "" || response.includes("408 Request Timeout")).toBe(true);
  await server!.drain();
  expect(await readdir(dataDirectory)).toEqual([]);
  const body = JSON.stringify({ version: 1, algorithm: "AES-256-GCM", keyDerivation: "none-random-256-bit-key", aad: "vulnseal:ciphertext:v1:program", iv: "AAAAAAAAAAAAAAAA", ciphertext: Buffer.alloc(32, 1).toString("base64url") });
  const digest = createHash("sha256").update(body).digest("hex");
  expect((await fetch(`${base}/v1/blobs/sha256:${digest}`, { method: "PUT", headers: { "content-type": MEDIA_TYPE }, body })).status).toBe(201);
});

it("closes silent connections and refuses excess sockets before HTTP handlers run", async () => {
  const { port, base } = await start({ requestTimeoutMs: 1000, maxConnections: 1 });
  const first = await socketAt(port);
  const firstClosed = new Promise<void>((resolve) => first.once("close", () => resolve()));
  const dropped = once(server!, "drop");
  const second = await socketAt(port);
  const secondClosed = new Promise<void>((resolve) => second.once("close", () => resolve()));
  await dropped; await secondClosed; await firstClosed;
  expect((await fetch(`${base}/healthz`)).status).toBe(200);
});

it("counts socket inactivity while a fully received request awaits storage", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vulnseal-stalled-read-"));
  const storage = new FilesystemCiphertextStorage(dataDirectory, 1024, 1);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const read = vi.spyOn(storage, "read").mockImplementation(async () => {
    await held;
    throw Object.assign(new Error("Synthetic missing blob"), { code: "ENOENT" });
  });
  server = createCipherstoreServer({ dataDirectory, storage, requestTimeoutMs: 1000, metricsEnabled: true });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test port");
  const socket = await socketAt(address.port);
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  try {
    socket.write(`GET /v1/blobs/sha256:${"ab".repeat(32)} HTTP/1.1\r\nHost: localhost\r\n\r\n`);
    await closed;
    expect(read).toHaveBeenCalledOnce();
    const metrics = await (await fetch(`http://127.0.0.1:${address.port}/metrics`)).text();
    expect(metrics).toContain("vulnseal_http_socket_timeouts_total 1\n");
    expect(metrics).toContain("vulnseal_http_aborted_responses_total 1\n");
  } finally { release(); await server.drain(); }
});

it("rejects disabled, fractional and unbounded transport settings", () => {
  for (const requestTimeoutMs of [0, -1, 1.5, 300001, NaN]) expect(() => createCipherstoreServer({ dataDirectory: ".", requestTimeoutMs })).toThrow("request timeout");
  for (const maxConnections of [0, -1, 1.5, 10001, Infinity]) expect(() => createCipherstoreServer({ dataDirectory: ".", maxConnections })).toThrow("connection limit");
});
