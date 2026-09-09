// SPDX-License-Identifier: Apache-2.0
import type { VulnerabilityReport } from "./types.js";

type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const normalize = (value: JsonValue): JsonValue => {
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
    if (!Number.isSafeInteger(value)) {
      throw new Error("Canonical JSON accepts only safe integer numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalize(entry));
  if (value !== null && typeof value === "object") {
    const objectValue = value as Readonly<Record<string, JsonValue>>;
    const sorted: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    const keys = Object.keys(objectValue).map((key) => ({ key, normalized: key.normalize("NFC") }));
    if (new Set(keys.map(({ normalized }) => normalized)).size !== keys.length) {
      throw new Error("Canonical JSON rejects duplicate normalized keys");
    }
    keys.sort((a, b) => a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0);
    for (const { key, normalized } of keys) {
      const entry = objectValue[key];
      if (entry === undefined) throw new Error(`Undefined value at key: ${key}`);
      sorted[normalized] = normalize(entry);
    }
    return sorted;
  }
  return value;
};

/** Deterministic, UTF-8-compatible JSON for commitment input hashing. */
export const canonicalizeJson = (value: JsonValue): string =>
  JSON.stringify(normalize(value));

const requireText = (value: string, name: string): string => {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
};

export const canonicalizeReport = (report: VulnerabilityReport): string => {
  if (report.schemaVersion !== 1) throw new Error("Unsupported report schema version");
  if (report.reproductionSteps.length === 0) {
    throw new Error("At least one reproduction step is required");
  }
  const normalized = {
    affectedAsset: requireText(report.affectedAsset, "affectedAsset"),
    attachments: report.attachments.map((attachment) => {
      if (!Number.isSafeInteger(attachment.size) || attachment.size < 0) throw new Error("attachment.size must be a nonnegative safe integer");
      if (typeof attachment.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(attachment.sha256.trim())) throw new Error("attachment.sha256 must be a SHA-256 hex digest");
      return {
      filename: requireText(attachment.filename, "attachment.filename"),
      mediaType: requireText(attachment.mediaType, "attachment.mediaType"),
      sha256: requireText(attachment.sha256, "attachment.sha256").toLowerCase(),
      size: attachment.size,
      };
    }),
    impact: requireText(report.impact, "impact"),
    reproductionSteps: report.reproductionSteps.map((step, index) =>
      requireText(step, `reproductionSteps[${index}]`),
    ),
    researcherContact: report.researcherContact.normalize("NFC").trim(),
    schemaVersion: 1,
    suggestedRemediation: report.suggestedRemediation.normalize("NFC").trim(),
    summary: requireText(report.summary, "summary"),
    title: requireText(report.title, "title"),
    weakness: requireText(report.weakness, "weakness"),
  } satisfies VulnerabilityReport;
  return canonicalizeJson(normalized);
};
