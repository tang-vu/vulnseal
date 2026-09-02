// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadPreprodCheckpoint,
  savePreprodCheckpoint,
  type WalletCheckpoint,
} from "../preprod-checkpoint.js";

const temporaryDirectories: string[] = [];

const temporaryCheckpointPath = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "vulnseal-checkpoint-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "wallet.json.enc");
};

const fixture: WalletCheckpoint = {
  network: "preprod",
  address: "mn_addr_preprod_test",
  shielded: "shielded-private-wallet-state",
  unshielded: "unshielded-private-wallet-state",
  dust: "dust-private-wallet-state",
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("encrypted Preprod wallet checkpoints", () => {
  it("round-trips wallet state without storing plaintext", async () => {
    const checkpointPath = await temporaryCheckpointPath();
    await savePreprodCheckpoint("correct horse battery staple", fixture, checkpointPath);

    const stored = await readFile(checkpointPath, "utf8");
    expect(stored).not.toContain(fixture.address);
    expect(stored).not.toContain(fixture.shielded);
    await expect(loadPreprodCheckpoint(
      "correct horse battery staple",
      fixture.address,
      checkpointPath,
    )).resolves.toEqual(fixture);
  });

  it("rejects the wrong password without exposing checkpoint details", async () => {
    const checkpointPath = await temporaryCheckpointPath();
    await savePreprodCheckpoint("correct password", fixture, checkpointPath);

    await expect(loadPreprodCheckpoint("wrong password", fixture.address, checkpointPath))
      .rejects.toThrow("Unable to authenticate or restore the encrypted Preprod wallet checkpoint");
  });

  it("rejects a checkpoint bound to another wallet address", async () => {
    const checkpointPath = await temporaryCheckpointPath();
    await savePreprodCheckpoint("checkpoint password", fixture, checkpointPath);

    await expect(loadPreprodCheckpoint("checkpoint password", "mn_addr_preprod_other", checkpointPath))
      .rejects.toThrow("Unable to authenticate or restore the encrypted Preprod wallet checkpoint");
  });

  it("rejects authenticated-ciphertext tampering", async () => {
    const checkpointPath = await temporaryCheckpointPath();
    await savePreprodCheckpoint("checkpoint password", fixture, checkpointPath);
    const envelope = JSON.parse(await readFile(checkpointPath, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(checkpointPath, JSON.stringify(envelope), "utf8");

    await expect(loadPreprodCheckpoint("checkpoint password", fixture.address, checkpointPath))
      .rejects.toThrow("Unable to authenticate or restore the encrypted Preprod wallet checkpoint");
  });
});
