// SPDX-License-Identifier: Apache-2.0
import type { PublicVerification } from "@vulnseal/api/public-verification";
export type PublicLookupWorkerInput = { readonly address: string; readonly endpoints: { readonly indexerUrl: string; readonly rpcUrl: string } };
export const PUBLIC_LOOKUP_WORKER_TIMEOUT_MS = 30_000;

/** A fresh worker bounds initialization, network and synchronous state decoding together. */
export function verifyPublicContractInWorker(address: string, endpoints: PublicLookupWorkerInput["endpoints"], signal?: AbortSignal): Promise<PublicVerification> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Public lookup canceled", "AbortError")); return; }
    let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, active = true;
    const finish = (error?: Error, result?: PublicVerification) => {
      if (!active) return;
      active = false; clearTimeout(timer); signal?.removeEventListener("abort", abort); worker?.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new DOMException("Public lookup canceled", "AbortError"));
    try {
      worker = new Worker(new URL("./public-lookup.worker.ts", import.meta.url), { type: "module" });
      worker.onerror = event => { event.preventDefault(); finish(new Error("The public lookup worker could not load or run.")); };
      worker.onmessageerror = () => finish(new Error("The public lookup worker returned an unreadable response."));
      worker.onmessage = (event: MessageEvent<{ result?: PublicVerification; error?: string }>) => {
        const value = event.data;
        if (!value || value.error || !value.result) finish(new Error(value?.error ?? "Public lookup returned no result"));
        else finish(undefined, value.result);
      };
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => finish(new Error("Public lookup timed out. No verification result was accepted.")), PUBLIC_LOOKUP_WORKER_TIMEOUT_MS);
      worker.postMessage({ address, endpoints } satisfies PublicLookupWorkerInput);
    } catch (cause) { finish(cause instanceof Error ? cause : new Error("Public lookup could not start")); }
  });
}
