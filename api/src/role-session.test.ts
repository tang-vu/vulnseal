// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { createVulnSealPrivateState, pureCircuits, type VulnSealPrivateState } from "@vulnseal/contract";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { VulnSealSimulator } from "../../contract/src/test/vulnseal-simulator.js";
import { VulnSealApi } from "./api.js";
import { RoleSession, type RoleCommand } from "./role-session.js";

const bytes = (n: number) => new Uint8Array(32).fill(n);
const program = { programId: bytes(1), scopeDigest: bytes(2), responsePolicyDigest: bytes(3), responseDays: 7n, rewardPolicyDigest: bytes(4), disclosurePolicyDigest: bytes(5), disclosureDelayDays: 90n };
const preimage = { programId: program.programId, canonicalDigest: bytes(33), salt: bytes(44) };
const reportId = () => pureCircuits.deriveReportCommitment(preimage.programId, preimage.canonicalDigest, preimage.salt);

const setup = async () => {
  setNetworkId("undeployed");
  const simulator = new VulnSealSimulator(createVulnSealPrivateState(bytes(11)), program);
  let sequence = 0;
  const provider = { setContractAddress: vi.fn(), set: vi.fn(async (_id: string, value: VulnSealPrivateState) => { simulator.switchActor(value); }) };
  const calls: { kind: string; actor: Uint8Array }[] = [];
  const makeApi = () => {
    const names = ["submitReport", "beginTriage", "acceptReport", "rejectReport", "anchorPatch", "submitRetest", "authorizePayout", "closeReport"] as const;
    const callTx = Object.fromEntries(names.map((kind) => [kind, async (...args: unknown[]) => {
      calls.push({ kind, actor: new Uint8Array(simulator.getPrivateState().actorSecret) });
      if (kind === "closeReport") simulator.circuitContext = simulator.contract.impureCircuits.closeReport(simulator.circuitContext, args[0] as Uint8Array).context;
      else Reflect.apply(simulator[kind], simulator, args);
      return { public: { txId: (++sequence).toString(16).padStart(64, "0"), blockHeight: sequence } };
    }]));
    const api = Reflect.construct(VulnSealApi, [{ deployTxData: { public: { contractAddress: "ab".repeat(32) } }, callTx }, { privateStateProvider: provider }]) as VulnSealApi;
    vi.spyOn(api, "readPublicState").mockImplementation(async () => ({ contractAddress: api.contractAddress, ledger: simulator.getLedger() }));
    return api;
  };
  const vendorApi = makeApi(), researcherApi = makeApi();
  const vendor = await RoleSession.attach(vendorApi, { role: "vendor", programId: program.programId, actorSecret: bytes(11) });
  const researcher = await RoleSession.attach(researcherApi, { role: "researcher", programId: program.programId, actorSecret: bytes(22) });
  return { simulator, vendor, researcher, vendorApi, researcherApi, provider, calls };
};

it.each([new ArrayBuffer(32), new DataView(new ArrayBuffer(32)), new Uint16Array(16), { byteLength: 32, length: 32 }])("rejects malformed actor secrets before invoking the join SDK", async value => {
  const join = vi.spyOn(VulnSealApi, "join").mockRejectedValue(new Error("SDK must not be invoked"));
  try {
    await expect(RoleSession.join({} as Parameters<typeof RoleSession.join>[0], "ab".repeat(32), {
      role: "vendor", programId: bytes(1), actorSecret: value as unknown as Uint8Array,
    })).rejects.toThrow("actorSecret must be exactly 32 bytes");
    expect(join).not.toHaveBeenCalled();
  } finally { join.mockRestore(); }
});

