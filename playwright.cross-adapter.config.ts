// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "@playwright/test";
import replication from "./playwright.replication.config.js";

if (!Array.isArray(replication.webServer) || replication.webServer.length !== 3) throw new Error("Expected two stores and a web server");
export default defineConfig({
  ...replication,
  outputDir: "./test-results-cross-adapter",
  webServer: replication.webServer.map((server, index) => index < 2
    ? { ...server, env: { ...server.env, CIPHERSTORE_BACKEND: index === 0 ? "filesystem" : "sqlite" } }
    : server),
});
