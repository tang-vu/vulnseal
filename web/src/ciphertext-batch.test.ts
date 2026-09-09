// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { uploadSavedBatch } from "./ciphertext-batch.js";

describe("saved ciphertext batch", () => {
  it("stops on the first uncertain upload and retries the original objects unchanged", async () => {
    const reports = Object.freeze([Object.freeze({ envelope: "first" }), Object.freeze({ envelope: "second" }), Object.freeze({ envelope: "third" })]);
    const upload = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Unknown storage outcome"));
    const progress = vi.fn();
    await expect(uploadSavedBatch(reports, { signal: new AbortController().signal, upload, progress })).rejects.toThrow("Unknown storage outcome");
    expect(upload.mock.calls.map(([report]) => report)).toEqual(reports.slice(0, 2));
    expect(progress.mock.calls).toEqual([[1]]);
    upload.mockResolvedValue(undefined);
    expect(await uploadSavedBatch(reports, { signal: new AbortController().signal, upload, progress })).toBe(3);
    expect(upload.mock.calls[2]![0]).toBe(reports[0]);
    expect(upload.mock.calls[3]![0]).toBe(reports[1]);
  });

  it("lets the current request settle but starts no later request after cancellation or unmount", async () => {
    const controller = new AbortController();
    let finish!: () => void;
    const upload = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const progress = vi.fn();
    const running = uploadSavedBatch([1, 2, 3], { signal: controller.signal, upload, progress });
    controller.abort();
    expect(progress).not.toHaveBeenCalled();
    finish();
    expect(await running).toBe(1);
    expect(upload).toHaveBeenCalledExactlyOnceWith(1);
    expect(progress).toHaveBeenCalledExactlyOnceWith(1);
    expect(await uploadSavedBatch([1], { signal: controller.signal, upload, progress })).toBe(0);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
