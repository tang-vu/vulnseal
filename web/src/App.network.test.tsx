// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexToBytes, sha256, utf8 } from "@vulnseal/shared";
import { pureCircuits } from "@vulnseal/contract";
import { recoveryFixture } from "./test/recovery-fixture.js";
import { encryptRecovery } from "./recovery.js";
import { programConstructor } from "./program.js";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), deploy: vi.fn(), join: vi.fn() }));
vi.mock("./midnight/browser-providers.js", () => ({ initializeBrowserProviders: mocks.connect }));
vi.mock("@vulnseal/api/api", () => ({ VulnSealApi: { deploy: mocks.deploy, join: mocks.join } }));
import App from "./App.js";

describe("browser network workflow with mocked wallet and finalized API results", () => {
  beforeEach(() => {
    mocks.connect.mockReset().mockResolvedValue({});
    mocks.deploy.mockReset();
    mocks.join.mockReset();
    const store = new Map<string, string>();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        store.set(url, String(init.body));
        return new Response(JSON.stringify({ stored: true }), { status: 201 });
      }
      return new Response(store.get(url), { status: 200 });
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("restores network authority only after verification and uses ledger progress newer than the backup", async () => {
    const user = userEvent.setup();
    const { snapshot, sealed } = await recoveryFixture();
    const networkSnapshot = { ...snapshot, mode: "midnight" as const, network: "preprod", contractAddress: "ab".repeat(32) };
    const serialized = await encryptRecovery(networkSnapshot, "network recovery test password");
    const programId = hexToBytes(snapshot.programId);
    const reportId = hexToBytes(snapshot.report!.id);
    const record = { commitment: reportId, ciphertextDigest: sealed.ciphertextDigest, researcherKey: pureCircuits.deriveResearcherKey(programId, reportId, hexToBytes(snapshot.researcherSecret)), status: 4, severity: 4n, patchCommitment: new Uint8Array(32).fill(7), retestCommitment: new Uint8Array(32), payoutReceipt: new Uint8Array(32) };
    const ledger = { ...await programConstructor(programId, snapshot.policy), ownerKey: pureCircuits.deriveVendorKey(programId, hexToBytes(snapshot.vendorSecret)), reports: { member: () => true, lookup: () => record } };
    const api = {
      readPublicState: vi.fn().mockResolvedValueOnce({ ledger: { ...ledger, ownerKey: new Uint8Array(32) } }).mockResolvedValue({ ledger }),
      usePrivateState: vi.fn().mockResolvedValue(undefined),
      submitRetest: vi.fn().mockImplementation(async () => { record.status = 5; record.retestCommitment.fill(8); return { circuit: "submitRetest", txId: "restored-retest", blockHeight: "901" }; }),
    };
    mocks.join.mockResolvedValue(api);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Private recovery" }));
    const file = new File([serialized], "recovery.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serialized });
    await user.upload(screen.getByLabelText("Recovery file"), file);
    await user.type(screen.getByLabelText("Recovery password"), "network recovery test password");
    expect((screen.getByLabelText("Recovery file") as HTMLInputElement).files).toHaveLength(1);
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    expect(await screen.findByText("Recovery does not match the ledger: owner authority", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("Your report is sealed")).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Restore encrypted backup" }).closest("form")!);
    await screen.findByText("Recovered report · ledger checked");
    expect(mocks.join.mock.calls[1]![1]).toBe(networkSnapshot.contractAddress);
    expect(mocks.connect).toHaveBeenCalledWith("preprod");
    await user.click(screen.getAllByRole("button", { name: /Resolve/ })[0]!);
    await screen.findByRole("heading", { name: "Submit private retest evidence" });
    await user.click(screen.getByRole("button", { name: /Pass retest/ }));
    await screen.findByRole("button", { name: "Generate payout authorization" });
    expect(api.usePrivateState.mock.calls[0]![0].actorSecret).toEqual(hexToBytes(snapshot.researcherSecret));
    expect(api.usePrivateState.mock.calls[0]![0].report.salt).toEqual(hexToBytes(snapshot.report!.salt));
    expect(screen.getByText("Tier 4 · P1")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Verify/ })[0]!);
    expect(screen.getByText("Ledger state")).toBeInTheDocument();
    expect(screen.getByText("restored-retest")).toBeInTheDocument();
    expect(screen.queryByText("Finalized at block 202")).not.toBeInTheDocument();
  });

  it("requires deployment after wallet connection and does not upload a phantom network report", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    expect(await screen.findByText("Network setup required")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/ }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
    expect(await screen.findByText("Program not deployed")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Your report is sealed")).not.toBeInTheDocument();
  });

  it("keeps an existing local report local when connection is requested", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/ }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
    await screen.findByText("Your report is sealed");
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    expect(screen.getByText("Local report remains local")).toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(screen.getByText(/Guided local receipt/)).toBeInTheDocument();
  });

  it("uses form policies, random role secrets, selected severity and rationale, and exact transaction evidence", async () => {
    const user = userEvent.setup();
    const api = {
      usePrivateState: vi.fn().mockResolvedValue(undefined),
      submitReport: vi.fn().mockResolvedValue({ circuit: "submitReport", txId: "sealed-tx", blockHeight: "202" }),
      beginTriage: vi.fn().mockResolvedValue({ circuit: "beginTriage", txId: "triage-tx", blockHeight: "211" }),
      acceptReport: vi.fn().mockResolvedValue({ circuit: "acceptReport", txId: "accept-tx", blockHeight: "215" }),
      anchorPatch: vi.fn(),
      readPublicState: vi.fn().mockRejectedValueOnce(new Error("Indexer temporarily unavailable")),
    };
    mocks.deploy.mockResolvedValue({ api, evidence: { circuit: "constructor", txId: "deploy-tx", blockHeight: "100" } });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    await user.click(await screen.findByRole("button", { name: "Set up program" }));
    await user.clear(screen.getByLabelText("Program name"));
    await user.type(screen.getByLabelText("Program name"), "Independent Security");
    await user.selectOptions(screen.getByLabelText("First response target"), "2");
    await user.selectOptions(screen.getByLabelText("Coordinated disclosure window"), "30");
    await user.click(screen.getByRole("button", { name: "Create program" }));
    await screen.findByRole("heading", { name: "Independent Security" });
    const [, ownerState, constructor] = mocks.deploy.mock.calls[0]!;
    expect(constructor.responseDays).toBe(2n);
    expect(constructor.disclosureDelayDays).toBe(30n);
    expect(constructor.responsePolicyDigest).toEqual(await sha256(utf8(JSON.stringify({ responseDays: 2 }))));
    expect(ownerState.actorSecret).toHaveLength(32);
    expect(new Set(ownerState.actorSecret).size).toBeGreaterThan(1);
    await user.click(screen.getAllByRole("button", { name: /Submit/ })[0]!);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/ }));
    await screen.findByText("Your report is sealed");
    const researcher = api.usePrivateState.mock.calls[0]![0];
    expect(researcher.actorSecret).not.toEqual(ownerState.actorSecret);
    await user.click(screen.getByRole("button", { name: /Continue as vendor/ }));
    await user.click(await screen.findByRole("button", { name: "Begin authorized triage" }));
    await user.selectOptions(screen.getByLabelText("Public severity tier"), "1");
    await user.clear(screen.getByLabelText("Private rationale"));
    await user.type(screen.getByLabelText("Private rationale"), "Reproduced with minimal impact");
    await user.click(screen.getByRole("button", { name: "Accept as P4" }));
    await screen.findByRole("button", { name: "Continue to remediation" });
    expect(api.acceptReport.mock.calls[0]![1]).toBe(1n);
    expect(api.acceptReport.mock.calls[0]![2]).toEqual(await sha256(utf8("Reproduced with minimal impact")));
    await user.click(screen.getAllByRole("button", { name: /Verify/ })[0]!);
    const submitted = screen.getByText("sealed-tx").closest(".audit-event")!;
    expect(within(submitted as HTMLElement).getByText("Finalized at block 202")).toBeInTheDocument();
    expect(screen.queryByText("deploy-tx")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /No patch or passing retest is recorded yet/ })).toBeInTheDocument();
    expect(screen.queryByText("Reproduced with minimal impact")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Resolve/ })[0]!);
    let finishPatch!: (value: unknown) => void;
    api.anchorPatch.mockImplementation(() => new Promise((resolve) => { finishPatch = resolve; }));
    const anchor = screen.getByRole("button", { name: "Anchor patch commitment" });
    await user.dblClick(anchor);
    expect(api.anchorPatch).toHaveBeenCalledTimes(1);
    expect(anchor).toBeDisabled();
    await act(async () => { finishPatch({ circuit: "anchorPatch", txId: "patch-tx", blockHeight: "230" }); });
    const refresh = await screen.findByRole("button", { name: "Refresh public commitments" });
    await user.click(screen.getAllByRole("button", { name: /Verify/ })[0]!);
    expect(screen.getByText("patch-tx")).toBeInTheDocument();
    api.readPublicState.mockResolvedValue({ ledger: { reports: { lookup: () => ({ status: 4, patchCommitment: new Uint8Array(32).fill(9), retestCommitment: new Uint8Array(32), payoutReceipt: new Uint8Array(32) }) } } });
    await user.click(refresh);
    expect(api.anchorPatch).toHaveBeenCalledTimes(1);
    expect(api.readPublicState).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Refresh public commitments" })).not.toBeInTheDocument();
    expect(screen.getAllByText("patch-tx")).toHaveLength(1);
  });
});
