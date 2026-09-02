// SPDX-License-Identifier: Apache-2.0

export const preprodConfig = {
  networkId: "preprod",
  indexerHttpUrl: "https://indexer.preprod.midnight.network/api/v4/graphql",
  indexerWsUrl: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  rpcUrl: "https://rpc.preprod.midnight.network",
  relayUrl: "wss://rpc.preprod.midnight.network",
  proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL ?? "http://127.0.0.1:6300",
  faucetUrl: "https://midnight-tmnight-preprod.nethermind.dev/",
} as const;
