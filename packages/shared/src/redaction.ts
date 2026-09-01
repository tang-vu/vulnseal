// SPDX-License-Identifier: Apache-2.0

const REDACTED = "[REDACTED]";
const sensitiveKeys = new Set([
  "actorSecret",
  "canonicalReport",
  "canonicalReportDigest",
  "encryptionKey",
  "impact",
  "impactDetails",
  "key",
  "mnemonic",
  "patchDigest",
  "plaintext",
  "privateKey",
  "reportSalt",
  "reproductionSteps",
  "researcherContact",
  "retestEvidence",
  "retestDigest",
  "salt",
  "seed",
  "secret",
  "secretKey",
]);

export const redactForLog = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Uint8Array) return `[bytes:${value.byteLength}]`;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redactForLog(entry, seen));
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = sensitiveKeys.has(key) ? REDACTED : redactForLog(entry, seen);
  }
  return output;
};
