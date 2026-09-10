// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { decryptRoleVault, type RoleVault } from "./role-recovery.js";
import { captureDeploymentInputs, type SavedDeploymentInputs } from "./program.js";
import type { ProgramConstructor } from "@vulnseal/api/types";
const password = "Deployment checkpoint test password";
const transactionId = "ab".repeat(32);
const mocks = vi.hoisted(() => ({ rejectCheckpoint: false, wallet: vi.fn(), saved: [] as RoleVault[], selected: undefined as SavedDeploymentInputs | undefined }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: vi.fn(async (_network, beforeSubmit) => ({ beforeSubmit })) }));
vi.mock("@vulnseal/api/api", () => ({ VulnSealApi: { deploy: vi.fn(async (providers, _privateState, inputs: ProgramConstructor) => {
  mocks.selected = captureDeploymentInputs(inputs);
  await providers.beforeSubmit(transactionId);
  expect(mocks.saved.at(-1)?.submissionAttempts?.[0]?.deployment).toEqual(mocks.selected);
  mocks.wallet(); // Boundary after the application's durable before-submit hook.
  throw new Error("Controlled deployment response lost");
}) } }));
vi.mock("./role-storage.js", () => ({
  listStoredRoles: vi.fn(async () => []), readStoredRole: vi.fn(), deleteStoredRole: vi.fn(),
  writeStoredRole: vi.fn(async (id, label, encrypted, revision) => {
    const vault = await decryptRoleVault(encrypted, password);
    if (mocks.rejectCheckpoint && vault.submissionAttempts?.length) throw new Error("Controlled checkpoint failure");
    mocks.saved.push(vault);
    return { id, label, encrypted, revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() };
  }),
}));
import { RoleWorkspace } from "./RoleWorkspace.js";
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.saved = []; mocks.selected = undefined; mocks.rejectCheckpoint = false; });

it.each([false, true])("saves selected deployment inputs before the wallet boundary (storage failure=%s)", async (rejectCheckpoint) => {
  mocks.rejectCheckpoint = rejectCheckpoint;
  const user = userEvent.setup();
  render(<RoleWorkspace />);
  await user.click(screen.getByRole("button", { name: "Prepare vendor identity" }));
  await user.type(screen.getByLabelText("Browser copy password", { exact: true }), password);
  await user.type(screen.getByLabelText("Confirm browser copy password"), password);
  await user.click(screen.getByRole("button", { name: "Enable encrypted browser autosave" }));
  await screen.findByRole("button", { name: "Stop browser autosave" });
  await user.click(screen.getByRole("button", { name: "Reports" }));
  await user.click(screen.getByRole("button", { name: "Connect Lace and deploy program" }));
  await screen.findByText(rejectCheckpoint ? "Controlled checkpoint failure" : "Controlled deployment response lost", {}, { timeout: 5000 });
  expect(mocks.selected).toBeDefined();
  expect(mocks.wallet).toHaveBeenCalledTimes(rejectCheckpoint ? 0 : 1);
  const latest = mocks.saved.at(-1)!;
  if (rejectCheckpoint) {
    expect(latest.submissionAttempts).toHaveLength(0);
    expect(screen.queryByText(/This session lost confirmation/)).not.toBeInTheDocument();
  }
  else {
    expect(latest.version).toBe(12);
    expect(latest.submissionAttempts).toHaveLength(1);
    expect(latest.submissionAttempts![0]).toMatchObject({ transactionId, intent: { circuit: "constructor", reportId: null }, deployment: mocks.selected });
    expect(latest.submissionAttempts![0]!.finalization).toBeNull();
    expect(screen.getByText("Deployment inputs saved with this attempt")).toBeInTheDocument();
    expect(screen.getByText(/This session lost confirmation/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reports" }));
    const deploy = screen.getByRole("button", { name: "Connect Lace and deploy program" });
    expect(deploy).toBeDisabled();
    await user.click(deploy);
    expect(mocks.wallet).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Connect Lace and verify program" })).not.toBeInTheDocument();
  }
}, 15_000);
