// SPDX-License-Identifier: Apache-2.0
import type { PublicLookupWorkerInput } from "./public-verification-worker.js";
self.onmessage = async (event: MessageEvent<PublicLookupWorkerInput>) => {
  try {
    await import("./globals.js");
    await import("@midnight-ntwrk/ledger-v8");
    const { verifyPublicContract } = await import("@vulnseal/api/public-verification");
    self.postMessage({ result: await verifyPublicContract(event.data.address, event.data.endpoints) });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "Public lookup failed" }); }
};
