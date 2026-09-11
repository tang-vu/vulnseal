// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import wasm from "vite-plugin-wasm";
import { validateEnvironment } from "../packages/shared/src/environment.js";

export default defineConfig({
  envDir: fileURLToPath(new URL("../", import.meta.url)),
  base: "./",
  cacheDir: "./.vite",
  plugins: [react(), wasm(), {
    name: "vulnseal-public-environment",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (/^\/assets\/(?:submission-widget|program-invitation-[A-Za-z0-9_-]+)\.js$/.test((request.url ?? "").split("?")[0]!)) response.setHeader("Access-Control-Allow-Origin", "*");
        next();
      });
    },
    configResolved(config) {
      // Validate Vite's effective values after mode-specific files and shell
      // overrides have been applied, before any output is emitted or served.
      validateEnvironment(config.env);
    },
  }],
  worker: {
    format: "es", plugins: () => [wasm()],
    rollupOptions: { output: { manualChunks(id) {
      // Keep runtime initialization ahead of Compact's module-level WASM calls.
      if (id.includes("onchain-runtime-v3")) return "worker-midnight-wasm";
      if (id.includes("@midnight-ntwrk")) return "worker-midnight-sdk";
      return undefined;
    } } },
  },
  build: {
    target: "esnext",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), "submission-widget": fileURLToPath(new URL("./src/submission-widget.ts", import.meta.url)) },
      output: {
        entryFileNames: chunk => chunk.name === "submission-widget" ? "assets/submission-widget.js" : "assets/[name]-[hash].js",
        manualChunks(id) {
          if (id.includes("onchain-runtime-v3")) return "midnight-wasm";
          if (id.includes("@midnight-ntwrk")) return "midnight-sdk";
          return undefined;
        },
      },
    },
  },
  resolve: {
    // @subsquid codecs used by the current ledger SDK rely on Node's assert API.
    // The browser package supplies the maintained browser implementation.
    alias: {
      assert: "assert/",
      "isomorphic-ws": fileURLToPath(
        new URL("./src/midnight/isomorphic-ws-browser.ts", import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    include: ["@midnight-ntwrk/compact-runtime"],
    exclude: ["@midnight-ntwrk/onchain-runtime-v3"],
  },
  test: {
    // Each worker initializes Midnight WASM and performs real backup/key crypto.
    // Bound concurrent runtimes on both developer machines and CI runners.
    maxWorkers: 2,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
