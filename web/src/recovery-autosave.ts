// SPDX-License-Identifier: Apache-2.0
import { encryptRecovery, type RecoverySnapshot } from "./recovery.js";
import { writeStoredRecovery, type StoredCopy } from "./recovery-storage.js";

/** Serialized saves; a conflict or storage failure stops this writer without discarding the live session. */
export class RecoveryAutosave {
  #row: StoredCopy;
  #password: string;
  #tail: Promise<unknown> = Promise.resolve();
  #stopped = false;
  #write: typeof writeStoredRecovery;
  constructor(row: StoredCopy, password: string, write: typeof writeStoredRecovery = writeStoredRecovery) { this.#row = { ...row }; this.#password = password; this.#write = write; }
  stop() { this.#stopped = true; this.#password = ""; }
  save(vault: RecoverySnapshot): Promise<StoredCopy> {
    const snapshot = structuredClone(vault);
    const work = this.#tail.then(async () => {
      if (this.#stopped) throw new Error("Browser autosave is stopped");
      const encrypted = await encryptRecovery(snapshot, this.#password);
      if (this.#stopped) throw new Error("Browser autosave is stopped");
      this.#row = await this.#write(this.#row.id, this.#row.label, encrypted, this.#row.revision);
      return this.#row;
    });
    this.#tail = work.catch(() => { this.stop(); });
    return work;
  }
}
