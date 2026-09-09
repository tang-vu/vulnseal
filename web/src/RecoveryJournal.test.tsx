// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ decrypt: vi.fn() }));
vi.mock("./role-recovery.js", () => ({ decryptRoleVault: mocks.decrypt, MAX_ROLE_BACKUP_BYTES: 32 * 1024 * 1024 }));
import { RecoveryJournal } from "./RecoveryJournal.js";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("clearing the inspector prevents a late decryption from revealing its journal", async () => {
  let finish!: (value: unknown) => void;
  mocks.decrypt.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<RecoveryJournal />);
  const file = new File(["encrypted"], "backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => "encrypted" });
  fireEvent.change(screen.getByLabelText("Journal backup file"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Journal backup password"), { target: { value: "Journal inspector password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Read recovery journal" }).closest("form")!);
  await vi.waitFor(() => expect(mocks.decrypt).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Clear inspected journal" }));
  finish({ network: "preprod", contractAddress: "ab".repeat(32), submissionAttempts: [{ transactionId: "56".repeat(32), recordedAt: "2026-09-09T04:00:00.000Z" }] });
  await Promise.resolve();
  expect(screen.queryByText(/Backup network/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Journal backup password")).toHaveValue("");
});
