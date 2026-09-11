// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

it.each(["sealed", "prepared", "invalid commitment"])("reads authenticated %s contents separately from the draft", async kind => {
  const { snapshot } = await recoveryFixture();
  const saved: recovery.RecoverySnapshot = kind === "prepared"
    ? { ...snapshot, version: 4, report: null, history: [], pendingReport: { report: snapshot.report!, submissionStarted: false }, uncertainTransition: null, attachmentDraft: null }
    : { ...snapshot, draft: { ...snapshot.draft, title: "Later editable draft" }, report: snapshot.report };
  if (kind === "invalid commitment") {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(async (algorithm, key, data) => {
      const plaintext = JSON.parse(new TextDecoder().decode(data));
      plaintext.report.id = "ff".repeat(32);
      return encrypt(algorithm, key, new TextEncoder().encode(JSON.stringify(plaintext)));
    });
  }
  const encrypted = await recovery.encryptRecovery(saved, password);
  vi.spyOn(storage, "readStoredRecovery").mockResolvedValue({ id: "copy", label: "Combined recovery", revision: 1, updatedAt: new Date().toISOString(), encrypted });
  render(<RecoveryInspection selectedCopy="copy" />); enter();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Inspect selected browser copy" })));
  if (kind === "invalid commitment") {
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent("does not match its commitment");
    expect(screen.queryByText("Read sealed report from backup")).not.toBeInTheDocument();
  } else {
    const details = (await screen.findByText(kind === "prepared" ? "Read prepared report from backup" : "Read sealed report from backup", {}, { timeout: 5000 })).closest("details")!;
    expect(within(details).getByText("Private vulnerability")).toBeInTheDocument();
    expect(within(details).queryByText("Later editable draft")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear inspected backup" }));
    expect(screen.queryByText("Private vulnerability")).not.toBeInTheDocument();
  }
}, 15000);

it("keeps source revision bound to the copy actually read when selection changes", async () => {
  const { snapshot } = await recoveryFixture();
  const encrypted = await recovery.encryptRecovery(snapshot, password);
  let finish!: (value: storage.StoredCopy) => void;
  const read = vi.spyOn(storage, "readStoredRecovery").mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<RecoveryInspection selectedCopy="original-copy" />); enter();
  fireEvent.click(screen.getByRole("button", { name: "Inspect selected browser copy" }));
  view.rerender(<RecoveryInspection selectedCopy="different-copy" />);
  await act(async () => finish({ id: "original-copy", label: "Combined recovery", revision: 7, updatedAt: "2026-09-11T00:00:00.000Z", encrypted }));
  const source = await screen.findByRole("region", { name: "Inspected backup source" }, { timeout: 5000 });
  expect(within(source).getByText("original-copy")).toBeInTheDocument();
  expect(within(source).getByText("7")).toBeInTheDocument();
  expect(within(source).queryByText("different-copy")).not.toBeInTheDocument();
  expect(read).toHaveBeenCalledExactlyOnceWith("original-copy");
  fireEvent.click(screen.getByRole("button", { name: "Clear inspected backup" }));
  expect(screen.queryByRole("region", { name: "Inspected backup source" })).not.toBeInTheDocument();
}, 15000);
