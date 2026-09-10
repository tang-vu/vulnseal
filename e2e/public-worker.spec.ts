// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
test("a stalled public decoder is terminated without freezing lookup cancellation or retry", async ({ page }) => {
  await page.clock.install();
  let workers = 0;
  await page.route("**/public-lookup.worker-*.js", route => {
    workers++;
    return route.fulfill({ contentType: "text/javascript", body: "self.onmessage = () => { while (true) {} };" });
  });
  await page.goto(`/#verify?network=preprod&contract=${"ab".repeat(32)}`);
  const button = page.getByRole("button", { name: "Load public state" });
  await button.click(); await expect.poll(() => workers).toBe(1);
  await expect(page.getByRole("button", { name: "Cancel public lookup" })).toBeEnabled();
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("alert")).toContainText("Public lookup timed out. No verification result was accepted.");
  await expect(button).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toHaveCount(0);
  await button.click(); await expect.poll(() => workers).toBe(2);
  await page.getByRole("button", { name: "Cancel public lookup" }).click();
  await expect(button).toBeEnabled();
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Finalized public state" })).toHaveCount(0);
});
