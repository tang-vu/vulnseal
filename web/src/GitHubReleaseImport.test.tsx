// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./github-repository.js", async importOriginal => ({ ...await importOriginal<typeof import("./github-repository.js")>(), fetchPublicRelease: mocks.fetch }));
import { releaseReferenceText } from "./github-repository.js";
import { GitHubReleaseImport } from "./GitHubReleaseImport.js";
const reference = { repository: "example/project", releaseUrl: "https://github.com/example/project/releases/tag/v1", releaseId: 42, tag: "v1", commitSha: "ab".repeat(20), publishedAt: "2026-09-10T00:00:00Z", prerelease: true };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each(["rejected", "throw"])("retains the preview after %s application and retries without another lookup", async mode => {
  mocks.fetch.mockResolvedValue(reference);
  const append = vi.fn().mockImplementationOnce(() => { if (mode === "throw") throw new Error("Notes too large"); return false; }).mockReturnValue(true);
  const user = userEvent.setup(); render(<GitHubReleaseImport onAppend={append} />);
  await user.type(screen.getByLabelText("Public GitHub release URL"), reference.releaseUrl);
  await user.click(screen.getByRole("button", { name: "Look up public release" }));
  const apply = await screen.findByRole("button", { name: "Append release reference to notes" });
  await user.click(apply);
  expect(screen.getByRole("alert")).toHaveTextContent(mode === "throw" ? "Notes too large" : "not appended");
  expect(apply).toBeInTheDocument();
  await user.click(apply);
  expect(mocks.fetch).toHaveBeenCalledOnce(); expect(append).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Append release reference to notes" })).not.toBeInTheDocument();
});
it("appends only on explicit approval and labels prereleases", async () => {
  mocks.fetch.mockResolvedValue(reference); const append = vi.fn(), user = userEvent.setup();
  render(<GitHubReleaseImport onAppend={append} />);
  await user.type(screen.getByLabelText("Public GitHub release URL"), reference.releaseUrl);
  expect(mocks.fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Look up public release" }));
  await screen.findByText("example/project — Prerelease"); expect(append).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Append release reference to notes" }));
  expect(append).toHaveBeenCalledExactlyOnceWith(releaseReferenceText(reference));
});
it.each(["cancel", "edit", "report-change"])("discards a late release result after %s", async mode => {
  let resolve!: (value: typeof reference) => void;
  mocks.fetch.mockReturnValue(new Promise(done => { resolve = done; }));
  const append = vi.fn(), user = userEvent.setup(), view = render(<GitHubReleaseImport key="report-a" onAppend={append} />);
  await user.type(screen.getByLabelText("Public GitHub release URL"), reference.releaseUrl);
  await user.click(screen.getByRole("button", { name: "Look up public release" }));
  const signal = mocks.fetch.mock.calls[0]![1] as AbortSignal;
  if (mode === "cancel") await user.click(screen.getByRole("button", { name: "Cancel release lookup" }));
  else if (mode === "edit") await user.clear(screen.getByLabelText("Public GitHub release URL"));
  else view.rerender(<GitHubReleaseImport key="report-b" onAppend={append} />);
  expect(signal.aborted).toBe(true); await act(async () => resolve(reference));
  expect(screen.queryByRole("button", { name: "Append release reference to notes" })).not.toBeInTheDocument();
  expect(append).not.toHaveBeenCalled();
});
