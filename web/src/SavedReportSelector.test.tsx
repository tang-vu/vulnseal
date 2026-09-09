// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SavedReportSelector } from "./SavedReportSelector.js";
import { recoveryDraft, recoveryFixture } from "./test/recovery-fixture.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const disclosure = async (title: string, asset: string) => {
  const { snapshot } = await recoveryFixture({ ...recoveryDraft, title, affectedAsset: asset });
  return { network: "preprod", contractAddress: "ab".repeat(32), programId: snapshot.programId, reportId: snapshot.report!.id, envelope: snapshot.report!.envelope, key: snapshot.report!.key, salt: snapshot.report!.salt };
};

it("searches authenticated titles/assets while preserving selection and full report IDs", async () => {
  const first = await disclosure("Authorization bypass", "api.example.test"), second = await disclosure("Session expiry", "accounts.example.test");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const onChange = vi.fn();
  render(<SavedReportSelector reports={[first, second]} selectedId={first.reportId} onChange={onChange} />);
  expect(await screen.findByRole("option", { name: /Authorization bypass/ })).toHaveTextContent(first.reportId);
  fireEvent.change(screen.getByLabelText("Find saved reports"), { target: { value: "ACCOUNTS.EXAMPLE" } });
  expect(screen.getByText(/1 of 2 reports match/)).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Authorization bypass/ })).toHaveTextContent("selected; outside search");
  expect(screen.getByLabelText("Workspace report")).toHaveValue(first.reportId);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Workspace report"), { target: { value: second.reportId } });
  expect(onChange).toHaveBeenCalledWith(second.reportId);
  fireEvent.change(screen.getByLabelText("Find saved reports"), { target: { value: "not present" } });
  expect(screen.getByText(/0 of 2 reports match/)).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Session expiry/ })).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("never labels unauthenticated ciphertext and discards search state on remount", async () => {
  const saved = await disclosure("Authenticated title", "api.example.test");
  const broken = { ...saved, envelope: '{"title":"Injected title"}' };
  const view = render(<SavedReportSelector reports={[broken]} selectedId={saved.reportId} onChange={() => {}} />);
  expect(screen.queryByRole("option", { name: /Injected title/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Find saved reports"), { target: { value: saved.reportId } });
  expect(screen.getByText(/1 of 1 reports match/)).toBeInTheDocument();
  view.unmount();
  render(<SavedReportSelector reports={[saved]} selectedId={saved.reportId} onChange={() => {}} />);
  expect(screen.getByLabelText("Find saved reports")).toHaveValue("");
  await screen.findByRole("option", { name: /Authenticated title/ });
});
