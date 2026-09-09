// SPDX-License-Identifier: Apache-2.0
import { createVulnSealPrivateState, pureCircuits, type Ledger, type ReportPreimage } from "@vulnseal/contract";
import { assertBytes32, bytesToHex, contractStatusName, type ReportStatusName } from "@vulnseal/shared";
import { VulnSealApi } from "./api.js";
import type { TransactionEvidence, VulnSealProviders } from "./types.js";

export type ActorRole = "vendor" | "researcher";
export type RoleIdentity = { readonly role: ActorRole; readonly programId: Uint8Array; readonly actorSecret: Uint8Array };
export type RoleCommand =
  | { readonly kind: "submitReport"; readonly report: ReportPreimage; readonly ciphertextDigest: Uint8Array }
  | { readonly kind: "beginTriage"; readonly reportId: Uint8Array }
  | { readonly kind: "acceptReport"; readonly reportId: Uint8Array; readonly severity: bigint; readonly decisionDigest: Uint8Array }
  | { readonly kind: "rejectReport"; readonly reportId: Uint8Array; readonly decisionDigest: Uint8Array }
  | { readonly kind: "anchorPatch"; readonly reportId: Uint8Array; readonly patchDigest: Uint8Array }
  | { readonly kind: "submitRetest"; readonly reportId: Uint8Array; readonly report: ReportPreimage; readonly patchCommitment: Uint8Array; readonly evidenceDigest: Uint8Array; readonly passed: boolean }
  | { readonly kind: "authorizePayout"; readonly reportId: Uint8Array; readonly rewardTier: bigint }
  | { readonly kind: "closeReport"; readonly reportId: Uint8Array };

const roles: Record<RoleCommand["kind"], ActorRole> = { submitReport: "researcher", submitRetest: "researcher", beginTriage: "vendor", acceptReport: "vendor", rejectReport: "vendor", anchorPatch: "vendor", authorizePayout: "vendor", closeReport: "vendor" };
const stages: Record<Exclude<RoleCommand["kind"], "submitReport">, readonly ReportStatusName[]> = { beginTriage: ["COMMITTED"], acceptReport: ["TRIAGED"], rejectReport: ["TRIAGED"], anchorPatch: ["ACCEPTED", "RETEST_FAILED"], submitRetest: ["PATCH_READY"], authorizePayout: ["RETEST_PASSED"], closeReport: ["REJECTED", "PAYOUT_AUTHORIZED"] };
const equal = (actual: Uint8Array, expected: Uint8Array, label: string) => {
  if (bytesToHex(actual) !== bytesToHex(expected)) throw new Error(`Role session does not match ${label}`);
};

