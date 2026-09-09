// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { CipherstoreClient } from "./cipherstore-client.js";
import { createHash } from "node:crypto";

describe("CipherstoreClient", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([[507, "storage is full"], [503, "temporarily busy or unavailable"]] as const)("explains HTTP %i without automatically retrying", async (status, message) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status })); vi.stubGlobal("fetch", fetchMock);
    const body = "{}", digest = createHash("sha256").update(body).digest("hex");
    await expect(new CipherstoreClient("http://127.0.0.1:8787").put(`sha256:${digest}`, body)).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refuses to upload bytes that do not match the address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new CipherstoreClient("http://127.0.0.1:8787");
    await expect(client.put(`sha256:${"0".repeat(64)}`, "{}")).rejects.toThrow(
      "does not match",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
