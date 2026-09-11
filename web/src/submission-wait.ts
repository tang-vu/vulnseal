// SPDX-License-Identifier: Apache-2.0
export const SUBMISSION_PREPARATION_TIMEOUT_MS = 900_000;
export const SUBMISSION_CONFIRMATION_TIMEOUT_MS = 600_000;

export class SubmissionConfirmationTimeout extends Error {
  constructor(readonly transactionId: string) {
    super(`Stopped waiting for confirmation of ${transactionId}. Its outcome is unknown; the transaction may still finalize. Keep the encrypted backup and check this identifier in the journal. Transactions in this workspace session are disabled; reconcile before restoring a fresh session. Do not resubmit automatically.`);
    this.name = "SubmissionConfirmationTimeout";
  }
}

export class SubmissionPreparationTimeout extends Error {
  constructor() {
    super("Stopped waiting for transaction preparation before a confirmed journal checkpoint. Transactions in this workspace session are disabled and its autosave is stopped. Keep the workspace open, retain a file backup and inspect the latest browser copy; a storage write may have completed. A late checkpoint from this attempt cannot authorize broadcast.");
    this.name = "SubmissionPreparationTimeout";
  }
}

/** Bound preparation and post-checkpoint confirmation separately; do not cancel SDK work. */
export function submissionWait() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false, started = false;
  let checkpointId: string | undefined;
  let reject!: (error: Error) => void;
  const timeout = new Promise<never>((_resolve, fail) => { reject = fail; });
  const close = (error: Error) => { if (closed) return; closed = true; clearTimeout(timer); if (started) reject(error); };
  const assertActive = () => { if (closed || !started) throw new Error("Submission wait is closed. No transaction was sent by this checkpoint."); };
  return {
    get transactionId() { return checkpointId; },
    assertActive,
    cancel() { close(new Error("Workspace closed during transaction preparation or confirmation. Inspect the saved journal before retrying.")); },
    checkpoint(transactionId: string) {
      assertActive();
      if (checkpointId !== undefined) throw new Error("A transaction is already being observed");
      checkpointId = transactionId;
      clearTimeout(timer);
      timer = setTimeout(() => close(new SubmissionConfirmationTimeout(transactionId)), SUBMISSION_CONFIRMATION_TIMEOUT_MS);
    },
    async run<T>(action: () => Promise<T>): Promise<T> {
      if (started || closed) throw new Error("Submission wait cannot be reused");
      started = true;
      timer = setTimeout(() => close(new SubmissionPreparationTimeout()), SUBMISSION_PREPARATION_TIMEOUT_MS);
      try { return await Promise.race([action(), timeout]); }
      finally { closed = true; clearTimeout(timer); }
    },
  };
}
