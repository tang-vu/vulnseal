// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

test("recovery inputs survive navigation and clear without a stale close warning", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  const password = page.getByLabel("Backup password", { exact: true });
  const file = page.getByLabel("Recovery file", { exact: true });
  await password.fill("Unfinished recovery password");
  await file.setInputFiles({ name: "synthetic-recovery.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.getByRole("button", { name: "Private exchange", exact: true }).click();
  await expect(password).toBeHidden();
  const warning = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await page.getByRole("button", { name: "Private recovery", exact: true }).click();
  await expect(password).toHaveValue("Unfinished recovery password");
  expect(await file.evaluate((element: HTMLInputElement) => element.files?.[0]?.name)).toBe("synthetic-recovery.json");
  await page.getByRole("button", { name: "Clear recovery inputs" }).click();
  await expect(password).toHaveValue("");
  expect(await file.evaluate((element: HTMLInputElement) => element.files?.length)).toBe(0);
  const closed = page.waitForEvent("close");
  page.on("dialog", async unexpected => { await unexpected.dismiss(); throw new Error("Cleared recovery inputs still warned"); });
  await page.close({ runBeforeUnload: true });
  await closed;
});
