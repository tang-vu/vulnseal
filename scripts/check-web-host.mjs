// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkWebRelease } from "./check-web-release.mjs";

export function hostingOrigin(value) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || !/^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("Supply an HTTPS or loopback HTTP base URL, with a trailing slash for a subdirectory and no credentials, query or fragment");
  }
  return url.href.replace(/\/$/, "");
}

/** Read-only comparison against a trusted local inventory, never an inventory from the host. */
export async function checkWebHost({ origin, manifest, timeoutMs = 30_000 }) {
  origin = hostingOrigin(origin);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("Invalid per-file timeout");
  if (!Array.isArray(manifest?.files) || !manifest.files.length || manifest.files.length > 5000) throw new Error("Invalid local inventory");
  const seen = new Set();
  // Validate the entire inventory before issuing any requests, including caller-supplied fixtures.
  for (const entry of manifest.files) {
    if (!/^(?:index\.html|(?:assets|keys|zkir)\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.test(entry.path) || seen.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid local inventory entry");
    seen.add(entry.path);
  }
  let totalBytes = 0;
  const index = manifest.files.find((entry) => entry.path === "index.html");
  const targets = index ? [...manifest.files, { ...index, path: "" }] : manifest.files;
  for (const entry of targets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${origin}/${entry.path}`, {
        redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
        headers: { "Cache-Control": "no-cache", "Accept-Encoding": "identity" },
      });
      if (response.status !== 200 || !response.body) throw new Error(`Expected HTTP 200, received ${response.status}`);
      const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      const expected = entry.path.endsWith(".js") ? ["text/javascript", "application/javascript"] : entry.path.endsWith(".css") ? ["text/css"] : entry.path.endsWith(".wasm") ? ["application/wasm"] : ["", "index.html"].includes(entry.path) ? ["text/html"] : null;
      if (expected && !expected.includes(mime)) throw new Error(`Unexpected content type: ${mime ?? "missing"}`);
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > entry.bytes) throw new Error("Response exceeds expected byte length");
        hash.update(chunk);
      }
      if (bytes !== entry.bytes || hash.digest("hex") !== entry.sha256) throw new Error("Response differs from trusted local artifact");
      totalBytes += bytes;
    } catch (error) {
      throw new Error(`Hosted asset check failed for ${entry.path || "/"}: ${controller.signal.aborted ? "request deadline exceeded" : error.message}`, { cause: error });
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return { origin, files: manifest.files.length, requests: targets.length, bytes: totalBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: check-web-host.mjs <base-url>");
    const origin = hostingOrigin(process.argv[2]);
    const manifest = await checkWebRelease();
    process.stdout.write(JSON.stringify(await checkWebHost({ origin, manifest })) + "\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
