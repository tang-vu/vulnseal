// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recoveryFixture } from "./test/recovery-fixture.js";
const mocks = vi.hoisted(() => ({ decrypt: vi.fn(), connect: vi.fn(), join: vi.fn(), read: vi.fn(), verify: vi.fn() }));
vi.mock("./recovery.js", async original => ({ ...await original<typeof import("./recovery.js")>(), decryptRecovery: mocks.decrypt, verifyRecoveryLedger: mocks.verify }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.connect }));
vi.mock("@vulnseal/api/api", () => ({ VulnSealApi: { join: mocks.join } }));
import App from "./App.js";
beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const stages = ["decrypt", "connect", "join", "read", "verify"] as const;
it.each(stages.flatMap(stage => ["unmount", "timeout", "elapsed clock", "elapsed monotonic clock"].map(reason => ({ stage, reason }))))("rejects late $stage recovery after $reason", async ({ stage, reason }) => {
  const { snapshot: source } = await recoveryFixture();
  const snapshot = { ...source, mode: "midnight", network: "preprod", contractAddress: "ab".repeat(32), report: null, history: [] };
  const values = { decrypt: { snapshot }, connect: {}, join: { contractAddress: snapshot.contractAddress, readPublicState: mocks.read }, read: { ledger: {} }, verify: undefined };
  for (const name of stages) mocks[name].mockResolvedValue(values[name]);
  let finish!: () => void;
  mocks[stage].mockImplementation(() => new Promise(resolve => { finish = () => resolve(values[stage]); }));
  const timers = vi.spyOn(globalThis, "setTimeout");
  const view = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Private recovery" }));
  const file = new File(["synthetic"], "session.json"); Object.defineProperty(file, "text", { value: async () => "synthetic" });
  fireEvent.change(screen.getByLabelText("Recovery file"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "Synthetic restore password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  if (reason === "unmount") view.unmount();
  if (reason === "timeout") await act(async () => (timers.mock.calls.find(([, duration]) => duration === 180_000)![0] as () => void)());
  if (reason === "elapsed clock") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 180_001);
  if (reason === "elapsed monotonic clock") {
    vi.spyOn(performance, "now").mockReturnValue(performance.now() + 180_001);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() - 60_000);
  }
  await act(async () => finish());
  const next = stages[stages.indexOf(stage) + 1];
  if (next) expect(mocks[next]).not.toHaveBeenCalled();
  if (reason !== "unmount") {
    expect(screen.queryByRole("button", { name: "Lace connected" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Seal a vulnerability report" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Private recovery timed out");
    expect(screen.getByLabelText("Recovery password")).toHaveValue("Synthetic restore password");
    expect(screen.getByRole("button", { name: "Restore encrypted backup" })).toBeEnabled();
  }
});
