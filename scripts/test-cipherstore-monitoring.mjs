// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const project = `vulnseal-monitor-${randomUUID()}`;
const envFile = `.compact/${project}.env`;
const distro = process.env.VULNSEAL_DOCKER_WSL_DISTRO;
const docker = (...args) => execFileSync(distro ? "wsl.exe" : process.platform === "win32" ? "docker.exe" : "docker", [...(distro ? ["--distribution", distro, "--exec", "docker"] : []), ...args], { encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const compose = (...args) => docker("compose", "--project-name", project, "--env-file", envFile, "-f", "infra/cipherstore.yml", "-f", "infra/cipherstore-monitoring.yml", ...args);
const request = (url) => fetch(url, { signal: AbortSignal.timeout(5000) });
const eventually = async (check) => {
  const deadline = Date.now() + 60_000;
  let last;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch (error) { last = error; }
    await delay(500);
  }
  throw new Error("Monitoring condition did not become true within 60 seconds", { cause: last });
};
await mkdir(".compact", { recursive: true });
await writeFile(envFile, "CIPHERSTORE_PUBLISHED_PORT=0\nPROMETHEUS_PUBLISHED_PORT=0\n", { flag: "wx" });
try {
  compose("config", "--quiet");
  compose("run", "--rm", "--no-deps", "--entrypoint", "/bin/promtool", "prometheus", "check", "config", "/etc/prometheus/prometheus.yml");
  compose("run", "--rm", "--no-deps", "--env", "TMPDIR=/prometheus", "--entrypoint", "/bin/promtool", "prometheus", "test", "rules", "/etc/prometheus/rules.test.yml");
  compose("up", "--no-build", "--detach");
  const origin = `http://${compose("port", "prometheus", "9090")}`;
  const store = `http://${compose("port", "cipherstore", "8787")}`;
  const query = async (expression) => {
    const response = await request(`${origin}/api/v1/query?query=${encodeURIComponent(expression)}`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "success");
    return result.data.result;
  };
  await eventually(async () => (await query('up{job="cipherstore"}'))[0]?.value[1] === "1");
  assert.equal((await request(`${store}/monitoring-test-missing`)).status, 404);
  await eventually(async () => Number((await query('vulnseal_http_responses_total{job="cipherstore",status_class="4xx"}'))[0]?.value[1]) >= 1);
  const rules = await (await request(`${origin}/api/v1/rules`)).json();
  assert.deepEqual(rules.data.groups.flatMap((group) => group.rules.map((rule) => rule.name)).sort(), ["CipherstoreMetricsUnavailable", "CipherstoreServerErrors"]);
  const inspection = JSON.parse(docker("inspect", compose("ps", "--quiet", "prometheus")))[0];
  assert.equal(inspection.Config.User, "65534:65534");
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  compose("stop", "--timeout", "20", "cipherstore");
  await eventually(async () => (await query('up{job="cipherstore"}'))[0]?.value[1] === "0");
  compose("start", "cipherstore");
  await eventually(async () => (await query('up{job="cipherstore"}'))[0]?.value[1] === "1");
  process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), prometheusImage: inspection.Image, cipherstoreImage: docker("image", "inspect", "vulnseal-cipherstore:local", "--format", "{{.Id}}"), ruleTests: true, realScrape: true, errorCounterScraped: true, outageDetected: true, recoveryDetected: true, nonRoot: true, readOnlyRoot: true, externalNotifications: false }) + "\n");
} finally {
  // Only this invocation's random Compose project and volumes are disposable.
  for (const id of compose("ps", "--all", "--quiet").split(/\s+/).filter(Boolean)) {
    assert.equal(docker("inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', id), project);
  }
  compose("down", "--volumes", "--remove-orphans", "--timeout", "20");
  await unlink(envFile);
}
