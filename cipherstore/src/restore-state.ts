// SPDX-License-Identifier: Apache-2.0
import { lstat } from "node:fs/promises";
import path from "node:path";

export const incompleteRestoreName = ".vulnseal-restore-incomplete";

/** Any marker entry, including a symlink or directory, requires operator inspection. */
export const assertRestoreComplete = async (directory: string): Promise<void> => {
  try { await lstat(path.join(directory, incompleteRestoreName)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Cipherstore restore is incomplete; restore the verified backup into a new directory before starting service or creating a backup");
};
