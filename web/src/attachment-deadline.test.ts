// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ digest: vi.fn() }));
vi.mock("@vulnseal/shared", async original => ({ ...await original<typeof import("@vulnseal/shared")>(), sha256: mocks.digest }));
import { hashAttachment } from "./attachments.js";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.digest.mockReset(); });

for (const phase of ["read", "digest"]) it.each(["timer", "wall", "monotonic"])(`expires ${phase} at %s without accepting a late result`, async clock => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let wall = 1000, monotonic = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  let finish!: (value: ArrayBuffer & Uint8Array) => void;
  const delayed = new Promise<ArrayBuffer & Uint8Array>(resolve => { finish = resolve; });
  const read = vi.fn().mockResolvedValue(new ArrayBuffer(3));
  if (phase === "read") read.mockReturnValueOnce(delayed);
  mocks.digest.mockResolvedValue(new Uint8Array(32));
  if (phase === "digest") mocks.digest.mockReturnValueOnce(delayed);
  const file = { name: "proof.bin", type: "", size: 3, arrayBuffer: read } as unknown as File;
  const pending = expect(hashAttachment(file)).rejects.toThrow("Attachment hashing timed out");
  await Promise.resolve(); await Promise.resolve();
  if (clock === "timer") await vi.advanceTimersByTimeAsync(180_000);
  else if (clock === "wall") wall += 180_000;
  else { monotonic += 180_000; wall -= 60_000; }
  finish((phase === "read" ? new ArrayBuffer(3) : new Uint8Array(32)) as ArrayBuffer & Uint8Array);
  await pending;
  if (phase === "read") expect(mocks.digest).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await expect(hashAttachment(file)).resolves.toMatchObject({ filename: "proof.bin", size: 3 });
});
