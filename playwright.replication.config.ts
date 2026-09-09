// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import base from "./playwright.config.js";

if (!Array.isArray(base.webServer) || base.webServer.length !== 2) throw new Error("Expected the base ciphertext and web servers");
const [primary, web] = base.webServer;
export default defineConfig({
  ...base,
  testDir: "./e2e-replication",
  webServer: [
    { ...primary!, reuseExistingServer: false },
    { ...primary!, url: "http://127.0.0.1:8798/readyz", reuseExistingServer: false, env: { ...primary!.env, CIPHERSTORE_PORT: "8798", CIPHERSTORE_DATA_DIR: path.join(tmpdir(), `vulnseal-replica-e2e-${randomUUID()}`) } },
    { ...web!, env: { ...web!.env, VITE_CIPHERSTORE_REPLICAS: "http://127.0.0.1:8798" } },
  ],
});