/** One actor secret, fixed role, no authority switching or secret serialization. Contract checks remain authoritative. */
export class RoleSession {
  #api: VulnSealApi;
  #role: ActorRole;
  #programId: Uint8Array;
  #secret: Uint8Array;
  private constructor(api: VulnSealApi, identity: RoleIdentity) {
    if (identity.role !== "vendor" && identity.role !== "researcher") throw new Error("Unknown actor role");
    this.#api = api; this.#role = identity.role;
    this.#programId = assertBytes32(identity.programId, "programId");
    this.#secret = assertBytes32(identity.actorSecret, "actorSecret");
  }
  get role(): ActorRole { return this.#role; }
  get contractAddress(): string { return this.#api.contractAddress; }

  static async attach(api: VulnSealApi, identity: RoleIdentity): Promise<RoleSession> {
    const session = new RoleSession(api, identity);
    await session.readPublicState();
    return session;
  }
  static async join(providers: VulnSealProviders, contractAddress: string, identity: RoleIdentity): Promise<RoleSession> {
    if (!/^[a-f0-9]{64}$/.test(contractAddress)) throw new Error("Invalid contract address");
    const copied = structuredClone(identity);
    if (copied.role !== "vendor" && copied.role !== "researcher") throw new Error("Unknown actor role");
    assertBytes32(copied.programId, "programId");
    const api = await VulnSealApi.join(providers, contractAddress, createVulnSealPrivateState(copied.actorSecret));
    return RoleSession.attach(api, copied);
  }
  async readPublicState() {
    const snapshot = await this.#api.readPublicState();
    if (snapshot.contractAddress !== this.#api.contractAddress) throw new Error("Role session contract address mismatch");
    this.#verifyProgram(snapshot.ledger);
    return snapshot;
  }
  #verifyProgram(ledger: Ledger) {
    equal(ledger.programId, this.#programId, "the public program");
    if (this.#role === "vendor") equal(ledger.ownerKey, pureCircuits.deriveVendorKey(this.#programId, this.#secret), "vendor authority");
  }
  #preimage(report: ReportPreimage): ReportPreimage {
    const result = { programId: assertBytes32(report.programId, "report.programId"), canonicalDigest: assertBytes32(report.canonicalDigest, "report.canonicalDigest"), salt: assertBytes32(report.salt, "report.salt") };
    equal(result.programId, this.#programId, "the report program");
    return result;
  }

  async execute(input: RoleCommand): Promise<TransactionEvidence> {
    // Copy all byte arrays before awaiting a lock/read. No caller can swap subjects mid-proof.
    const command = structuredClone(input);
    if (!Object.hasOwn(roles, command.kind) || roles[command.kind] !== this.#role) throw new Error(`The ${this.#role} session cannot execute ${command.kind}`);
    const report = command.kind === "submitReport" || command.kind === "submitRetest" ? this.#preimage(command.report) : undefined;
    const reportId = command.kind === "submitReport" ? pureCircuits.deriveReportCommitment(report!.programId, report!.canonicalDigest, report!.salt) : assertBytes32(command.reportId, "reportId");
    if (command.kind === "submitReport") assertBytes32(command.ciphertextDigest, "ciphertextDigest");
    if (command.kind === "acceptReport" || command.kind === "rejectReport") assertBytes32(command.decisionDigest, "decisionDigest");
    if (command.kind === "acceptReport" && (typeof command.severity !== "bigint" || command.severity < 1n || command.severity > 4n)) throw new Error("Severity must be between 1 and 4");
    if (command.kind === "authorizePayout" && (typeof command.rewardTier !== "bigint" || command.rewardTier < 1n || command.rewardTier > 4n)) throw new Error("Reward tier must be between 1 and 4");
    if (command.kind === "submitRetest" && typeof command.passed !== "boolean") throw new Error("Retest result must be boolean");
    const state = createVulnSealPrivateState(this.#secret, report,
      command.kind === "anchorPatch" ? { reportId, patchDigest: assertBytes32(command.patchDigest, "patchDigest") } : undefined,
      command.kind === "submitRetest" ? { reportId, patchCommitment: assertBytes32(command.patchCommitment, "patchCommitment"), evidenceDigest: assertBytes32(command.evidenceDigest, "evidenceDigest") } : undefined);
    return this.#api.withPrivateState(state, async () => {
      const { ledger } = await this.readPublicState();
      if (command.kind === "submitReport") {
        if (ledger.reports.member(reportId)) throw new Error("Report commitment already exists");
      } else {
        if (!ledger.reports.member(reportId)) throw new Error("Report is absent from this program");
        const record = ledger.reports.lookup(reportId);
        equal(record.commitment, reportId, "the ledger report");
        if (!stages[command.kind].includes(contractStatusName(record.status))) throw new Error(`Cannot ${command.kind} at the current public report stage`);
        if (command.kind === "submitRetest") {
          equal(pureCircuits.deriveReportCommitment(report!.programId, report!.canonicalDigest, report!.salt), reportId, "the report preimage");
          equal(record.researcherKey, pureCircuits.deriveResearcherKey(this.#programId, reportId, this.#secret), "researcher authority");
          equal(record.patchCommitment, command.patchCommitment, "the current patch commitment");
        }
      }
      switch (command.kind) {
        case "submitReport": return this.#api.submitReport(command.ciphertextDigest);
        case "beginTriage": return this.#api.beginTriage(reportId);
        case "acceptReport": return this.#api.acceptReport(reportId, command.severity, command.decisionDigest);
        case "rejectReport": return this.#api.rejectReport(reportId, command.decisionDigest);
        case "anchorPatch": return this.#api.anchorPatch(reportId);
        case "submitRetest": return this.#api.submitRetest(reportId, command.passed);
        case "authorizePayout": return this.#api.authorizePayout(reportId, command.rewardTier);
        case "closeReport": return this.#api.closeReport(reportId);
      }
    });
  }
}
