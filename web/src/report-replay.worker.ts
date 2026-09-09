// SPDX-License-Identifier: Apache-2.0
import type { ReportCheckInput } from "./report-reconciliation.js";
self.onmessage = async (event: MessageEvent<ReportCheckInput>) => {
  try {
    await import("./globals.js");
    // The protocol barrel alone can leave the ledger WASM initializer tree-shaken.
    await import("@midnight-ntwrk/ledger-v8");
    const { reconcileReport } = await import("./report-reconciliation.js");
    self.postMessage({ result: await reconcileReport(event.data) });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "Report replay failed" }); }
};
