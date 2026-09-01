// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { CipherstoreClient } from "./cipherstore-client.js";

describe("CipherstoreClient", () => {
  afterEach(() => vi.unstubAllGlobals());

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
