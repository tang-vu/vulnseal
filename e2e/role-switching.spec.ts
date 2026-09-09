// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

test("two encrypted program identities can be locked and reopened in the same tab", async ({ page }) => {
  await page.goto("/#roles");
  const password = "Switch between independent programs";
  const create = async (label: string) => {
    await page.getByRole("button", { name: "Prepare vendor identity" }).click();
    await expect(page.getByRole("button", { name: "Lock and switch workspace" })).toBeDisabled();
    const identity = await page.getByText(/^Network: preprod/).innerText();
    await page.getByLabel("Browser copy label").fill(label);
    await page.getByLabel("Browser copy password", { exact: true }).fill(password);
    await page.getByLabel("Confirm browser copy password").fill(password);
    await page.getByRole("button", { name: "Enable encrypted browser autosave" }).click();
    await expect(page.getByText(/Saved encrypted browser copy/)).toBeVisible();
    await page.getByRole("button", { name: "Lock and switch workspace" }).click();
    await expect(page.getByRole("heading", { name: "Work with your own authority" })).toBeFocused();
    await expect(page.getByText(identity, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Browser unlock password")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Stop browser autosave" })).toHaveCount(0);
    return identity;
  };
  const first = await create("First program");
  const second = await create("Second program");
  expect(first).not.toBe(second);
  await expect(page.getByLabel("Saved browser workspace").getByRole("option")).toHaveCount(3);
  for (const [label, identity] of [["First program", first], ["Second program", second]]) {
    const option = page.getByLabel("Saved browser workspace").getByRole("option", { name: new RegExp(`^${label} · revision 1`) });
    await page.getByLabel("Saved browser workspace").selectOption((await option.getAttribute("value"))!);
    await page.getByLabel("Browser unlock password").fill("Incorrect workspace password");
    await page.getByRole("button", { name: "Unlock browser workspace" }).click();
    await expect(page.getByText(/Wrong role backup password or damaged file/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vendor workspace" })).toHaveCount(0);
    await page.getByLabel("Browser unlock password").fill(password);
    await page.getByRole("button", { name: "Unlock browser workspace" }).click();
    await expect(page.getByText(identity!, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop browser autosave" })).toBeVisible();
    await page.getByRole("button", { name: "Lock and switch workspace" }).click();
    await expect(page.getByRole("heading", { name: "Work with your own authority" })).toBeVisible();
  }
  await expect(page.getByLabel("Saved browser workspace").getByRole("option")).toHaveCount(3);
});
