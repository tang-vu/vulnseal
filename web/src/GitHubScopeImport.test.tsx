// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./github-repository.js", () => ({ fetchPublicRepository: mocks.lookup }));
import { GitHubScopeImport } from "./GitHubScopeImport.js";
const reference = { fullName: "owner/repo", url: "https://github.com/owner/repo", archived: false };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("applies only after a separate click", async () => {
  mocks.lookup.mockResolvedValue(reference); const onApply = vi.fn(), user = userEvent.setup();
  render(<GitHubScopeImport onApply={onApply} />);
  await user.type(screen.getByLabelText("Public GitHub repository URL"), reference.url);
  expect(mocks.lookup).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Look up public repository" }));
  await screen.findByRole("button", { name: "Use repository as primary scope" }); expect(onApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Use repository as primary scope" }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(reference.url);
});
it.each(["cancel", "edit", "unmount"])("discards late lookup results after %s", async mode => {
  let resolve!: (value: typeof reference) => void;
  mocks.lookup.mockReturnValue(new Promise(done => { resolve = done; }));
  const user = userEvent.setup(), onApply = vi.fn(); const view = render(<GitHubScopeImport onApply={onApply} />);
  await user.type(screen.getByLabelText("Public GitHub repository URL"), reference.url);
  await user.click(screen.getByRole("button", { name: "Look up public repository" }));
  const signal = mocks.lookup.mock.calls[0]![1] as AbortSignal;
  if (mode === "cancel") await user.click(screen.getByRole("button", { name: "Cancel repository lookup" }));
  else if (mode === "edit") await user.clear(screen.getByLabelText("Public GitHub repository URL"));
  else view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(reference));
  expect(screen.queryByRole("button", { name: "Use repository as primary scope" })).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});
