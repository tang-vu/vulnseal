// SPDX-License-Identifier: Apache-2.0

export type RuntimeEnvironment = {
  readonly mode: "guided-local" | "midnight";
  readonly network: "undeployed" | "local" | "preview" | "preprod" | "mainnet";
  readonly cipherstoreUrl: string;
  readonly cipherstoreUrls: readonly string[];
  readonly proofServerUrl: string;
  readonly indexerHttpUrl: string;
  readonly indexerWsUrl: string;
};

const url = (value: string, name: string, protocols: readonly string[]): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return parsed.toString().replace(/\/$/, "");
};

export const validateEnvironment = (
  input: Record<string, string | undefined>,
): RuntimeEnvironment => {
  const mode = input.VITE_VULNSEAL_MODE ?? "guided-local";
  if (mode !== "guided-local" && mode !== "midnight") {
    throw new Error("VITE_VULNSEAL_MODE must be guided-local or midnight");
  }
  const network = input.VITE_MIDNIGHT_NETWORK ?? "undeployed";
  if (!["undeployed", "local", "preview", "preprod", "mainnet"].includes(network)) {
    throw new Error("VITE_MIDNIGHT_NETWORK is invalid");
  }
  const cipherstoreUrls = validateCipherstoreUrls([input.VITE_CIPHERSTORE_URL ?? "http://127.0.0.1:8787", ...(input.VITE_CIPHERSTORE_REPLICAS?.trim() ? input.VITE_CIPHERSTORE_REPLICAS.split(",").map((entry) => entry.trim()) : [])]);
  return {
    mode,
    network: network as RuntimeEnvironment["network"],
    cipherstoreUrl: cipherstoreUrls[0]!, cipherstoreUrls,
    proofServerUrl: url(
      input.VITE_PROOF_SERVER_URL ?? "http://127.0.0.1:6300",
      "VITE_PROOF_SERVER_URL",
      ["http:", "https:"],
    ),
    indexerHttpUrl: url(
      input.VITE_INDEXER_HTTP_URL ?? "http://127.0.0.1:8088/api/v4/graphql",
      "VITE_INDEXER_HTTP_URL",
      ["http:", "https:"],
    ),
    indexerWsUrl: url(
      input.VITE_INDEXER_WS_URL ?? "ws://127.0.0.1:8088/api/v4/graphql/ws",
      "VITE_INDEXER_WS_URL",
      ["ws:", "wss:"],
    ),
  };
};

export const validateCipherstoreUrls = (values: readonly string[]): readonly string[] => {
  if (values.length < 1 || values.length > 3) throw new Error("Configure between one and three ciphertext endpoints");
  const normalized = values.map((value) => {
    const result = url(value, "Ciphertext endpoint", ["http:", "https:"]);
    const parsed = new URL(result);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Ciphertext endpoints cannot contain credentials, query strings or fragments");
    return result;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error("Ciphertext endpoints must be distinct");
  return Object.freeze(normalized);
};
