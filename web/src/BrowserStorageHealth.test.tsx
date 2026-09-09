// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserStorageHealth } from "./BrowserStorageHealth.js";

const original = Object.getOwnPropertyDescriptor(navigator, "storage");
const storage = (value: unknown) => Object.defineProperty(navigator, "storage", { configurable: true, value });
afterEach(() => {
  cleanup();
  if (original) Object.defineProperty(navigator, "storage", original);
  else Reflect.deleteProperty(navigator, "storage");
});
const open = () => { render(<BrowserStorageHealth />); fireEvent.click(screen.getByText("Device storage and retention")); };

it("reports usage and requests retention only on an explicit click, including denial and later grant", async () => {
  let granted = false;
  const persist = vi.fn(async () => granted);
  storage({ estimate: async () => ({ usage: 1048576, quota: 10485760 }), persisted: async () => granted, persist });
  open();
  await screen.findByText(/Estimated site usage: 1.0 MiB. Estimated site quota: 10.0 MiB/);
  expect(persist).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Request persistent storage" }));
  await screen.findByText(/The browser did not grant persistent storage/);
  expect(persist).toHaveBeenCalledOnce();
  expect(screen.getByText(/Best effort; the browser may evict site data/)).toBeInTheDocument();
  granted = true;
  fireEvent.click(screen.getByRole("button", { name: "Request persistent storage" }));
  await screen.findByText("Browser-reported storage retention: Persistent.");
  expect(screen.getByRole("button", { name: "Request persistent storage" })).toBeDisabled();
});

it("keeps partial browser information and treats missing capabilities or invalid estimates as unknown", async () => {
  storage({ estimate: () => { throw new Error("Unavailable"); }, persisted: async () => true });
  open();
  await screen.findByText("Browser-reported storage retention: Persistent.");
  expect(screen.getByText(/Estimated site usage: Unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Request persistent storage" })).toBeDisabled();
  cleanup();
  storage({ estimate: async () => ({ usage: -1, quota: Infinity }) });
  open();
  await screen.findByText(/Unknown or unsupported/);
  expect(screen.getByText(/Estimated site usage: Unavailable. Estimated site quota: Unavailable/)).toBeInTheDocument();
});

it("handles request rejection without promising protection or retrying automatically", async () => {
  const persist = vi.fn().mockRejectedValue(new Error("Denied by policy"));
  storage({ persisted: async () => false, persist });
  open();
  await screen.findByText(/Best effort; the browser may evict site data/);
  fireEvent.click(screen.getByRole("button", { name: "Request persistent storage" }));
  await screen.findByText(/Browser storage information or permission is unavailable/);
  expect(persist).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Request persistent storage" })).toBeEnabled();
});
