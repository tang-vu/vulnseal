// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

for (const stage of ["connect", "configuration"] as const) test(`expired wallet ${stage} cannot finish setup when timer dispatch has not occurred`, async ({ page }) => {
  await page.addInitScript(stage => {
    const calls = { status: 0, configuration: 0, addresses: 0, broadcasts: 0 };
    const advanceWallClock = () => { const expired = Date.now() + 120_001; Date.now = () => expired; };
    const connected = {
      getConnectionStatus: async () => { calls.status++; return { status: "connected", networkId: "preprod" }; },
      getConfiguration: async () => {
        calls.configuration++; if (stage === "configuration") advanceWallClock();
        return { networkId: "preprod", proverServerUri: "http://127.0.0.1:8797/synthetic-proof", indexerUri: "http://127.0.0.1:8797/synthetic-indexer", indexerWsUri: "ws://127.0.0.1:8797/synthetic-indexer" };
      },
      getShieldedAddresses: async () => { calls.addresses++; return { shieldedCoinPublicKey: "01".repeat(32), shieldedEncryptionPublicKey: "02".repeat(32) }; },
      submitTransaction: async () => { calls.broadcasts++; throw new Error("Synthetic wallet never broadcasts"); },
    };
    Object.assign(window, { __walletClockCalls: calls, midnight: { synthetic: { apiVersion: "4.0.1", connect: async () => { if (stage === "connect") advanceWallClock(); return connected; } } } });
  }, stage);
  await page.goto("/");
  await page.getByRole("button", { name: "Guided local", exact: true }).click();
  await expect(page.getByText(/Wallet setup timed out/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guided local", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Lace connected", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __walletClockCalls: unknown }).__walletClockCalls)).toEqual({ status: stage === "connect" ? 0 : 1, configuration: stage === "connect" ? 0 : 1, addresses: 0, broadcasts: 0 });
});
