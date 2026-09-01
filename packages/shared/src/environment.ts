// SPDX-License-Identifier: Apache-2.0

export type RuntimeEnvironment = {
  readonly mode: "guided-local" | "midnight";
  readonly network: "undeployed" | "local" | "preview" | "preprod" | "mainnet";
  readonly cipherstoreUrl: string;
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
  return {
    mode,
    network: network as RuntimeEnvironment["network"],
    cipherstoreUrl: url(
      input.VITE_CIPHERSTORE_URL ?? "http://127.0.0.1:8787",
      "VITE_CIPHERSTORE_URL",
      ["http:", "https:"],
    ),
    proofServerUrl: url(
      input.VITE_PROOF_SERVER_URL ?? "http://127.0.0.1:6300",
      "VITE_PROOF_SERVER_URL",
      ["http:", "https:"],
    ),
    indexerHttpUrl: url(
      input.VITE_INDEXER_HTTP_URL ?? "http://127.0.0.1:8088/api/v1/graphql",
      "VITE_INDEXER_HTTP_URL",
      ["http:", "https:"],
    ),
    indexerWsUrl: url(
      input.VITE_INDEXER_WS_URL ?? "ws://127.0.0.1:8088/api/v1/graphql/ws",
      "VITE_INDEXER_WS_URL",
      ["ws:", "wss:"],
    ),
  };
};
