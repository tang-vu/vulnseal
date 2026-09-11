// SPDX-License-Identifier: Apache-2.0
export const DEMO_TRANSITION_TIMEOUT_MS = 600_000;

/** Bound the UI wait without treating expiration as transaction cancellation. */
export async function demoTransitionWait<T>(prepare: () => Promise<unknown>, submit: () => Promise<T>): Promise<T> {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const monotonicDeadline = performance.now() + DEMO_TRANSITION_TIMEOUT_MS;
  const wallDeadline = Date.now() + DEMO_TRANSITION_TIMEOUT_MS;
  const error = new Error("Stopped waiting for this transition. Its outcome is unknown and it may still finalize. Export an encrypted backup through Private recovery. Further transactions remain blocked; do not resubmit this attempt.");
  const assertActive = () => {
    if (closed || performance.now() >= monotonicDeadline || Date.now() >= wallDeadline) { closed = true; throw error; }
  };
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { closed = true; reject(error); }, DEMO_TRANSITION_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([
      (async () => {
        await prepare();
        // Preparation can finish after the UI stops waiting. Never broadcast then.
        assertActive();
        return submit();
      })(),
      timeout,
    ]);
    assertActive();
    return result;
  } catch (cause) {
    assertActive();
    throw cause;
  } finally {
    closed = true;
    clearTimeout(timer);
  }
}
