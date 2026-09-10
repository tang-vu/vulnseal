// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { submissionEmbed } from "../web/src/submission-embed.js";
const invitation = { format: "vulnseal-program-invitation" as const, version: 1 as const, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
async function host(snippet: string) {
  const server = createServer((_request, response) => { response.setHeader("content-type", "text/html"); response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Example disclosure program</title></head><body>${snippet}</body></html>`); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
test("cross-origin widget loads only public modules and opens an isolated invitation", async ({ page, baseURL }) => {
  const snippet = submissionEmbed(baseURL! + "/", invitation);
  const resources: string[] = [], posts: string[] = [];
  page.on("request", request => { resources.push(request.url()); if (request.method() !== "GET") posts.push(request.url()); });
  const publisher = await host(snippet);
  try {
  await page.goto(publisher.url);
  const widget = page.locator("vulnseal-submission");
  await expect(widget.getByRole("heading", { name: "Report a vulnerability" })).toBeVisible();
  await expect(widget).toContainText(invitation.programId);
  const scripts = resources.filter(url => url.startsWith(baseURL!));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every(url => /\/assets\/(submission-widget|program-invitation-[A-Za-z0-9_-]+)\.js$/.test(url))).toBe(true);
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const popupPromise = page.waitForEvent("popup"); await widget.getByRole("link", { name: "Start a private report" }).click();
  const popup = await popupPromise;
  try {
    await expect(popup.getByRole("heading", { name: "Review program invitation" })).toBeVisible();
    await expect(popup.getByRole("region", { name: "Review public program invitation" })).toContainText(invitation.programId);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(await popup.evaluate(() => "midnight" in window)).toBe(false);
  } finally { await popup.close(); }
  await widget.evaluate(element => element.setAttribute("invitation", "javascript:alert(1)"));
  await expect(widget.getByRole("alert")).toBeVisible();
  await expect(widget.getByRole("link")).toHaveCount(0);
  } finally { await publisher.close(); }
});
test("the generated fallback remains usable without JavaScript", async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
  const publisher = await host(submissionEmbed(baseURL! + "/", invitation));
  try {
    const page = await context.newPage();
    await page.goto(publisher.url);
    await expect(page.getByRole("link", { name: "Report a vulnerability on VulnSeal" })).toHaveAttribute("href", new RegExp("#roles\\?network=preprod&contract=" + invitation.contractAddress));
    await expect(page.getByRole("link")).toBeVisible();
  } finally { await context.close(); await publisher.close(); }
});
