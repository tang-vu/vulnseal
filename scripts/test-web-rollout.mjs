// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { checkWebRelease } from "./check-web-release.mjs";
import { checkWebHost } from "./check-web-host.mjs";

if (process.argv.slice(2).some((arg) => arg !== "--write-evidence")) throw new Error("Usage: test-web-rollout.mjs [--write-evidence]");
const distro = process.env.VULNSEAL_DOCKER_WSL_DISTRO;
const docker = (...args) => execFileSync(distro ? "wsl.exe" : process.platform === "win32" ? "docker.exe" : "docker", [...(distro ? ["--distribution", distro, "--exec", "docker"] : []), ...args], { encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const imageA = docker("image", "inspect", "--format", "{{.Id}}", "vulnseal-web:rollout-a");
const imageB = docker("image", "inspect", "--format", "{{.Id}}", "vulnseal-web:local");
assert.match(imageA, /^sha256:[a-f0-9]{64}$/); assert.match(imageB, /^sha256:[a-f0-9]{64}$/);
assert.notEqual(imageA, imageB, "The drill requires two distinct images");
const manifestA = JSON.parse(await readFile("docs/evidence/web-rollout-a-manifest.json", "utf8"));
const manifestB = await checkWebRelease();
const changedScripts = manifestA.files.filter((file) => file.path.endsWith(".js") && !manifestB.files.some((other) => file.path === other.path && file.sha256 === other.sha256));
assert.ok(changedScripts.length > 0, "The drill requires distinct JavaScript artifacts");
for (const [a, b, active, message] of [["same", "same", "same", "must differ"], ["before", "after", "unknown", "must match"], ["bad/path", "after", "after", "only letters"]]) {
  assert.throws(() => docker("run", "--rm", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--env", `WEB_RELEASE_A=${a}`, "--env", `WEB_RELEASE_B=${b}`, "--env", `WEB_ACTIVE_RELEASE=${active}`, "vulnseal-web-rollout:local"), (error) => error.status === 1 && String(error.stderr).includes(message));
}
const project = `vulnseal-rollout-${randomUUID()}`;
const envFile = `infra/.web-rollout-test-${randomUUID()}.env`;
const args = ["compose", "--env-file", envFile, "-p", project, "-f", "infra/web-rollout.yml"];
let port = "0", origin, envCreated = false, stage = "startup";
const configure = async (active, first = false) => {
  await writeFile(envFile, `WEB_RELEASE_A_IMAGE=${imageA}\nWEB_RELEASE_B_IMAGE=${imageB}\nWEB_RELEASE_A=before\nWEB_RELEASE_B=after\nWEB_ACTIVE_RELEASE=${active}\nWEB_PUBLISHED_PORT=${port}\n`, { flag: first ? "wx" : "w" });
  envCreated = true;
};
const ingressId = () => docker(...args, "ps", "-q", "ingress");
async function redirect(active) {
  let response;
  const deadline = Date.now() + 15_000;
  for (;;) {
    try { response = await fetch(origin + "/", { redirect: "manual", headers: { Connection: "close" }, signal: AbortSignal.timeout(3000) }); break; }
    catch (error) {
      if (Date.now() >= deadline || !(error instanceof TypeError || error.name === "TimeoutError")) throw error;
      await delay(250);
    }
  }
  assert.equal(response.status, 302); assert.equal(response.headers.get("location"), `/releases/${active}/`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  await response.arrayBuffer();
}
async function activate(active) {
  stage = `activate ${active}`;
  await configure(active);
  docker(...args, "up", "--no-build", "--no-deps", "--wait", "--wait-timeout", "45", "ingress");
  assert.equal(`http://${docker("port", ingressId(), "8080/tcp")}`, origin, "Promotion must preserve the serving origin");
  await redirect(active);
}
try {
  await configure("before", true);
  docker(...args, "config", "--quiet");
  docker(...args, "up", "--no-build", "--wait", "--wait-timeout", "45");
  origin = `http://${docker("port", ingressId(), "8080/tcp")}`;
  port = new URL(origin).port;
  await redirect("before");
  stage = "verify both initial artifacts";
  const first = await checkWebHost({ origin: `${origin}/releases/before/`, manifest: manifestA });
  const second = await checkWebHost({ origin: `${origin}/releases/after/`, manifest: manifestB });
  const beforeIds = [docker(...args, "ps", "-q", "release-a"), docker(...args, "ps", "-q", "release-b")];
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext();
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const requests = []; context.on("request", (request) => requests.push(request.url()));
    const oldPage = await context.newPage();
    await oldPage.goto(origin + "/");
    await expect(oldPage.getByRole("link", { name: "Open role workspace" })).toBeVisible({ timeout: 30_000 });
    assert.equal(oldPage.url(), `${origin}/releases/before/`);
    await activate("after");
    stage = "open retained role chunk after promotion";
    assert.equal(oldPage.url(), `${origin}/releases/before/`);
    const popup = oldPage.waitForEvent("popup");
    await oldPage.getByRole("link", { name: "Open role workspace" }).click();
    const oldRole = await popup;
    await expect(oldRole.getByRole("heading", { name: "Inspect recovery journal without a wallet" })).toBeVisible({ timeout: 30_000 });
    assert.equal(oldRole.url(), `${origin}/releases/before/#roles`);
    const oldChunk = changedScripts.find((file) => /RoleWorkspace-/.test(file.path));
    assert.ok(oldChunk, "Expected a distinct old role-workspace chunk");
    assert.ok(requests.includes(`${origin}/releases/before/${oldChunk.path}`), "Old workspace must load its retained chunk");
    const newPage = await context.newPage();
    await newPage.goto(origin + "/");
    await expect(newPage.getByRole("link", { name: "Open role workspace" })).toBeVisible({ timeout: 30_000 });
    assert.equal(newPage.url(), `${origin}/releases/after/`);
    await activate("before");
    stage = "verify both retained artifacts after rollback";
    assert.equal(newPage.url(), `${origin}/releases/after/`);
    await checkWebHost({ origin: `${origin}/releases/before/`, manifest: manifestA });
    await checkWebHost({ origin: `${origin}/releases/after/`, manifest: manifestB });
    assert.deepEqual([docker(...args, "ps", "-q", "release-a"), docker(...args, "ps", "-q", "release-b")], beforeIds, "Promotion must not replace either retained backend");
    const result = { capturedAt: new Date().toISOString(), imageA, imageB, ingressImage: JSON.parse(docker("inspect", ingressId()))[0].Image, changedScripts: changedScripts.length, first, second, promotedAndRolledBack: true, oldTabLoadedRetainedRoleChunk: true, backendsPreserved: true, publicDeployment: false, walletUsed: false };
    if (process.argv.includes("--write-evidence")) await writeFile("docs/evidence/web-rollout-drill.json", JSON.stringify(result, null, 2) + "\n");
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally { await browser.close(); }
} catch (error) {
  throw new Error(`Rollout drill failed during ${stage}: ${error.message}`, { cause: error });
} finally {
  if (envCreated) {
    for (const id of docker(...args, "ps", "--all", "-q").split(/\s+/).filter(Boolean)) {
      const found = JSON.parse(docker("inspect", id))[0];
      assert.equal(found.Config.Labels["com.docker.compose.project"], project, "Refusing to remove an unowned project");
    }
    docker(...args, "down", "--volumes");
    await unlink(envFile);
  }
}
