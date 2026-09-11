// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { hexToBytes } from "@vulnseal/shared";
import * as recovery from "./role-recovery.js";
import type { Disclosure } from "./handoff.js";
import { recoveryFixture } from "./test/recovery-fixture.js";
import { submissionReceipt } from "./submission-receipt.js";
const mocks = vi.hoisted(() => ({ join: vi.fn(), accept: undefined as undefined | ((value: Disclosure) => Promise<void>) }));
vi.mock("./role-network.js", () => ({ joinRoleVault: mocks.join }));
vi.mock("./HandoffPanel.js", () => ({ HandoffPanel: (props: { onDisclosure?: (value: Disclosure) => Promise<void> }) => { mocks.accept = props.onDisclosure; return null; } }));
import { RoleWorkspace } from "./RoleWorkspace.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); mocks.join.mockReset(); mocks.accept = undefined; });
async function setup() {
  const { snapshot, sealed } = await recoveryFixture();
  const input: Disclosure = { network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, ...{ envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt } };
  const vault: recovery.RoleVault = { version: 1, role: "vendor", network: input.network, contractAddress: input.contractAddress, programId: input.programId, actorSecret: snapshot.vendorSecret, reports: [] };
  vi.spyOn(recovery, "decryptRoleVault").mockResolvedValue(vault);
  const commitment = hexToBytes(input.reportId), researcherKey = new Uint8Array(32).fill(5);
  const record = { commitment, ciphertextDigest: sealed.ciphertextDigest, researcherKey, submissionReceipt: submissionReceipt(commitment, sealed.ciphertextDigest, researcherKey), status: 0 };
  const state = { ledger: { reports: { member: vi.fn(() => true), lookup: () => record } } };
  const read = vi.fn().mockResolvedValue(state);
  mocks.join.mockResolvedValue({ session: { readPublicState: read }, snapshot: state });
  const view = render(<RoleWorkspace />);
  const file = new File(["encrypted"], "role.json"); Object.defineProperty(file, "text", { value: async () => "encrypted" });
  fireEvent.change(screen.getByLabelText("Single-role backup file"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Role restore password"), { target: { value: "Synthetic acceptance password" } });
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Restore role workspace" }).closest("form")!));
  return { input, record, read, state, view, accept: mocks.accept! };
}
it.each(["valid", "absent", "commitment", "ciphertextDigest", "submissionReceipt"])("accepts only matching disclosure ledger bindings: %s", async kind => {
  const { input, record, state, accept } = await setup();
  if (kind === "absent") state.ledger.reports.member.mockReturnValue(false);
  else if (kind !== "valid") record[kind as "commitment" | "ciphertextDigest" | "submissionReceipt"] = new Uint8Array(32);
  if (kind === "valid") {
    await act(async () => accept(input));
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByText(`Report: ${input.reportId}`)).toBeInTheDocument();
  } else {
    await act(async () => { await expect(accept(input)).rejects.toThrow(/ledger|receipt/); });
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.queryByText(`Report: ${input.reportId}`)).not.toBeInTheDocument();
  }
});
it.each(["timeout", "unmount"])("rejects a ledger result after %s before validating or installing the merged vault", async ending => {
  const { input, state, read, view, accept } = await setup();
  let finish!: (value: typeof state) => void;
  read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const validate = vi.spyOn(recovery, "validateRoleVault"), timers = vi.spyOn(globalThis, "setTimeout");
  let pending!: Promise<void>;
  await act(async () => { pending = accept(input); });
  const outcome = expect(pending).rejects.toThrow(ending === "timeout" ? /timed out/ : /session closed/);
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  if (ending === "timeout") {
    const callback = timers.mock.calls.find(([, delay]) => delay === 180000)![0] as () => void;
    await act(async () => { callback(); await outcome; });
  } else view.unmount();
  await act(async () => { finish(state); await outcome; });
  expect(validate).not.toHaveBeenCalled();
  expect(state.ledger.reports.member).not.toHaveBeenCalled();
});