describe("one-role transaction sessions", () => {
  it.each(["acceptReport", "authorizePayout"] as const)("rejects malformed %s tiers before private state, ledger reads or transactions", async (kind) => {
    const { vendor, vendorApi, provider, calls } = await setup();
    const privateState = vi.spyOn(vendorApi, "withPrivateState");
    vi.mocked(vendorApi.readPublicState).mockClear();
    const id = reportId();
    for (const value of [-1n, 0n, 5n, 255n, 256n, 1, 4, 1.5, NaN, Infinity, "1", true, null, undefined]) {
      // Runtime callers can bypass TypeScript; numeric coercion must not authorize a tier.
      const command = (kind === "acceptReport"
        ? { kind, reportId: id, severity: value, decisionDigest: bytes(66) }
        : { kind, reportId: id, rewardTier: value }) as unknown as RoleCommand;
      await expect(vendor.execute(command)).rejects.toThrow(kind === "acceptReport" ? "Severity" : "Reward tier");
    }
    expect(privateState).not.toHaveBeenCalled();
    expect(provider.set).not.toHaveBeenCalled();
    expect(vendorApi.readPublicState).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
  it("runs submission through closure using two fixed actor sessions and real generated circuits", async () => {
    const { vendor, researcher, simulator, calls } = await setup();
    const id = reportId();
    await researcher.execute({ kind: "submitReport", report: preimage, ciphertextDigest: bytes(55) });
    await vendor.execute({ kind: "beginTriage", reportId: id });
    await vendor.execute({ kind: "acceptReport", reportId: id, severity: 3n, decisionDigest: bytes(66) });
    await vendor.execute({ kind: "anchorPatch", reportId: id, patchDigest: bytes(77) });
    await researcher.execute({ kind: "submitRetest", reportId: id, report: preimage, patchCommitment: simulator.report(id).patchCommitment, evidenceDigest: bytes(88), passed: true });
    await vendor.execute({ kind: "authorizePayout", reportId: id, rewardTier: 3n });
    await vendor.execute({ kind: "closeReport", reportId: id });
    expect(simulator.report(id).status).toBe(8);
    for (const call of calls) expect(call.actor).toEqual(bytes(["submitReport", "submitRetest"].includes(call.kind) ? 22 : 11));
    expect(JSON.stringify(vendor)).toBe("{}");
    expect(JSON.stringify(researcher)).toBe("{}");
  });
  it("refuses wrong-role operations before installing witnesses or invoking any transaction", async () => {
    const { vendor, researcher, provider, calls } = await setup();
    const commands: RoleCommand[] = [
      { kind: "beginTriage", reportId: reportId() }, { kind: "acceptReport", reportId: reportId(), severity: 3n, decisionDigest: bytes(6) },
      { kind: "rejectReport", reportId: reportId(), decisionDigest: bytes(6) }, { kind: "anchorPatch", reportId: reportId(), patchDigest: bytes(7) },
      { kind: "authorizePayout", reportId: reportId(), rewardTier: 3n }, { kind: "closeReport", reportId: reportId() },
    ];
    for (const command of commands) await expect(researcher.execute(command)).rejects.toThrow("researcher session cannot");
    await expect(vendor.execute({ kind: "submitReport", report: preimage, ciphertextDigest: bytes(55) })).rejects.toThrow("vendor session cannot");
    await expect(vendor.execute({ kind: "submitRetest", reportId: reportId(), report: preimage, patchCommitment: bytes(7), evidenceDigest: bytes(8), passed: true })).rejects.toThrow("vendor session cannot");
    expect(provider.set).not.toHaveBeenCalled(); expect(calls).toHaveLength(0);
  });
  it("supports rejection/closure and failed-retest remediation through the same role boundaries", async () => {
    const { vendor, researcher, simulator } = await setup();
    const id = reportId();
    await researcher.execute({ kind: "submitReport", report: preimage, ciphertextDigest: bytes(55) });
    await vendor.execute({ kind: "beginTriage", reportId: id });
    await vendor.execute({ kind: "rejectReport", reportId: id, decisionDigest: bytes(66) });
    await vendor.execute({ kind: "closeReport", reportId: id });
    expect(simulator.report(id).status).toBe(8);
    const secondPreimage = { ...preimage, salt: bytes(45) };
    const second = pureCircuits.deriveReportCommitment(secondPreimage.programId, secondPreimage.canonicalDigest, secondPreimage.salt);
    await researcher.execute({ kind: "submitReport", report: secondPreimage, ciphertextDigest: bytes(56) });
    await vendor.execute({ kind: "beginTriage", reportId: second });
    await vendor.execute({ kind: "acceptReport", reportId: second, severity: 2n, decisionDigest: bytes(66) });
    await vendor.execute({ kind: "anchorPatch", reportId: second, patchDigest: bytes(77) });
    await researcher.execute({ kind: "submitRetest", reportId: second, report: secondPreimage, patchCommitment: simulator.report(second).patchCommitment, evidenceDigest: bytes(88), passed: false });
    await expect(vendor.execute({ kind: "authorizePayout", reportId: second, rewardTier: 2n })).rejects.toThrow("current public report stage");
    await vendor.execute({ kind: "anchorPatch", reportId: second, patchDigest: bytes(78) });
    await researcher.execute({ kind: "submitRetest", reportId: second, report: secondPreimage, patchCommitment: simulator.report(second).patchCommitment, evidenceDigest: bytes(89), passed: true });
    await vendor.execute({ kind: "authorizePayout", reportId: second, rewardTier: 2n });
    expect(simulator.report(second).status).toBe(7);
  });
  it("requires the vendor secret and program binding when attaching", async () => {
    const { vendorApi } = await setup();
    await expect(RoleSession.attach(vendorApi, { role: "vendor", programId: program.programId, actorSecret: bytes(99) })).rejects.toThrow("vendor authority");
    await expect(RoleSession.attach(vendorApi, { role: "researcher", programId: bytes(99), actorSecret: bytes(22) })).rejects.toThrow("public program");
  });
  it("rejects duplicate reports, premature actions, wrong researcher and stale patch evidence", async () => {
    const { vendor, researcher, researcherApi, simulator, calls } = await setup();
    const id = reportId();
    const submit = { kind: "submitReport" as const, report: preimage, ciphertextDigest: bytes(55) };
    await researcher.execute(submit);
    await expect(researcher.execute(submit)).rejects.toThrow("already exists");
    await expect(vendor.execute({ kind: "authorizePayout", reportId: id, rewardTier: 3n })).rejects.toThrow("current public report stage");
    await vendor.execute({ kind: "beginTriage", reportId: id });
    await vendor.execute({ kind: "acceptReport", reportId: id, severity: 3n, decisionDigest: bytes(66) });
    await vendor.execute({ kind: "anchorPatch", reportId: id, patchDigest: bytes(77) });
    const command = { kind: "submitRetest" as const, reportId: id, report: preimage, patchCommitment: simulator.report(id).patchCommitment, evidenceDigest: bytes(88), passed: true };
    const stranger = await RoleSession.attach(researcherApi, { role: "researcher", programId: program.programId, actorSecret: bytes(99) });
    await expect(stranger.execute(command)).rejects.toThrow("researcher authority");
    await expect(researcher.execute({ ...command, patchCommitment: bytes(99) })).rejects.toThrow("current patch");
    await expect(researcher.execute({ ...command, report: { ...preimage, salt: bytes(99) } })).rejects.toThrow("report preimage");
    expect(calls).toHaveLength(4);
  });
  it("copies identity bytes instead of retaining caller-owned authority arrays", async () => {
    const { vendorApi, researcherApi, calls } = await setup();
    const secret = bytes(22), id = bytes(1);
    const session = await RoleSession.attach(researcherApi, { role: "researcher", programId: id, actorSecret: secret });
    secret.fill(99); id.fill(99);
    await session.execute({ kind: "submitReport", report: preimage, ciphertextDigest: bytes(55) });
    expect(calls[0]!.actor).toEqual(bytes(22));
    const invalid = await RoleSession.attach(vendorApi, { role: "vendor", programId: program.programId, actorSecret: bytes(11) });
    await expect(invalid.execute({ kind: "acceptReport", reportId: reportId(), severity: 9n, decisionDigest: bytes(66) })).rejects.toThrow("Severity");
  });
  it("rechecks fresh ledger state for queued duplicate submissions and changed vendor authority", async () => {
    const { researcher, vendor, vendorApi, calls, simulator } = await setup();
    const command = { kind: "submitReport" as const, report: preimage, ciphertextDigest: bytes(55) };
    const outcomes = await Promise.allSettled([researcher.execute(command), researcher.execute(command)]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: new Error("Report commitment already exists") });
    vi.mocked(vendorApi.readPublicState).mockResolvedValue({ contractAddress: vendorApi.contractAddress, ledger: { ...simulator.getLedger(), ownerKey: bytes(99) } });
    await expect(vendor.execute({ kind: "beginTriage", reportId: reportId() })).rejects.toThrow("vendor authority");
    expect(calls).toHaveLength(1);
  });
  it("rejects malformed input without blocking later provider operations", async () => {
    const { vendorApi, provider } = await setup();
    const malformed = { ...createVulnSealPrivateState(bytes(11)), unexpected: () => {} };
    await expect(vendorApi.withPrivateState(malformed, async () => undefined)).rejects.toThrow();
    provider.set.mockRejectedValueOnce(new Error("Private storage unavailable"));
    await expect(vendorApi.withPrivateState(createVulnSealPrivateState(bytes(11)), async () => undefined)).rejects.toThrow("Private storage unavailable");
    await expect(vendorApi.withPrivateState(createVulnSealPrivateState(bytes(22)), async () => "released")).resolves.toBe("released");
  });
  it("serializes private state across API instances sharing a provider and releases failed operations", async () => {
    const { vendorApi, researcherApi, simulator } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const seen: number[] = [];
    const first = vendorApi.withPrivateState(createVulnSealPrivateState(bytes(11)), async () => { started(); await gate; seen.push(simulator.getPrivateState().actorSecret[0]!); throw new Error("proof failure"); });
    const failed = expect(first).rejects.toThrow("proof failure");
    await ready;
    const pendingState = createVulnSealPrivateState(bytes(22));
    const second = researcherApi.withPrivateState(pendingState, async () => { seen.push(simulator.getPrivateState().actorSecret[0]!); });
    pendingState.actorSecret.fill(99);
    release(); await failed; await second;
    expect(seen).toEqual([11, 22]);
    await vendorApi.withPrivateState(createVulnSealPrivateState(bytes(33)), async () => { expect(simulator.getPrivateState().actorSecret).toEqual(bytes(33)); });
  });
});

it.each([new ArrayBuffer(32), new DataView(new ArrayBuffer(32)), new Uint16Array(16), { byteLength: 32, length: 32 }])("rejects non-byte runtime command fields before private-state installation", async value => {
  const { vendor, researcher, vendorApi, researcherApi, provider, calls } = await setup();
  const vendorPrivate = vi.spyOn(vendorApi, "withPrivateState"), researcherPrivate = vi.spyOn(researcherApi, "withPrivateState");
  vi.mocked(vendorApi.readPublicState).mockClear(); vi.mocked(researcherApi.readPublicState).mockClear();
  await expect(vendor.execute({ kind: "beginTriage", reportId: value } as unknown as RoleCommand)).rejects.toThrow("reportId must be exactly 32 bytes");
  await expect(researcher.execute({ kind: "submitReport", report: preimage, ciphertextDigest: value } as unknown as RoleCommand)).rejects.toThrow("ciphertextDigest must be exactly 32 bytes");
  expect(vendorPrivate).not.toHaveBeenCalled(); expect(researcherPrivate).not.toHaveBeenCalled();
  expect(provider.set).not.toHaveBeenCalled(); expect(calls).toHaveLength(0);
  expect(vendorApi.readPublicState).not.toHaveBeenCalled(); expect(researcherApi.readPublicState).not.toHaveBeenCalled();
});
