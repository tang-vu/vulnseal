// SPDX-License-Identifier: Apache-2.0
import { validateEnvironment } from "@vulnseal/shared";
const env = validateEnvironment(import.meta.env);
export const publicReplayEndpoints = (network: string) => ({
  ...publicEndpoints(network),
  websocketUrl: network === "preprod" ? "wss://indexer.preprod.midnight.network/api/v4/graphql/ws" : network === "local" && !["local", "undeployed"].includes(env.network) ? "ws://127.0.0.1:8088/api/v4/graphql/ws" : env.indexerWsUrl,
});
export const publicEndpoints = (network: string) => {
  if (network === "preprod") return { indexerUrl: "https://indexer.preprod.midnight.network/api/v4/graphql", rpcUrl: "https://rpc.preprod.midnight.network" };
  if (network === "local") return { indexerUrl: ["local", "undeployed"].includes(env.network) ? env.indexerHttpUrl : "http://127.0.0.1:8088/api/v4/graphql", rpcUrl: ["local", "undeployed"].includes(env.network) ? import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:9944" : "http://127.0.0.1:9944" };
  if (network === env.network && import.meta.env.VITE_RPC_URL) return { indexerUrl: env.indexerHttpUrl, rpcUrl: import.meta.env.VITE_RPC_URL };
  throw new Error("This network is not configured for public lookup in this deployment");
};
