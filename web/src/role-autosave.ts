// SPDX-License-Identifier: Apache-2.0
import { encryptRoleVault, type RoleVault } from "./role-recovery.js";
import { writeStoredRole, type StoredRole } from "./role-storage.js";

/** Serialized saves; a conflict or storage failure stops this writer without discarding the live vault. */
export class RoleAutosave {
  #row: StoredRole;
  #password: string;
  #tail: Promise<unknown> = Promise.resolve();
  #stopped = false;
  #write: typeof writeStoredRole;
  constructor(row: StoredRole, password: string, write: typeof writeStoredRole = writeStoredRole) { this.#row = row; this.#password = password; this.#write = write; }
  stop() { this.#stopped = true; this.#password = ""; }
  save(vault: RoleVault): Promise<StoredRole> {
    const snapshot = structuredClone(vault);
    const work = this.#tail.then(async () => {
      if (this.#stopped) throw new Error("Browser autosave is stopped");
      const encrypted = await encryptRoleVault(snapshot, this.#password);
      if (this.#stopped) throw new Error("Browser autosave is stopped");
      this.#row = await this.#write(this.#row.id, this.#row.label, encrypted, this.#row.revision);
      return this.#row;
    });
    this.#tail = work.catch(() => { this.stop(); });
    return work;
  }
}
