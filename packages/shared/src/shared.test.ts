// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  canonicalizeJson,
  canonicalizeReport,
  contractStatusName,
  openReport,
  prepareCommitmentInputs,
  parseCiphertextEnvelope,
  redactForLog,
  sealReport,
  validateContentDigest,
  validateEnvironment,
  type VulnerabilityReport,
} from "./index.js";

const report: VulnerabilityReport = {
  schemaVersion: 1,
  title: "Authorization bypass",
  summary: "A private endpoint accepts an unscoped bearer token.",
  affectedAsset: "api.example.test/v1/private",
  weakness: "CWE-862",
  reproductionSteps: ["Create a low-privilege account", "Call the private endpoint"],
  impact: "Read another tenant's configuration.",
  suggestedRemediation: "Enforce tenant scope on every request.",
  attachments: [
    {
      filename: "request.txt",
      mediaType: "text/plain",
      size: 128,
      sha256: "ab".repeat(32),
    },
  ],
  researcherContact: "sealed@example.test",
};

describe("privacy primitives", () => {
  it("canonicalizes objects deterministically", () => {
    expect(canonicalizeJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
    expect(canonicalizeReport({ ...report })).toBe(canonicalizeReport(report));
  });

  it("sorts normalized keys consistently without losing special object keys", () => {
    expect(canonicalizeJson({ "e\u0301": 1, z: 2 })).toBe(canonicalizeJson({ "é": 1, z: 2 }));
    expect(() => canonicalizeJson({ "e\u0301": 1, "é": 2 })).toThrow("duplicate normalized keys");
    expect(canonicalizeJson(JSON.parse('{"__proto__":{"private":"retained"},"a":1}'))).toBe('{"__proto__":{"private":"retained"},"a":1}');
  });

  it("validates attachment digests and lengths before sealing", () => {
    for (const attachment of [{ ...report.attachments[0]!, sha256: "not-a-digest" }, { ...report.attachments[0]!, size: -1 }, { ...report.attachments[0]!, size: 1.5 }]) {
      expect(() => canonicalizeReport({ ...report, attachments: [attachment] })).toThrow(/attachment\./);
    }
  });

  it("validates Compact commitment input widths without imitating its hash", () => {
    const inputs = prepareCommitmentInputs({
      programId: new Uint8Array(32).fill(1),
      canonicalReportDigest: new Uint8Array(32).fill(2),
      reportSalt: new Uint8Array(32).fill(3),
    });
    expect(inputs.reportSalt).toHaveLength(32);
    expect(() =>
      prepareCommitmentInputs({ ...inputs, reportSalt: new Uint8Array(31) }),
    ).toThrow("reportSalt must be exactly 32 bytes");
  });

  it("encrypts and decrypts a report using authenticated Web Crypto", async () => {
    const sealed = await sealReport(
      report,
      "program-demo",
      new Uint8Array(32).fill(7),
      new Uint8Array(12).fill(8),
    );
    expect(sealed.serializedEnvelope).not.toContain(report.title);
    expect(await openReport(sealed.serializedEnvelope, sealed.key)).toEqual(report);
    expect(await validateContentDigest(sealed.serializedEnvelope, sealed.contentAddress)).toBe(true);
  });

  it("rejects corrupted ciphertext", async () => {
    const sealed = await sealReport(report, "program-demo");
    const parsed = JSON.parse(sealed.serializedEnvelope) as Record<string, string>;
    // Change actual decoded bits, not potentially unused final base64 padding bits.
    const firstCharacter = parsed.ciphertext?.startsWith("A") ? "B" : "A";
    parsed.ciphertext = `${firstCharacter}${parsed.ciphertext?.slice(1)}`;
    await expect(openReport(JSON.stringify(parsed), sealed.key)).rejects.toThrow(
      "Ciphertext authentication failed",
    );
  });

  it("rejects alternate base64url spellings with nonzero padding bits", () => {
    expect(base64UrlToBytes("Zg")).toEqual(new Uint8Array([102]));
    expect(() => base64UrlToBytes("Zh")).toThrow("Noncanonical");
    expect(() => base64UrlToBytes("Zm9")).toThrow("Noncanonical");
  });

  it("rejects extra fields and malformed envelopes before decryption", async () => {
    const sealed = await sealReport(report, "program-demo");
    expect(() => parseCiphertextEnvelope(JSON.stringify({ ...sealed.envelope, title: "plaintext" }))).toThrow("malformed");
    expect(() => parseCiphertextEnvelope(JSON.stringify({ ...sealed.envelope, ciphertext: "AA" }))).toThrow("authentication tag");
    expect(() => parseCiphertextEnvelope(JSON.stringify({ ...sealed.envelope, aad: "private report title" }))).toThrow("public program identifier");
    await expect(sealReport(report, "private report title")).rejects.toThrow("Invalid public program identifier");
  });

  it("detects content digest mismatches", async () => {
    const sealed = await sealReport(report, "program-demo");
    expect(await validateContentDigest(`${sealed.serializedEnvelope} `, sealed.contentAddress)).toBe(false);
  });

  it("maps every contract state and rejects unknown states", () => {
    expect(contractStatusName(0)).toBe("COMMITTED");
    expect(contractStatusName(7n)).toBe("PAYOUT_AUTHORIZED");
    expect(() => contractStatusName(99)).toThrow("Unknown contract report status");
  });

  it("redacts private values while retaining public audit identifiers", () => {
    const value = redactForLog({
      reportId: "public-commitment",
      actorSecret: "never-log",
      nested: { reproductionSteps: ["secret exploit"], status: "COMMITTED" },
    });
    expect(value).toEqual({
      reportId: "public-commitment",
      actorSecret: "[REDACTED]",
      nested: { reproductionSteps: "[REDACTED]", status: "COMMITTED" },
    });
  });

  it("validates runtime environment URLs and modes", () => {
    expect(validateEnvironment({}).mode).toBe("guided-local");
    expect(() =>
      validateEnvironment({ VITE_PROOF_SERVER_URL: "not-a-url" }),
    ).toThrow("VITE_PROOF_SERVER_URL must be an absolute URL");
  });
  it("bounds and validates explicit ciphertext replica configuration", () => {
    expect(validateEnvironment({}).cipherstoreUrls).toEqual(["http://127.0.0.1:8787"]);
    expect(validateEnvironment({ VITE_CIPHERSTORE_REPLICAS: "https://replica.example.test/" }).cipherstoreUrls).toEqual(["http://127.0.0.1:8787", "https://replica.example.test"]);
    for (const suffix of ["?", "#", "?#", "?/"] ) expect(() => validateEnvironment({ VITE_CIPHERSTORE_URL: `https://a.test/base${suffix}` })).toThrow("query strings or fragments");
    expect(validateEnvironment({ VITE_CIPHERSTORE_URL: "https://a.test/base///" }).cipherstoreUrl).toBe("https://a.test/base");
    expect(() => validateEnvironment({ VITE_CIPHERSTORE_URL: "https://a.test/base/", VITE_CIPHERSTORE_REPLICAS: "https://a.test/base///" })).toThrow("distinct");
    expect(validateEnvironment({ VITE_CIPHERSTORE_URL: "https://a.test/path%3Fpart%23part" }).cipherstoreUrl).toBe("https://a.test/path%3Fpart%23part");
    for (const replica of ["http://127.0.0.1:8787/", "https://a.test,https://b.test,https://c.test", "https://a.test,", "https://user:password@a.test", "https://a.test?token=x", "https://a.test/#fragment", "file:///a"]) expect(() => validateEnvironment({ VITE_CIPHERSTORE_REPLICAS: replica })).toThrow();
  });
});
