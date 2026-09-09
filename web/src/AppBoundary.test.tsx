// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppBoundary } from "./AppBoundary.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("shows recovery guidance without rendering exception contents or deleting browser data", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const clear = vi.spyOn(Storage.prototype, "clear");
  const Broken = (): never => { throw new Error("Private report details must not appear here"); };
  render(<AppBoundary><Broken /></AppBoundary>);
  expect(screen.getByRole("heading", { name: "VulnSeal could not open this view" })).toBeInTheDocument();
  expect(screen.queryByText(/Private report details/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reload VulnSeal" })).toBeEnabled();
  expect(clear).not.toHaveBeenCalled();
});
