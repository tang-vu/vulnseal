// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  cacheDir: "./.vite",
  plugins: [react(), wasm()],
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
      output: {
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
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
