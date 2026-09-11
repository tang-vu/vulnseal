// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryInspection } from "./RecoveryInspection.js";
import * as recovery from "./recovery.js";
import * as storage from "./recovery-storage.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
import { defaultProgramDraft } from "./program.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const password = "Synthetic inspection password";
const enter = () => fireEvent.change(screen.getByLabelText("Inspection password"), { target: { value: password } });
it("inspects a real encrypted network browser copy without a provider and clears private contents", async () => {
  const { snapshot } = await recoveryFixture();
  const encrypted = await recovery.encryptRecovery({ ...snapshot, version: 5, mode: "midnight", network: "preprod", contractAddress: "ab".repeat(32), programDraft: defaultProgramDraft, pendingReport: null, uncertainTransition: null, attachmentDraft: null }, password);
  vi.spyOn(storage, "readStoredRecovery").mockResolvedValue({ id: "copy", label: "Combined recovery", revision: 1, updatedAt: new Date().toISOString(), encrypted });
  render(<RecoveryInspection selectedCopy="copy" />); enter();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Inspect selected browser copy" })); });
  expect(await screen.findByText(/Backup inspected locally/, {}, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByText(/Private vendor rationale/)).toBeInTheDocument();
  expect(screen.getByLabelText("Inspection password")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Clear inspected backup" }));
  expect(screen.queryByText(/Private vendor rationale/)).not.toBeInTheDocument();
}, 15000);
it.each(["clear", "unmount", "timeout"])("rejects a delayed file read after %s before starting crypto", async reason => {
  let finish!: (value: string) => void;
  const file = new File(["{}"], "backup.json");
  Object.defineProperty(file, "text", { value: () => new Promise<string>(resolve => { finish = resolve; }) });
  const decrypt = vi.spyOn(recovery, "decryptRecovery");
  const view = render(<RecoveryInspection selectedCopy="" />);
  fireEvent.change(screen.getByLabelText("Backup to inspect"), { target: { files: [file] } }); enter();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Inspect encrypted file" }));
  if (reason === "clear") fireEvent.click(screen.getByRole("button", { name: "Clear inspected backup" }));
  else if (reason === "unmount") view.unmount();
  else { await act(async () => vi.advanceTimersByTimeAsync(180000)); expect(screen.getByRole("alert")).toHaveTextContent("timed out"); }
  await act(async () => finish("{}"));
  expect(decrypt).not.toHaveBeenCalled();
  expect(screen.queryByText(/Backup inspected locally/)).not.toBeInTheDocument();
});
