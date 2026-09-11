// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { removeOwnedCipherstoreTestResource } from "./cipherstore-test-cleanup.mjs";

const owner = "12345678-abcd-1234-abcd-123456789abc";
for (const kind of ["container", "volume"]) {
  const target = `vulnseal-container-test-${owner}${kind === "volume" ? "-data" : ""}`;
  test(`${kind}: successful absence does not attempt inspection or removal`, async () => {
    const calls = [];
    await removeOwnedCipherstoreTestResource(async (...args) => { calls.push(args); return ""; }, kind, target, owner);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], "ls");
    assert.ok(calls[0].includes(`name=^${target}$`));
    if (kind === "container") assert.ok(calls[0].includes("--all"));
  });
  for (const failedStage of ["ls", "inspect", "rm"]) test(`${kind}: ${failedStage} failure cannot complete cleanup`, async () => {
    const calls = [], failure = new Error("Synthetic Docker connection timeout");
    await assert.rejects(removeOwnedCipherstoreTestResource(async (...args) => {
      calls.push(args[1]);
      if (args[1] === failedStage) throw failure;
      return args[1] === "ls" ? target : owner;
    }, kind, target, owner), (error) => error === failure);
    assert.equal(calls.at(-1), failedStage);
  });
  test(`${kind}: a different owner is never removed`, async () => {
    const calls = [];
    await assert.rejects(removeOwnedCipherstoreTestResource(async (...args) => {
      calls.push(args[1]); return args[1] === "ls" ? target : "another-drill";
    }, kind, target, owner), /not owned/);
    assert.deepEqual(calls, ["ls", "inspect"]);
  });
  test(`${kind}: confirmed ownership permits only the exact resource removal`, async () => {
    const calls = [];
    await removeOwnedCipherstoreTestResource(async (...args) => {
      calls.push(args); return args[1] === "ls" ? target : args[1] === "inspect" ? owner : "";
    }, kind, target, owner);
    assert.deepEqual(calls.at(-1), [kind, "rm", ...(kind === "container" ? ["--force"] : []), target]);
  });
  test(`${kind}: unexpected inventory cannot cause deletion`, async () => {
    const calls = [];
    await assert.rejects(removeOwnedCipherstoreTestResource(async (...args) => {
      calls.push(args[1]); return `${target}\nother-resource`;
    }, kind, target, owner), /unexpected inventory/);
    assert.deepEqual(calls, ["ls"]);
  });
}
