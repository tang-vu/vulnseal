// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";

/** Absence requires a successful inventory query; inspection errors are not absence. */
export async function removeOwnedCipherstoreTestResource(docker, kind, target, owner) {
  assert.ok(kind === "container" || kind === "volume", "Unsupported resource kind");
  assert.match(target, /^vulnseal-container-test-[a-f0-9-]+(?:-data)?$/);
  const names = await docker(kind, "ls", ...(kind === "container" ? ["--all"] : []),
    "--filter", `name=^${target}$`, "--format", kind === "container" ? "{{.Names}}" : "{{.Name}}");
  if (!names.trim()) return;
  assert.equal(names.trim(), target, "Refusing cleanup after an unexpected inventory result");
  const found = await docker(kind, "inspect", "--format", kind === "volume"
    ? '{{index .Labels "vulnseal.container-test"}}'
    : '{{index .Config.Labels "vulnseal.container-test"}}', target);
  assert.equal(found, owner, "Refusing to remove a resource not owned by this drill");
  await docker(kind, "rm", ...(kind === "container" ? ["--force"] : []), target);
}
