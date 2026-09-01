// SPDX-License-Identifier: Apache-2.0
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
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
      url: "http://127.0.0.1:8797/healthz",
      env: {
        CIPHERSTORE_ALLOWED_ORIGIN: "http://127.0.0.1:4173",
        CIPHERSTORE_PORT: "8797",
      },
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev -w @vulnseal/web -- --port 4173",
      url: "http://127.0.0.1:4173",
      env: { VITE_CIPHERSTORE_URL: "http://127.0.0.1:8797" },
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
