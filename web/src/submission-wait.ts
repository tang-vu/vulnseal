// SPDX-License-Identifier: Apache-2.0
export const SUBMISSION_CONFIRMATION_TIMEOUT_MS = 600_000;

export class SubmissionConfirmationTimeout extends Error {
  constructor(readonly transactionId: string) {
    super(`Stopped waiting for confirmation of ${transactionId}. Its outcome is unknown; the transaction may still finalize. Keep the encrypted backup and check this identifier in the journal. Transactions in this workspace session are disabled; reconcile before restoring a fresh session. Do not resubmit automatically.`);
    this.name = "SubmissionConfirmationTimeout";
  }
}

/** Application wait only: leave the SDK's indefinite watch contract intact. */
export function submissionWait() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let checkpointId: string | undefined;
  let reject!: (error: Error) => void;
  const timeout = new Promise<never>((_resolve, fail) => { reject = fail; });
  return {
    get transactionId() { return checkpointId; },
    checkpoint(transactionId: string) {
      if (closed) throw new Error("Submission wait is closed. No transaction was sent by this checkpoint.");
      if (timer !== undefined) throw new Error("A transaction is already being observed");
      checkpointId = transactionId;
      timer = setTimeout(() => reject(new SubmissionConfirmationTimeout(transactionId)), SUBMISSION_CONFIRMATION_TIMEOUT_MS);
    },
    async run<T>(action: () => Promise<T>): Promise<T> {
      try { return await Promise.race([action(), timeout]); }
      finally { closed = true; clearTimeout(timer); }
    },
  };
}
