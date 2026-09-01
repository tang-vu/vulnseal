// SPDX-License-Identifier: Apache-2.0
import { Buffer } from "buffer";

// Midnight SDK browser dependencies expect these Node-compatible globals.
Object.assign(globalThis, {
  Buffer,
  process: { env: { NODE_ENV: import.meta.env.MODE } },
});
