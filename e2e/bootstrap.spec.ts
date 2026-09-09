// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const routePath of ["/", "/#roles"]) {
  test(`failed WASM loading has a recovery screen and preserves browser copies at ${routePath}`, async ({ page }) => {
    await page.goto("/#roles");
    await expect(page.getByRole("heading", { name: "Work with your own authority" })).toBeVisible();
    await page.getByRole("button", { name: "Prepare vendor identity" }).click();
    const identity = await page.getByText(/^Network: preprod/).innerText();
    await page.getByLabel("Browser copy password", { exact: true }).fill("Recover after failed application load");
    await page.getByLabel("Confirm browser copy password").fill("Recover after failed application load");
    await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
    await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
    const saved = await page.evaluate(() => new Promise<string>((resolve, reject) => {
      const request = indexedDB.open("vulnseal-encrypted-roles", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("roles").objectStore("roles").getAll();
        read.onsuccess = () => { resolve(read.result[0].encrypted); db.close(); };
        read.onerror = () => { reject(read.error); db.close(); };
      };
    }));
    await page.route("**/*.wasm", (route) => route.abort("failed"));
    // A document navigation reloads modules; changing only the fragment would not.
    await page.goto(routePath === "/" ? "/?startup-test=1" : "/?startup-test=1#roles");
    await expect(page.getByRole("heading", { name: "VulnSeal could not open this view" })).toBeVisible();
    await expect(page.getByText(/This recovery screen does not delete saved encrypted browser copies/)).toBeVisible();
    await page.getByText("Export saved browser copies", { exact: true }).click();
    await page.getByRole("button", { name: "Load saved-copy catalog" }).click();
    await expect(page.getByRole("status")).toHaveText("Found 1 encrypted browser copies.");
    await page.getByLabel("Browser copy to manage").selectOption({ index: 1 });
    await expect(page.getByRole("button", { name: "Delete selected browser copy" })).toHaveCount(0);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected encrypted copy" }).click();
    const downloaded = await downloading;
    expect(await readFile((await downloaded.path())!, "utf8")).toBe(saved);
    await page.unroute("**/*.wasm");
    await page.getByRole("button", { name: "Reload VulnSeal" }).click();
    if (routePath === "/") {
      await expect(page.getByRole("heading", { name: /Disclose the truth/ })).toBeVisible();
      await page.goto("/#roles");
    }
    await expect(page.getByRole("heading", { name: "Work with your own authority" })).toBeVisible();
    await page.getByLabel("Saved browser workspace").selectOption({ index: 1 });
    await page.getByLabel("Browser unlock password").fill("Recover after failed application load");
    await page.getByRole("button", { name: "Unlock browser workspace" }).click();
    await expect(page.getByText(identity, { exact: true })).toBeVisible();
  });
}

test("the lightweight loading screen appears before delayed WASM finishes", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/*.wasm", async (route) => { await gate; await route.continue(); });
  try {
    await page.goto("/#roles", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Preparing the private workspace/)).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: "Work with your own authority" })).toBeVisible();
  } finally { release(); }
});

test("HTML gives recovery instructions when JavaScript is disabled", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Loading VulnSeal" })).toBeVisible();
    await expect(page.getByText(/VulnSeal requires JavaScript to open the private workspace/)).toBeVisible();
  } finally { await context.close(); }
});
