// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { readBoundedJson } from "./bounded-json.js";

it("counts decoded bytes across chunks and preserves split UTF-8 characters", async () => {
  const bytes = new TextEncoder().encode('{"value":"✓"}');
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
  expect(await readBoundedJson(new Response(stream), bytes.length)).toEqual({ value: "✓" });
});

it("cancels oversized streaming responses regardless of the declared content length", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"a":'));
    controller.enqueue(new TextEncoder().encode('12345}'));
  }, cancel });
  await expect(readBoundedJson(new Response(stream, { headers: { "content-length": "1" } }), 10)).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalledOnce();
});

it("aborts an otherwise stalled body and releases its reader", async () => {
  const cancel = vi.fn(), controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  const pending = readBoundedJson(new Response(stream), 100, controller.signal);
  controller.abort(new Error("Cancelled by caller"));
  await expect(pending).rejects.toThrow("Cancelled by caller");
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});

it("rejects malformed encoding, invalid JSON, absent bodies and pre-aborted reads", async () => {
  await expect(readBoundedJson(new Response(new Uint8Array([0xff])), 10)).rejects.toThrow();
  await expect(readBoundedJson(new Response('{"incomplete":'), 100)).rejects.toThrow();
  await expect(readBoundedJson(new Response(null), 100)).rejects.toThrow("no response body");
  const controller = new AbortController(); controller.abort(new Error("Already cancelled"));
  const cancel = vi.fn();
  await expect(readBoundedJson(new Response(new ReadableStream({ cancel })), 100, controller.signal)).rejects.toThrow("Already cancelled");
  expect(cancel).toHaveBeenCalledOnce();
});
