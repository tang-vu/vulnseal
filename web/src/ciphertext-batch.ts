// SPDX-License-Identifier: Apache-2.0
/** Stop between reports: an in-flight upload must still settle before returning. */
export async function uploadSavedBatch<T>(reports: readonly T[], options: {
  signal: AbortSignal;
  upload: (report: T) => Promise<unknown>;
  progress: (acknowledged: number) => void;
}): Promise<number> {
  let acknowledged = 0;
  for (const report of reports) {
    if (options.signal.aborted) break;
    await options.upload(report);
    options.progress(++acknowledged);
  }
  return acknowledged;
}
