// SPDX-License-Identifier: Apache-2.0
import type { RecoverySnapshot } from "./recovery.js";
import type { RecoveryPersistenceLease } from "./RecoveryAutosavePanel.js";
import { continuationDeadline } from "./midnight/continuation-deadline.js";
export async function savePreparedReport(snapshot: RecoverySnapshot, lease: RecoveryPersistenceLease, assertCurrent: () => void): Promise<void> {
  try {
    await continuationDeadline(60_000, "Saving report preparation timed out. Keep this tab and inspect the latest browser copy; a late save may have committed. No upload was released by this save.", async check => {
      check(); assertCurrent();
      await lease.save(snapshot);
      check(); assertCurrent();
    });
    lease.release();
  } catch (cause) { lease.stop(); throw cause; }
}
