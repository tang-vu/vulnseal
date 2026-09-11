// SPDX-License-Identifier: Apache-2.0
/** Check elapsed time at continuation boundaries even when timer dispatch is delayed. */
export async function continuationDeadline<T>(duration: number, message: string, action: (assertActive: () => void, signal: AbortSignal) => Promise<T>): Promise<T> {
  const error = new Error(message), controller = new AbortController();
  const wallDeadline = Date.now() + duration, monotonicDeadline = performance.now() + duration;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const assertActive = () => {
    if (closed) throw error;
    if (Date.now() >= wallDeadline || performance.now() >= monotonicDeadline) controller.abort(error);
    controller.signal.throwIfAborted();
  };
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(error); reject(error); }, duration);
  });
  try {
    const result = await Promise.race([action(assertActive, controller.signal), timeout]);
    assertActive(); return result;
  } catch (cause) { assertActive(); throw cause; }
  finally { closed = true; clearTimeout(timer); }
}
