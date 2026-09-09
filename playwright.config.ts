// SPDX-License-Identifier: Apache-2.0
import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // Full multi-role journeys include the initial Midnight WASM load.
  timeout: 60_000,
  // Each browser worker loads ledger WASM and performs expensive backup/key crypto.
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: [
    {
      command: "npm run dev -w @vulnseal/cipherstore",
      url: "http://127.0.0.1:8797/readyz",
      env: {
        CIPHERSTORE_ALLOWED_ORIGIN: "http://127.0.0.1:4173",
        CIPHERSTORE_PORT: "8797",
        CIPHERSTORE_DATA_DIR: path.join(tmpdir(), `vulnseal-e2e-${randomUUID()}`),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run build -w @vulnseal/web && npm run preview -w @vulnseal/web -- --port 4173",
      url: "http://127.0.0.1:4173",
      env: { VITE_CIPHERSTORE_URL: "http://127.0.0.1:8797", VITE_CIPHERSTORE_REPLICAS: "" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
