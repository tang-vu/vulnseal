// SPDX-License-Identifier: Apache-2.0
import type { DeploymentCheckInput } from "./deployment-verification.js";
self.onmessage = async (event: MessageEvent<DeploymentCheckInput>) => {
  try {
    await import("./globals.js");
    // Keep the ledger WASM initializer, as in the report replay worker.
    await import("@midnight-ntwrk/ledger-v8");
    const { compareDeploymentPolicy } = await import("./deployment-verification.js");
    const { transactionId, saved, endpoints } = event.data;
    self.postMessage({ result: await compareDeploymentPolicy(transactionId, saved, endpoints) });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "Deployment policy comparison failed" }); }
};
