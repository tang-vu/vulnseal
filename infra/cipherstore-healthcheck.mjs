// SPDX-License-Identifier: Apache-2.0
try {
  const response = await fetch(`http://127.0.0.1:${process.env.CIPHERSTORE_PORT ?? "8787"}/readyz`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok || (await response.json()).status !== "ready") process.exitCode = 1;
} catch { process.exitCode = 1; }
