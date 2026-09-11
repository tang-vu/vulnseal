// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { assertBytes32 } from "./encoding.js";

it.each([
  ["ArrayBuffer", new ArrayBuffer(32)],
  ["DataView", new DataView(new ArrayBuffer(32))],
  ["Uint16Array", new Uint16Array(16)],
  ["Int8Array", new Int8Array(32)],
  ["clamped bytes", new Uint8ClampedArray(32)],
  ["spoofed byte length", { byteLength: 32, length: 32 }],
  ["null", null],
  ["undefined", undefined],
  ["short bytes", new Uint8Array(31)],
  ["long bytes", new Uint8Array(33)],
])("rejects %s as a bytes32 input without coercion", (_label, value) => {
  expect(() => assertBytes32(value as Uint8Array, "actorSecret")).toThrow("actorSecret must be exactly 32 bytes");
});

it.each(["Uint8Array", "Buffer"])("copies exactly a 32-byte %s view without retaining adjacent bytes or caller storage", kind => {
  const owner = kind === "Buffer" ? Buffer.alloc(64, 9) : new Uint8Array(64).fill(9);
  const input = owner.subarray(16, 48); input.fill(7);
  const result = assertBytes32(input, "digest");
  expect(result).toEqual(new Uint8Array(32).fill(7));
  expect(result.buffer).not.toBe(input.buffer);
  owner.fill(0);
  expect(result).toEqual(new Uint8Array(32).fill(7));
});
