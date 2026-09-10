// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WorkspaceNavigation } from "./WorkspaceNavigation.js";
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
function navigate(hash: string) {
  act(() => {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
it("keeps the original release URL and offers the latest requested link without changing children", () => {
  window.history.replaceState(null, "", "/releases/v1/#roles");
  const initialUrl = window.location.href;
  render(<><WorkspaceNavigation initialUrl={initialUrl} /><input aria-label="Private draft" defaultValue="retain me" /></>);
  navigate("#roles?network=preprod&contract=first");
  expect(window.location.href).toBe(initialUrl);
  expect(screen.getByRole("link")).toHaveAttribute("href", initialUrl + "?network=preprod&contract=first");
  expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  navigate("#verify?contract=second");
  expect(screen.getByRole("link")).toHaveAttribute("href", initialUrl.replace("#roles", "#verify?contract=second"));
  expect(screen.getByLabelText("Private draft")).toHaveValue("retain me");
  fireEvent.click(screen.getByRole("button", { name: "Keep working here" }));
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(window.location.href).toBe(initialUrl);
});
it("does not intercept after unmount", () => {
  const { unmount } = render(<WorkspaceNavigation initialUrl={window.location.href} />);
  unmount(); navigate("#roles"); expect(window.location.hash).toBe("#roles");
});
