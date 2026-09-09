// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { checkWebHost, hostingOrigin } from "./check-web-host.mjs";

test("host comparison checks streamed bytes, MIME, status, redirects and deadlines", async (t) => {
  let mode = "valid", requests = 0;
  const body = Buffer.from("export const valid = true;");
  const manifest = { files: [{ path: "assets/main.js", bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }] };
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.headers["cache-control"], "no-cache");
    assert.equal(request.headers.cookie, undefined);
    response.setHeader("Content-Type", mode === "mime" ? "text/html" : "text/javascript; charset=utf-8");
    if (mode === "redirect") { response.writeHead(302, { Location: "/assets/main.js" }); response.end(); }
    else if (mode === "status") { response.writeHead(404); response.end(body); }
    else if (mode === "hang") { response.write(body.subarray(0, 1)); }
    else if (mode === "oversize") response.end(Buffer.concat([body, body]));
    else if (mode === "corrupt") response.end(Buffer.alloc(body.length, 65));
    else if (mode === "short") response.end(body.subarray(0, 2));
    else response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await checkWebHost({ origin, manifest }), { origin, files: 1, requests: 1, bytes: body.length });
  for (const [variant, error] of [["mime", /content type/], ["redirect", /fetch failed/], ["status", /HTTP 200/], ["oversize", /exceeds/], ["corrupt", /differs/], ["short", /differs/], ["hang", /deadline/]]) {
    mode = variant;
    await assert.rejects(checkWebHost({ origin, manifest, timeoutMs: variant === "hang" ? 100 : 2000 }), error);
  }
  const before = requests;
  await assert.rejects(checkWebHost({ origin, manifest: { files: [...manifest.files, { ...manifest.files[0], path: "../private" }] } }), /inventory entry/);
  assert.equal(requests, before);
});

test("origin homepage must serve the same index document", async (t) => {
  const body = Buffer.from("<!doctype html><title>release</title>");
  const manifest = { files: [{ path: "index.html", bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }] };
  let wrongRoot = false;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(wrongRoot && request.url === "/" ? "wrong homepage" : body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await checkWebHost({ origin, manifest })).requests, 2);
  wrongRoot = true;
  await assert.rejects(checkWebHost({ origin, manifest }), /failed for \/: Response differs/);
});

test("host target must be an explicit origin with secure transport outside loopback", () => {
  assert.equal(hostingOrigin("https://example.test/"), "https://example.test");
  assert.equal(hostingOrigin("http://[::1]:4173"), "http://[::1]:4173");
  for (const origin of ["http://example.test", "https://a:b@example.test", "https://example.test/sub", "https://example.test/?token=secret", "https://example.test/#fragment", "file:///tmp"]) assert.throws(() => hostingOrigin(origin));
});
