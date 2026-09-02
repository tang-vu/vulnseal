// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { VulnSealApi, createNodeProviders, type TransactionEvidence } from "@vulnseal/api";
import { ReportStatus, createVulnSealPrivateState, pureCircuits } from "@vulnseal/contract";
import { sha256, utf8 } from "@vulnseal/shared";
import { preprodConfig } from "./preprod-config.js";
import { preprodWalletProvider, startPreprodWallet } from "./preprod-wallet.js";

const bytes = (value: number): Uint8Array => new Uint8Array(32).fill(value);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const notZero = (value: Uint8Array): boolean => value.some((byte) => byte !== 0);
const required = (name: "MIDNIGHT_PREPROD_SEED" | "MIDNIGHT_STORAGE_PASSWORD"): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in integration/.env.preprod`);
  return value;
};

const run = async (): Promise<void> => {
  setNetworkId(preprodConfig.networkId);
  process.stdout.write("Synchronizing the gitignored Preprod test wallet; no secret values will be logged.\n");
  const wallet = await startPreprodWallet(
    required("MIDNIGHT_PREPROD_SEED"),
    required("MIDNIGHT_STORAGE_PASSWORD"),
  );
  const transactions: TransactionEvidence[] = [];
  try {
    const midnightWallet = await preprodWalletProvider(wallet);
    const providers = createNodeProviders({
      privateStateStoreName: path.join(repoRoot, "integration/.private-state/preprod-vulnseal"),
      privateStoragePasswordProvider: () => required("MIDNIGHT_STORAGE_PASSWORD"),
      accountId: wallet.unshieldedKeystore.getBech32Address().asString(),
      indexerHttpUrl: preprodConfig.indexerHttpUrl,
      indexerWsUrl: preprodConfig.indexerWsUrl,
      proofServerUrl: preprodConfig.proofServerUrl,
      zkConfigPath: path.join(repoRoot, "contract/src/managed/vulnseal"),
      walletProvider: midnightWallet,
      midnightProvider: midnightWallet,
    });
    const ownerSecret = bytes(0x2a);
    const researcherSecret = bytes(0x51);
    const programId = await sha256(utf8(`vulnseal-preprod-program:${Date.now()}`));
    const reportDigest = await sha256(utf8("vulnseal-preprod-encrypted-report-v1"));
    const reportSalt = bytes(0x73);
    const reportId = pureCircuits.deriveReportCommitment(programId, reportDigest, reportSalt);
    const deployed = await VulnSealApi.deploy(
      providers,
      createVulnSealPrivateState(ownerSecret),
      {
        programId,
        scopeDigest: await sha256(utf8("scope:preprod-wave-1-demo")),
        responsePolicyDigest: await sha256(utf8("response:7d")),
        responseDays: 7n,
        rewardPolicyDigest: await sha256(utf8("tiers:1-4")),
        disclosurePolicyDigest: await sha256(utf8("coordinated:90d")),
        disclosureDelayDays: 90n,
      },
    );
    transactions.push(deployed.evidence);
    const api = deployed.api;

    await api.usePrivateState(createVulnSealPrivateState(researcherSecret, {
      programId,
      canonicalDigest: reportDigest,
      salt: reportSalt,
    }));
    transactions.push(await api.submitReport(await sha256(utf8("ciphertext-envelope-preprod-v1"))));
    await api.usePrivateState(createVulnSealPrivateState(ownerSecret));
    transactions.push(await api.beginTriage(reportId));
    transactions.push(await api.acceptReport(reportId, 3n, await sha256(utf8("accepted:p2"))));

    const patchDigest = await sha256(utf8("release:preprod-wave-1-demo"));
    await api.usePrivateState(createVulnSealPrivateState(ownerSecret, undefined, {
      reportId,
      patchDigest,
    }));
    transactions.push(await api.anchorPatch(reportId));
    const patched = await api.readPublicState();
    const patchCommitment = patched.ledger.reports.lookup(reportId).patchCommitment;

    await api.usePrivateState(createVulnSealPrivateState(
      researcherSecret,
      { programId, canonicalDigest: reportDigest, salt: reportSalt },
      undefined,
      {
        reportId,
        patchCommitment,
        evidenceDigest: await sha256(utf8("retest:preprod-request-now-rejected")),
      },
    ));
    transactions.push(await api.submitRetest(reportId, true));
    await api.usePrivateState(createVulnSealPrivateState(ownerSecret));
    transactions.push(await api.authorizePayout(reportId, 3n));

    const final = await api.readPublicState();
    const record = final.ledger.reports.lookup(reportId);
    if (record.status !== ReportStatus.PAYOUT_AUTHORIZED || !record.retestPassed || !notZero(record.payoutReceipt)) {
      throw new Error("Preprod lifecycle did not satisfy the payout-authorization invariants");
    }
    const publicShape = Object.keys(record).sort();
    for (const forbidden of ["title", "summary", "reproductionSteps", "impact", "researcherContact", "salt"]) {
      if (publicShape.includes(forbidden)) throw new Error(`Private field leaked into public record: ${forbidden}`);
    }

    const output = {
      capturedAt: new Date().toISOString(),
      network: preprodConfig.networkId,
      evidenceKind: "real Midnight Preprod transactions and zero-knowledge proof-server requests",
      contractAddress: api.contractAddress,
      finalStatus: "PAYOUT_AUTHORIZED",
      publicRecordFields: publicShape,
      transactions,
      limitations: [
        "Payout authorization records workflow approval; it does not transfer funds.",
        "The report payload used for this public testnet ceremony is synthetic and contains no vulnerability.",
      ],
    };
    const directory = path.join(repoRoot, "docs/evidence");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "preprod-lifecycle.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await wallet.close();
  }
};

await run();
